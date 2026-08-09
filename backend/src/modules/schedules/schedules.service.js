const { query } = require('../../config/db')
const audit = require('../../lib/audit')
const { getNextOccurrences, getNextOccurrence } = require('../../utils/recurrence.calculator')
const { rollForwardToWorkday } = require('../../utils/workday.util')
const { buildPeriodLabel, docPeriodOffset } = require('../../utils/periodLabel')
const { createTaskForOccurrence, loadHolidaySet } = require('../../jobs/taskGenerator.job')
const { parseISO, format, addDays, addMonths } = require('date-fns')

function midnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// Trần "ngày N hàng tháng": kiểm tra HẠN DỰ KIẾN của kỳ kế tiếp có vượt ngày N không.
// Bắt lỗi ngay khi lưu lịch / đặt trần → auto-gen luôn hợp lệ (không phải kẹp trong generator).
function assertOffsetWithinCap(recurrenceType, recurrenceConfig, offsetDays, maxDueDay) {
  if (maxDueDay == null) return
  const ref = addDays(new Date(new Date().setHours(0, 0, 0, 0)), -1)
  const occ = getNextOccurrence(recurrenceType, recurrenceConfig, ref)
  if (!occ) return
  const due = addDays(occ, offsetDays || 0)
  const y = due.getFullYear(), m = due.getMonth() + 1
  const capDay = Math.min(maxDueDay, new Date(y, m, 0).getDate())
  const dueStr = format(due, 'yyyy-MM-dd')
  const ceiling = `${y}-${String(m).padStart(2, '0')}-${String(capDay).padStart(2, '0')}`
  if (dueStr > ceiling) {
    const [, mm, dd] = ceiling.split('-')
    throw Object.assign(
      new Error(`Hạn dự kiến (${format(due, 'dd/MM/yyyy')}) vượt trần ngày ${maxDueDay} hàng tháng (tối đa ${dd}/${mm}). Giảm Deadline offset (hoặc trần ngày) cho phù hợp.`),
      { status: 422 },
    )
  }
}

function toDto(row) {
  return {
    id:                 row.id,
    companyId:          row.company_id,
    taskTypeId:         row.task_type_id,
    taskTypeName:       row.task_type_name ?? null,
    assignedStaffId:    row.assigned_staff_id ?? null,
    assignedStaffName:  row.staff_name ?? null,
    recurrenceType:     row.recurrence_type,
    recurrenceConfig:   row.recurrence_config,
    deadlineOffsetDays: row.deadline_offset_days,
    overrideSlaDays:    row.override_sla_days ?? null,
    maxDueDay:          row.max_due_day ?? null,   // trần "ngày N hàng tháng" do admin đặt
    excludedStepIds:    Array.isArray(row.excluded_step_ids) ? row.excluded_step_ids : [],
    notes:              row.notes ?? null,
    isActive:           row.is_active,
    lastGeneratedAt:    row.last_generated_at ?? null,
    createdBy:          row.created_by,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
    sortOrder:          row.sort_order ?? 0,
  }
}

async function assertCompanyExists(companyId) {
  const { rows: [c] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
}

// Admin: toàn quyền. Staff: chỉ thao tác lịch của công ty MÌNH phụ trách (assigned_staff_id).
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền thao tác lịch của công ty này'), { status: 403 })
  }
}

// Lấy company_id của 1 lịch (để check quyền cho các thao tác theo schedule id)
async function getScheduleCompanyId(id) {
  const { rows: [s] } = await query('SELECT company_id FROM customer_task_schedules WHERE id = $1', [id])
  if (!s) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  return s.company_id
}

async function getScheduleById(id) {
  const { rows: [row] } = await query(
    `SELECT s.*, tt.name AS task_type_name, u.name AS staff_name
     FROM customer_task_schedules s
     JOIN task_types tt ON tt.id = s.task_type_id
     LEFT JOIN users u  ON u.id  = s.assigned_staff_id
     WHERE s.id = $1`,
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  return toDto(row)
}

async function listSchedules(companyId) {
  await assertCompanyExists(companyId)
  const { rows } = await query(
    `SELECT s.*, tt.name AS task_type_name, u.name AS staff_name
     FROM customer_task_schedules s
     JOIN task_types tt ON tt.id = s.task_type_id
     LEFT JOIN users u  ON u.id  = s.assigned_staff_id
     WHERE s.company_id = $1
     ORDER BY s.sort_order ASC, s.created_at DESC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createSchedule(companyId, data, user, ipAddress, userAgent) {
  await assertCompanyAccess(companyId, user)   // admin hoặc staff phụ trách công ty
  const actorId = user.id

  const {
    taskTypeId, assignedStaffId, recurrenceType, recurrenceConfig,
    deadlineOffsetDays = 0, overrideSlaDays, excludedStepIds = [], notes,
  } = data

  const { rows: [tt] } = await query('SELECT id FROM task_types WHERE id = $1 AND is_active = TRUE', [taskTypeId])
  if (!tt) throw Object.assign(new Error('Task type not found or inactive'), { status: 404 })

  const { rows: [schedule] } = await query(
    `INSERT INTO customer_task_schedules
       (company_id, task_type_id, assigned_staff_id, recurrence_type, recurrence_config,
        deadline_offset_days, override_sla_days, excluded_step_ids, notes, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM customer_task_schedules WHERE company_id = $1),$10)
     RETURNING *`,
    [
      companyId, taskTypeId, assignedStaffId ?? null,
      recurrenceType, JSON.stringify(recurrenceConfig),
      deadlineOffsetDays, overrideSlaDays ?? null,
      JSON.stringify(Array.isArray(excludedStepIds) ? excludedStepIds : []),
      notes ?? null, actorId,
    ]
  )

  await audit.log({
    userId: actorId, action: 'schedule.created',
    targetType: 'schedule', targetId: schedule.id,
    meta: { companyId, taskTypeId, recurrenceType }, ipAddress, userAgent,
  })

  return getScheduleById(schedule.id)
}

async function updateSchedule(id, data, user, ipAddress, userAgent) {
  await assertCompanyAccess(await getScheduleCompanyId(id), user)
  const actorId = user.id

  // Trần "ngày N": chặn nếu offset/chu kỳ mới làm hạn dự kiến vượt ngày N của lịch.
  const { rows: [cur] } = await query('SELECT * FROM customer_task_schedules WHERE id = $1', [id])
  if (!cur) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  if (cur.max_due_day != null) {
    const effType   = data.recurrenceType   ?? cur.recurrence_type
    const effConfig = data.recurrenceConfig ?? cur.recurrence_config
    const effOffset = data.deadlineOffsetDays ?? cur.deadline_offset_days
    assertOffsetWithinCap(effType, effConfig, effOffset, cur.max_due_day)
  }

  const fieldMap = {
    assignedStaffId:    'assigned_staff_id',
    recurrenceType:     'recurrence_type',
    deadlineOffsetDays: 'deadline_offset_days',
    overrideSlaDays:    'override_sla_days',
    notes:              'notes',
    sortOrder:          'sort_order',
  }

  const updates = []
  const params = []

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  if (data.recurrenceConfig !== undefined) {
    params.push(JSON.stringify(data.recurrenceConfig))
    updates.push(`recurrence_config = $${params.length}`)
  }
  if (data.excludedStepIds !== undefined) {
    params.push(JSON.stringify(Array.isArray(data.excludedStepIds) ? data.excludedStepIds : []))
    updates.push(`excluded_step_ids = $${params.length}`)
  }

  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE customer_task_schedules SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length} RETURNING id`,
    params
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  await audit.log({
    userId: actorId, action: 'schedule.updated',
    targetType: 'schedule', targetId: id, meta: data, ipAddress, userAgent,
  })

  return getScheduleById(id)
}

async function deleteSchedule(id, user, ipAddress, userAgent) {
  const { rows: [schedule] } = await query('SELECT id, company_id FROM customer_task_schedules WHERE id = $1', [id])
  if (!schedule) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  await assertCompanyAccess(schedule.company_id, user)
  const actorId = user.id

  const { rows: [taskCount] } = await query(
    'SELECT COUNT(*) FROM tasks WHERE customer_task_schedule_id = $1',
    [id]
  )
  if (parseInt(taskCount.count, 10) > 0) {
    throw Object.assign(new Error('Cannot delete schedule that has already generated tasks'), { status: 409 })
  }

  await query('DELETE FROM customer_task_schedules WHERE id = $1', [id])

  await audit.log({
    userId: actorId, action: 'schedule.deleted',
    targetType: 'schedule', targetId: id, ipAddress, userAgent,
  })
}

async function toggleSchedule(id, user, ipAddress, userAgent) {
  await assertCompanyAccess(await getScheduleCompanyId(id), user)
  const actorId = user.id
  const { rows: [row] } = await query(
    `UPDATE customer_task_schedules SET is_active = NOT is_active, updated_at = NOW()
     WHERE id = $1 RETURNING id, is_active`,
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  await audit.log({
    userId: actorId,
    action: row.is_active ? 'schedule.activated' : 'schedule.deactivated',
    targetType: 'schedule', targetId: id, ipAddress, userAgent,
  })

  return getScheduleById(id)
}

async function previewSchedule(id, count = 10) {
  const { rows: [row] } = await query(
    'SELECT recurrence_type, recurrence_config FROM customer_task_schedules WHERE id = $1',
    [id]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  const occurrences = getNextOccurrences(row.recurrence_type, row.recurrence_config, new Date(), count)
  // Ngày dự kiến hiển thị = ngày bắt đầu thực tế (đã đẩy khỏi CN/lễ) — khớp với task sinh ra.
  const { rows: hol } = await query("SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d FROM public_holidays")
  const holidaySet = new Set(hol.map(r => r.d))
  return occurrences.map(ds => format(rollForwardToWorkday(parseISO(ds), holidaySet), 'yyyy-MM-dd'))
}

// ── Luồng 2 — Console tập trung: overview theo LỊCH + đặt trần "ngày N hàng tháng" ─

// Danh sách LỊCH định kỳ đang chạy (kèm công ty, loại CV, phụ trách, trần ngày N).
// Frontend gộp nhóm theo công ty.
async function getRecurringOverview() {
  const { rows } = await query(
    `SELECT cts.id AS schedule_id, cts.max_due_day, cts.recurrence_type,
            c.id AS company_id, c.name AS company_name, c.business_type,
            tt.name AS task_type_name,
            u.name AS assigned_staff_name
       FROM customer_task_schedules cts
       JOIN companies c   ON c.id  = cts.company_id
       JOIN task_types tt ON tt.id = cts.task_type_id
       LEFT JOIN users u  ON u.id  = cts.assigned_staff_id
      WHERE cts.is_active = TRUE AND c.status = 'active'
      ORDER BY c.name, tt.name`
  )
  return rows.map(r => ({
    scheduleId:        r.schedule_id,
    companyId:         r.company_id,
    companyName:       r.company_name,
    businessType:      r.business_type ?? null,   // loại hình DN — để lọc theo enum/nhóm
    taskTypeName:      r.task_type_name,
    recurrenceType:    r.recurrence_type,
    assignedStaffName: r.assigned_staff_name ?? null,
    maxDueDay:         r.max_due_day ?? null,
  }))
}

// Đặt/xoá trần "ngày N hàng tháng" cho 1 LỊCH định kỳ (admin). null/'' = xoá trần.
async function setScheduleMaxDueDay(scheduleId, maxDueDay) {
  const day = (maxDueDay === '' || maxDueDay === null || maxDueDay === undefined) ? null : Number(maxDueDay)
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) {
    throw Object.assign(new Error('Ngày trần phải là số nguyên 1–31'), { status: 422 })
  }
  // Đặt trần phải tương thích với deadline offset hiện tại của lịch (bắt lỗi ngay).
  if (day !== null) {
    const { rows: [sch] } = await query(
      'SELECT recurrence_type, recurrence_config, deadline_offset_days FROM customer_task_schedules WHERE id = $1',
      [scheduleId],
    )
    if (!sch) throw Object.assign(new Error('Schedule not found'), { status: 404 })
    assertOffsetWithinCap(sch.recurrence_type, sch.recurrence_config, sch.deadline_offset_days, day)
  }
  const { rows: [row] } = await query(
    `UPDATE customer_task_schedules SET max_due_day = $2, updated_at = NOW()
      WHERE id = $1 RETURNING id, max_due_day`,
    [scheduleId, day]
  )
  if (!row) throw Object.assign(new Error('Schedule not found'), { status: 404 })
  return { scheduleId: row.id, maxDueDay: row.max_due_day ?? null }
}

// ── Sinh bù kỳ (admin) ───────────────────────────────────────────────────────
// Đối chiếu kỳ "đáng lẽ phải có" (theo công thức lặp) vs kỳ "đã có task"
// (theo period_label trong bảng tasks) → tìm kỳ THIẾU để admin sinh bù.

// Liệt kê các occurrence (ngày phát sinh GỐC) trong khoảng [from, to] (bao gồm 2 đầu).
function enumerateOccurrences(type, config, from, to) {
  const out = []
  const toM = midnight(to)
  let cursor = addDays(midnight(from), -1)   // -1 để from tự nó lọt vào
  let safety = 5000
  while (safety-- > 0) {
    const next = getNextOccurrence(type, config, cursor)
    if (!next) break
    if (midnight(next) > toM) break
    out.push(midnight(next))
    cursor = next
  }
  return out
}

// Bảng đối chiếu kỳ của 1 lịch: mỗi occurrence ≤ hôm nay → nhãn kỳ + start/due + đã-có-task?
// months: cửa sổ lùi tối đa (mặc định 6). Không đề xuất kỳ TRƯỚC khi lịch tồn tại.
async function getSchedulePeriods(scheduleId, { months = 6 } = {}) {
  const m = Math.max(1, Math.min(24, Number(months) || 6))
  const { rows: [sch] } = await query(
    `SELECT s.*, tt.name AS task_type_name, c.name AS company_name
       FROM customer_task_schedules s
       JOIN task_types tt ON tt.id = s.task_type_id
       JOIN companies c   ON c.id  = s.company_id
      WHERE s.id = $1`,
    [scheduleId]
  )
  if (!sch) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  const today = midnight(new Date())
  const from = addMonths(today, -m)
  // Mốc bắt đầu lịch (start_date trong config, hoặc ngày tạo lịch) — KHÔNG chặn cứng,
  // chỉ để ĐÁNH DẤU kỳ phát sinh trước mốc này (beforeStart) → không tự tích, tránh
  // sinh nhầm; nhưng vẫn hiện để admin chủ động chọn khi thật sự cần.
  const cfgStart   = sch.recurrence_config?.start_date ? midnight(parseISO(sch.recurrence_config.start_date)) : null
  const createdAt  = sch.created_at ? midnight(sch.created_at) : null
  const scheduleStart = cfgStart || createdAt || from

  const occ = enumerateOccurrences(sch.recurrence_type, sch.recurrence_config, from, today)

  // Task đã có của lịch → map theo period_label
  const { rows: existingTasks } = await query(
    `SELECT id, period_label, title, status FROM tasks WHERE customer_task_schedule_id = $1`,
    [scheduleId]
  )
  const byLabel = new Map()
  for (const t of existingTasks) if (!byLabel.has(t.period_label)) byLabel.set(t.period_label, t)

  const holidaySet = await loadHolidaySet()
  const offset = docPeriodOffset(sch.recurrence_config)

  const periods = occ.map((d) => {
    const periodLabel = buildPeriodLabel(sch.recurrence_type, d, offset)
    const existing = byLabel.get(periodLabel) || null
    return {
      forDate:        format(d, 'yyyy-MM-dd'),
      periodLabel,
      startDate:      format(rollForwardToWorkday(d, holidaySet), 'yyyy-MM-dd'),
      dueDate:        format(rollForwardToWorkday(addDays(d, sch.deadline_offset_days || 0), holidaySet), 'yyyy-MM-dd'),
      exists:         !!existing,
      existingTaskId: existing?.id ?? null,
      existingTitle:  existing?.title ?? null,
      existingStatus: existing?.status ?? null,
      beforeStart:    midnight(d) < scheduleStart,   // kỳ phát sinh trước khi lịch tồn tại
    }
  }).reverse()   // kỳ mới nhất lên đầu

  return {
    scheduleId,
    companyName:  sch.company_name,
    taskTypeName: sch.task_type_name,
    recurrenceType: sch.recurrence_type,
    periodOffset: offset,
    scheduleStart: format(scheduleStart, 'yyyy-MM-dd'),
    months: m,
    // "kỳ thiếu" (badge) = thiếu VÀ trong phạm vi lịch (không tính kỳ trước khi tạo lịch)
    missingCount: periods.filter((p) => !p.exists && !p.beforeStart).length,
    periods,
  }
}

// Sinh task cho các kỳ được chọn. periods = mảng ngày phát sinh 'yyyy-MM-dd'.
// force=false → bỏ qua kỳ đã có task (an toàn, mặc định).
// force=true  → sinh lại kể cả kỳ đã có (dùng cho ca đặc biệt; có thể tạo task trùng nhãn).
async function backfillPeriods(scheduleId, { periods = [], force = false }, user, ipAddress, userAgent) {
  if (!Array.isArray(periods) || periods.length === 0) {
    throw Object.assign(new Error('Chưa chọn kỳ nào để sinh'), { status: 422 })
  }
  const { rows: [sch] } = await query(
    `SELECT s.*, tt.name AS task_type_name, tt.default_sla_days
       FROM customer_task_schedules s
       JOIN task_types tt ON tt.id = s.task_type_id
      WHERE s.id = $1`,
    [scheduleId]
  )
  if (!sch) throw Object.assign(new Error('Schedule not found'), { status: 404 })

  const holidaySet = await loadHolidaySet()
  const created = []
  const skipped = []
  for (const p of periods) {
    const d = parseISO(p)
    if (Number.isNaN(d.getTime())) continue
    const res = await createTaskForOccurrence(sch, d, holidaySet, { force: !!force })
    if (res.status === 'created') {
      created.push({ forDate: p, periodLabel: res.periodLabel, taskId: res.task.id, title: res.task.title, dueDate: res.task.dueDate })
    } else {
      skipped.push({ forDate: p, periodLabel: res.periodLabel, existingTaskId: res.existingId })
    }
  }
  // CHỦ Ý: KHÔNG đụng last_generated_at — tránh làm lệch cadence của cron cho kỳ hiện tại.

  await audit.log({
    userId: user.id, action: 'schedule.backfill',
    targetType: 'schedule', targetId: scheduleId,
    meta: { force: !!force, requested: periods.length, created: created.length, skipped: skipped.length },
    ipAddress, userAgent,
  })

  return { created, skipped }
}

module.exports = {
  listSchedules, getScheduleById, createSchedule,
  updateSchedule, deleteSchedule, toggleSchedule, previewSchedule,
  getRecurringOverview, setScheduleMaxDueDay,
  getSchedulePeriods, backfillPeriods,
}
