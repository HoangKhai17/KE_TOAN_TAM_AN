const { query } = require('../../config/db')
const ExcelJS = require('exceljs')
const { getNextOccurrence } = require('../../utils/recurrence.calculator')
const { applyStandardStyle } = require('../export/excel-renderer')
const enums = require('../../lib/enums')

// ── RBAC: phạm vi TASK của NHÂN SỰ (khớp Dashboard/Tasks) ─────────────────────
// Staff chỉ thấy: việc ĐƯỢC GIAO cho mình, HOẶC thuộc công ty mình PHỤ TRÁCH
// (trừ task 'private'), HOẶC được nhờ HỖ TRỢ. `p` = placeholder '$N' chứa userId.
function staffTaskScope(alias, p) {
  const a = alias ? `${alias}.` : ''
  return `(${a}assigned_to = ${p}
      OR (${a}visibility <> 'private' AND ${a}company_id IN (SELECT id FROM companies WHERE assigned_staff_id = ${p}))
      OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = ${a}id AND tc.user_id = ${p}))`
}
const isStaffRole = (user) => Boolean(user && user.role === 'staff')

// ── 0. Overview ───────────────────────────────────────────────────────────────

async function overviewReport({ from, to, prevFrom, prevTo, user }) {
  const hasPrev = Boolean(prevFrom && prevTo)

  // RBAC: staff chỉ thấy phạm vi của mình ($3 = userId). Admin = toàn bộ.
  const isStaff = isStaffRole(user)
  const scope  = isStaff ? ` AND ${staffTaskScope('', '$3')}` : ''
  const scopeT = isStaff ? ` AND ${staffTaskScope('t', '$3')}` : ''
  const pCur  = isStaff ? [from, to, user.id] : [from, to]
  const pPrev = isStaff ? [prevFrom, prevTo, user.id] : [prevFrom, prevTo]

  // Lọc KỲ = OVERLAP khoảng ngày hiệu lực của task với [from,to] — ĐỒNG BỘ Dashboard/Tasks
  // (thay cho created_at cũ). $1 = from, $2 = to.
  const OVERLAP   = `(COALESCE(start_date, due_date) <= $2 AND COALESCE(due_date, start_date) >= $1)`
  const OVERLAP_T = `(COALESCE(t.start_date, t.due_date) <= $2 AND COALESCE(t.due_date, t.start_date) >= $1)`
  const statCols = `
        COUNT(*)                                                                    AS total,
        COUNT(*) FILTER (WHERE status = 'completed')                               AS completed,
        COUNT(*) FILTER (WHERE status = 'pending')                                 AS pending,
        COUNT(*) FILTER (WHERE status = 'in_progress')                             AS in_progress,
        COUNT(*) FILTER (WHERE status = 'on_hold')                                 AS on_hold,
        COUNT(*) FILTER (WHERE status = 'pending_review')                          AS pending_review,
        COUNT(*) FILTER (WHERE status = 'needs_revision')                          AS needs_revision,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed')  AS overdue`

  const [curStats, prevStats, trend, prevTrend, byTaskType, byStatus, byAssignee] = await Promise.all([
    query(`SELECT ${statCols} FROM tasks WHERE ${OVERLAP}${scope}`, pCur),

    hasPrev
      ? query(`SELECT ${statCols} FROM tasks WHERE ${OVERLAP}${scope}`, pPrev)
      : Promise.resolve({ rows: [{}] }),

    // Xu hướng = việc HOÀN THÀNH theo NGÀY (completed_at) trong kỳ — khớp biểu đồ Dashboard
    query(`
      SELECT completed_at::date AS date, COUNT(*) AS completed
      FROM tasks WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2${scope}
      GROUP BY completed_at::date ORDER BY date
    `, pCur),

    hasPrev
      ? query(`
          SELECT completed_at::date AS date, COUNT(*) AS completed
          FROM tasks WHERE status = 'completed' AND completed_at::date BETWEEN $1 AND $2${scope}
          GROUP BY completed_at::date ORDER BY date
        `, pPrev)
      : Promise.resolve({ rows: [] }),

    query(`
      SELECT tt.name AS label,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.status = 'completed') AS completed
      FROM tasks t
      LEFT JOIN task_types tt ON tt.id = t.task_type_id
      WHERE ${OVERLAP_T}${scopeT}
      GROUP BY tt.id, tt.name ORDER BY total DESC LIMIT 10
    `, pCur),

    query(`
      SELECT status AS label, COUNT(*) AS total
      FROM tasks WHERE ${OVERLAP}${scope}
      GROUP BY status ORDER BY total DESC
    `, pCur),

    query(`
      SELECT u.name AS label,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.status = 'completed') AS completed,
        ROUND(COUNT(*) FILTER (WHERE t.status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS rate
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE ${OVERLAP_T}${scopeT}
      GROUP BY u.id, u.name ORDER BY total DESC LIMIT 10
    `, pCur),
  ])

  // ── Thống kê THEO LOẠI VIỆC (Truyền thống / Yêu cầu KH / Nội bộ) — đủ 3 loại như Dashboard ──
  // Truyền thống: overlap start/due. CDR/IA: theo deadline_date trong kỳ (2 loại này chỉ có 1 mốc hạn).
  // Scope theo vai trò: CDR (staff = mình tạo), IA (staff = mình là người nhận)
  const cdrScope = isStaff ? ` AND requested_by = $3` : ''
  const iaScope  = isStaff ? ` AND EXISTS (SELECT 1 FROM internal_assignment_assignees iaa WHERE iaa.assignment_id = internal_assignments.id AND iaa.user_id = $3)` : ''
  const [tradD, cdrD, iaD] = await Promise.all([
    query(`SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'completed') AS completed,
             COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed') AS overdue
           FROM tasks WHERE ${OVERLAP}${scope}`, pCur),
    query(`SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'received') AS completed,
             COUNT(*) FILTER (WHERE deadline_date < CURRENT_DATE AND status NOT IN ('received','not_required')) AS overdue
           FROM client_document_requests WHERE deadline_date BETWEEN $1 AND $2${cdrScope}`, pCur),
    query(`SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'done') AS completed,
             COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled') AND deadline_date < CURRENT_DATE) AS overdue
           FROM internal_assignments WHERE deadline_date BETWEEN $1 AND $2 AND status <> 'cancelled'${iaScope}`, pCur),
  ])
  const domRow = (res, key, label) => {
    const r = res.rows[0] || {}
    return { key, label, total: parseInt(r.total, 10) || 0, completed: parseInt(r.completed, 10) || 0, overdue: parseInt(r.overdue, 10) || 0 }
  }
  const byDomain = [
    domRow(tradD, 'traditional', 'Truyền thống'),
    domRow(cdrD,  'cdr',         'Yêu cầu KH'),
    domRow(iaD,   'ia',          'Nội bộ'),
  ]

  const c = curStats.rows[0] || {}
  const p = prevStats.rows[0] || {}

  function pctChange(cur, prev) {
    const cv = parseInt(cur, 10) || 0
    const pv = parseInt(prev, 10) || 0
    if (pv === 0) return cv > 0 ? 100 : 0
    return Math.round((cv - pv) * 100 / pv)
  }

  return {
    stats: {
      total:     { value: parseInt(c.total, 10) || 0,     change: hasPrev ? pctChange(c.total, p.total) : null },
      completed: { value: parseInt(c.completed, 10) || 0, change: hasPrev ? pctChange(c.completed, p.completed) : null },
      pending:   { value: parseInt(c.pending, 10) || 0,   change: hasPrev ? pctChange(c.pending, p.pending) : null },
      inProgress:    { value: parseInt(c.in_progress, 10) || 0,    change: hasPrev ? pctChange(c.in_progress, p.in_progress) : null },
      onHold:        { value: parseInt(c.on_hold, 10) || 0,        change: hasPrev ? pctChange(c.on_hold, p.on_hold) : null },
      pendingReview: { value: parseInt(c.pending_review, 10) || 0, change: hasPrev ? pctChange(c.pending_review, p.pending_review) : null },
      needsRevision: { value: parseInt(c.needs_revision, 10) || 0, change: hasPrev ? pctChange(c.needs_revision, p.needs_revision) : null },
      overdue:   { value: parseInt(c.overdue, 10) || 0,   change: hasPrev ? pctChange(c.overdue, p.overdue) : null },
    },
    trend:      trend.rows.map((r) => ({ date: r.date, total: parseInt(r.completed, 10), completed: parseInt(r.completed, 10) })),
    prevTrend:  prevTrend.rows.map((r) => ({ date: r.date, total: parseInt(r.completed, 10), completed: parseInt(r.completed, 10) })),
    byTaskType: byTaskType.rows.map((r) => ({ label: r.label || '(Không có)', total: parseInt(r.total, 10), completed: parseInt(r.completed, 10) })),
    byStatus:   byStatus.rows.map((r) => ({ label: r.label, total: parseInt(r.total, 10) })),
    byAssignee: byAssignee.rows.map((r) => ({ label: r.label || '(Không có)', total: parseInt(r.total, 10), completed: parseInt(r.completed, 10), rate: parseFloat(r.rate) || 0 })),
    byDomain,
  }
}

// ── 1. Staff Performance ──────────────────────────────────────────────────────

async function staffPerformance({ from, to, staffIds, user }) {
  const params = [from, to]
  let staffFilter = ''
  if (staffIds && staffIds.length) {
    params.push(staffIds)
    staffFilter = `AND u.id = ANY($${params.length})`
  }
  // RBAC: staff chỉ thấy CHÍNH MÌNH
  if (isStaffRole(user)) {
    params.push(user.id)
    staffFilter += ` AND u.id = $${params.length}`
  }

  // ĐỒNG BỘ Dashboard/Tasks: lọc KỲ theo OVERLAP + đếm theo TRẠNG THÁI.
  //   total = việc thuộc kỳ (mọi trạng thái); completed = trong kỳ & status='completed';
  //   on_time = trong kỳ, đã xong, completed_at <= due_date; overdue = trong kỳ & quá hạn & chưa xong.
  const wl = `(COALESCE(t.start_date, t.due_date) <= $2 AND COALESCE(t.due_date, t.start_date) >= $1)`
  const { rows } = await query(`
    SELECT
      u.id, u.name, u.job_title,
      COUNT(t.id) FILTER (WHERE ${wl})                                             AS total,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.status = 'completed')                  AS completed,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.status = 'completed' AND t.completed_at::date <= t.due_date) AS on_time,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.due_date < CURRENT_DATE AND t.status != 'completed') AS overdue,
      ROUND(COALESCE(AVG(t.actual_hours) FILTER (WHERE ${wl} AND t.status = 'completed' AND t.actual_hours > 0), 0), 1) AS avg_hours,
      ROUND(COUNT(t.id) FILTER (WHERE ${wl} AND t.status = 'completed') * 100.0
            / NULLIF(COUNT(t.id) FILTER (WHERE ${wl}), 0), 1)                       AS completion_rate
    FROM users u
    LEFT JOIN tasks t ON t.assigned_to = u.id
    -- Gồm cả admin: admin cũng được giao việc / phụ trách công ty như nhân viên
    WHERE u.role IN ('staff', 'admin') AND u.status = 'active' ${staffFilter}
    GROUP BY u.id, u.name, u.job_title
    ORDER BY completed DESC, total DESC
  `, params)

  return rows.map((r) => ({
    id:             r.id,
    name:           r.name,
    jobTitle:       r.job_title,
    total:          parseInt(r.total, 10),
    completed:      parseInt(r.completed, 10),
    onTime:         parseInt(r.on_time, 10),
    overdue:        parseInt(r.overdue, 10),
    avgHours:       parseFloat(r.avg_hours),
    completionRate: parseFloat(r.completion_rate) || 0,
  }))
}

// ── 2. Company Status ─────────────────────────────────────────────────────────

async function companyStatus({ from, to, companyIds, user }) {
  const params = [from, to]
  let companyFilter = ''
  if (companyIds && companyIds.length) {
    params.push(companyIds)
    companyFilter = `AND c.id = ANY($${params.length})`
  }
  // RBAC: staff chỉ thấy công ty MÌNH PHỤ TRÁCH
  if (isStaffRole(user)) {
    params.push(user.id)
    companyFilter += ` AND c.assigned_staff_id = $${params.length}`
  }

  // ĐỒNG BỘ Dashboard/Tasks: lọc KỲ theo OVERLAP + đếm theo TRẠNG THÁI.
  //   total = việc thuộc kỳ; completed = trong kỳ & xong; open = trong kỳ & chưa xong;
  //   overdue = trong kỳ & quá hạn & chưa xong. (total = completed + open)
  const wl = `(COALESCE(t.start_date, t.due_date) <= $2 AND COALESCE(t.due_date, t.start_date) >= $1)`
  const { rows } = await query(`
    SELECT
      c.id, c.name, c.tax_code,
      COUNT(t.id) FILTER (WHERE ${wl})                                             AS total,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.status = 'completed')                  AS completed,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.status != 'completed')                 AS open_count,
      COUNT(t.id) FILTER (WHERE ${wl} AND t.due_date < CURRENT_DATE AND t.status != 'completed') AS overdue,
      ROUND(COUNT(t.id) FILTER (WHERE ${wl} AND t.status = 'completed') * 100.0
            / NULLIF(COUNT(t.id) FILTER (WHERE ${wl}), 0), 1)                       AS completion_rate
    FROM companies c
    LEFT JOIN tasks t ON t.company_id = c.id
    WHERE c.status != 'terminated' ${companyFilter}
    GROUP BY c.id, c.name, c.tax_code
    ORDER BY total DESC
  `, params)

  return rows.map((r) => ({
    id:             r.id,
    name:           r.name,
    taxCode:        r.tax_code,
    total:          parseInt(r.total, 10),
    completed:      parseInt(r.completed, 10),
    open:           parseInt(r.open_count, 10),
    overdue:        parseInt(r.overdue, 10),
    completionRate: parseFloat(r.completion_rate) || 0,
  }))
}

// ── 3. SLA Compliance ─────────────────────────────────────────────────────────

async function slaCompliance({ from, to, groupBy = 'staff', user }) {
  // GROUP BY id (không phải tên) để không gộp nhầm 2 thực thể trùng tên
  const allowedGroups = {
    staff:     { id: 'u.id',  label: 'u.name' },
    company:   { id: 'c.id',  label: 'c.name' },
    task_type: { id: 'tt.id', label: 'tt.name' },
  }
  const g = allowedGroups[groupBy] || allowedGroups.staff
  const labelExpr = g.label

  // RBAC: staff chỉ tính trên task trong phạm vi của mình
  const params = [from, to]
  let scopeSql = ''
  if (isStaffRole(user)) { params.push(user.id); scopeSql = ` AND ${staffTaskScope('t', '$' + params.length)}` }

  const { rows } = await query(`
    SELECT
      ${labelExpr} AS label,
      COUNT(*)                                                                                      AS total,
      COUNT(*) FILTER (WHERE t.completed_at::date <= t.due_date)                                   AS on_time,
      COUNT(*) FILTER (WHERE t.completed_at::date BETWEEN t.due_date + 1 AND t.due_date + 3)       AS late_1_3,
      COUNT(*) FILTER (WHERE t.completed_at::date > t.due_date + 3)                                AS late_more,
      ROUND(COUNT(*) FILTER (WHERE t.completed_at::date <= t.due_date) * 100.0 / NULLIF(COUNT(*), 0), 1) AS sla_rate
    FROM tasks t
    LEFT JOIN users      u  ON u.id  = t.assigned_to
    LEFT JOIN companies  c  ON c.id  = t.company_id
    LEFT JOIN task_types tt ON tt.id = t.task_type_id
    WHERE t.status = 'completed'
      AND t.completed_at >= $1::date AND t.completed_at < ($2::date + INTERVAL '1 day')
      AND t.due_date IS NOT NULL${scopeSql}
    GROUP BY ${g.id}, ${labelExpr}
    ORDER BY total DESC
    LIMIT 20
  `, params)

  return rows.map((r) => ({
    label:    r.label || '(Không có)',
    total:    parseInt(r.total, 10),
    onTime:   parseInt(r.on_time, 10),
    late1_3:  parseInt(r.late_1_3, 10),
    lateMore: parseInt(r.late_more, 10),
    slaRate:  parseFloat(r.sla_rate) || 0,
  }))
}

// ── 4. Aging (open tasks sorted by age) ──────────────────────────────────────

async function aging({ assignedTo, companyId, user }) {
  const params = []
  const conds = [`t.status != 'completed'`]

  if (assignedTo) { params.push(assignedTo); conds.push(`t.assigned_to = $${params.length}`) }
  if (companyId)  { params.push(companyId);  conds.push(`t.company_id  = $${params.length}`) }
  // RBAC: staff chỉ thấy việc trong phạm vi của mình
  if (isStaffRole(user)) { params.push(user.id); conds.push(staffTaskScope('t', `$${params.length}`)) }

  const where = conds.join(' AND ')

  const { rows } = await query(`
    SELECT
      t.id, t.title, t.status, t.priority, t.due_date, t.created_at,
      c.name  AS company_name,
      u.name  AS assigned_to_name,
      tt.name AS task_type_name,
      (CURRENT_DATE - t.created_at::date)::int AS days_open,
      GREATEST((CURRENT_DATE - t.due_date)::int, 0) AS days_overdue
    FROM tasks t
    LEFT JOIN companies  c  ON c.id  = t.company_id
    LEFT JOIN users      u  ON u.id  = t.assigned_to
    LEFT JOIN task_types tt ON tt.id = t.task_type_id
    WHERE ${where}
    ORDER BY days_open DESC
    LIMIT 200
  `, params)

  return rows.map((r) => ({
    id:             r.id,
    title:          r.title,
    status:         r.status,
    priority:       r.priority,
    dueDate:        r.due_date,
    createdAt:      r.created_at,
    companyName:    r.company_name,
    assignedToName: r.assigned_to_name,
    taskTypeName:   r.task_type_name,
    daysOpen:       r.days_open,
    daysOverdue:    r.days_overdue,
  }))
}

// ── 5. Velocity ───────────────────────────────────────────────────────────────

async function velocity({ from, to, period = 'week', user }) {
  const allowedPeriods = ['week', 'month']
  const pg_period = allowedPeriods.includes(period) ? period : 'week'

  // RBAC: staff chỉ thấy việc mình hoàn thành ($1=period, $2=from, $3=to, $4=userId)
  const params = [pg_period, from, to]
  let scopeSql = ''
  if (isStaffRole(user)) { params.push(user.id); scopeSql = ` AND ${staffTaskScope('', '$' + params.length)}` }

  const { rows } = await query(`
    SELECT
      DATE_TRUNC($1, completed_at)::date AS period,
      COUNT(*) AS completed,
      ROUND(AVG(
        CASE WHEN created_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400
        END
      ), 1) AS avg_days_to_complete
    FROM tasks
    WHERE status = 'completed'
      AND completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day')${scopeSql}
    GROUP BY period
    ORDER BY period
  `, params)

  return rows.map((r) => ({
    period:             r.period,
    completed:          parseInt(r.completed, 10),
    avgDaysToComplete:  parseFloat(r.avg_days_to_complete) || 0,
  }))
}

// ── 6. Forecast ───────────────────────────────────────────────────────────────

async function forecast({ month, year, user }) {
  const targetMonth = parseInt(month, 10)
  const targetYear  = parseInt(year, 10)

  // RBAC: staff chỉ dự báo lịch của công ty MÌNH PHỤ TRÁCH (hoặc lịch giao cho mình)
  const params = []
  let scopeSql = ''
  if (isStaffRole(user)) {
    params.push(user.id)
    scopeSql = ` AND (c.assigned_staff_id = $${params.length} OR cs.assigned_staff_id = $${params.length})`
  }

  const { rows: schedules } = await query(`
    SELECT
      cs.id, cs.recurrence_type, cs.recurrence_config,
      cs.deadline_offset_days, cs.last_generated_at, cs.override_sla_days,
      tt.name AS task_type_name, tt.group_name,
      c.name  AS company_name,
      u.name  AS assigned_to_name
    FROM customer_task_schedules cs
    JOIN task_types tt ON tt.id = cs.task_type_id
    JOIN companies  c  ON c.id  = cs.company_id
    LEFT JOIN users u  ON u.id  = cs.assigned_staff_id
    WHERE cs.is_active = TRUE
      AND c.status != 'terminated'${scopeSql}
    ORDER BY c.name, tt.name
  `, params)

  const result = []
  const monthStart = new Date(targetYear, targetMonth - 1, 1)
  const monthEnd = new Date(targetYear, targetMonth, 0)
  monthStart.setHours(0, 0, 0, 0)
  monthEnd.setHours(23, 59, 59, 999)

  function toDateString(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  for (const s of schedules) {
    const lastGenerated = s.last_generated_at ? new Date(s.last_generated_at) : null
    const cursorStart = lastGenerated && lastGenerated > monthStart ? lastGenerated : new Date(monthStart)
    cursorStart.setDate(cursorStart.getDate() - 1)

    let cursor = cursorStart
    let safety = 370
    while (safety-- > 0) {
      try {
        const triggerDate = getNextOccurrence(
          s.recurrence_type,
          s.recurrence_config,
          cursor
        )
        if (!triggerDate || triggerDate > monthEnd) break

        if (triggerDate >= monthStart) {
          const dueDate = new Date(triggerDate)
          dueDate.setDate(dueDate.getDate() + (s.deadline_offset_days || 0))
          result.push({
            scheduleId:       s.id,
            taskTypeName:     s.task_type_name,
            groupName:        s.group_name,
            companyName:      s.company_name,
            assignedToName:   s.assigned_to_name,
            triggerDate:      toDateString(triggerDate),
            dueDate:          toDateString(dueDate),
            deadlineOffset:   s.deadline_offset_days || 0,
          })
        }

        cursor = triggerDate
      } catch { break /* skip invalid schedule */ }
    }
  }

  return result.sort((a, b) => a.triggerDate.localeCompare(b.triggerDate))
}

// ── Export helpers ────────────────────────────────────────────────────────────

function styleHeader(sheet) {
  const headerRow = sheet.getRow(1)
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height    = 22
}

async function exportToExcel(type, data) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'

  if (type === 'staff') {
    const ws = wb.addWorksheet('Hiệu Suất Nhân Sự')
    ws.columns = [
      { header: 'Nhân viên',       key: 'name',           width: 24 },
      { header: 'Chức danh',       key: 'jobTitle',        width: 18 },
      { header: 'Tổng CV',         key: 'total',           width: 10 },
      { header: 'Hoàn thành',      key: 'completed',       width: 12 },
      { header: 'Đúng hạn',        key: 'onTime',          width: 10 },
      { header: 'Quá hạn',         key: 'overdue',         width: 10 },
      { header: 'Giờ TB',          key: 'avgHours',        width: 10 },
      { header: 'Tỷ lệ HT (%)',    key: 'completionRate',  width: 14 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)

  } else if (type === 'company') {
    const ws = wb.addWorksheet('Tình Trạng Khách Hàng')
    ws.columns = [
      { header: 'Công ty',         key: 'name',           width: 30 },
      { header: 'MST',             key: 'taxCode',        width: 16 },
      { header: 'Tổng CV',         key: 'total',          width: 10 },
      { header: 'Hoàn thành',      key: 'completed',      width: 12 },
      { header: 'Đang mở',         key: 'open',           width: 10 },
      { header: 'Quá hạn',         key: 'overdue',        width: 10 },
      { header: 'Tỷ lệ HT (%)',    key: 'completionRate', width: 14 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)

  } else if (type === 'sla') {
    const ws = wb.addWorksheet('Tuân Thủ SLA')
    ws.columns = [
      { header: 'Nhóm',            key: 'label',    width: 28 },
      { header: 'Tổng CV',         key: 'total',    width: 10 },
      { header: 'Đúng hạn',        key: 'onTime',   width: 10 },
      { header: 'Trễ 1-3 ngày',    key: 'late1_3',  width: 14 },
      { header: 'Trễ >3 ngày',     key: 'lateMore', width: 13 },
      { header: 'SLA Rate (%)',     key: 'slaRate',  width: 13 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)

  } else if (type === 'aging') {
    const ws = wb.addWorksheet('Tồn Đọng')
    ws.columns = [
      { header: 'Công việc',       key: 'title',           width: 36 },
      { header: 'Công ty',         key: 'companyName',     width: 24 },
      { header: 'Nhân viên',       key: 'assignedToName',  width: 18 },
      { header: 'Loại CV',         key: 'taskTypeName',    width: 18 },
      { header: 'Trạng thái',      key: 'status',          width: 14 },
      { header: 'Ưu tiên',         key: 'priority',        width: 10 },
      { header: 'Hết hạn',         key: 'dueDate',         width: 12 },
      { header: 'Số ngày mở',      key: 'daysOpen',        width: 12 },
      { header: 'Số ngày quá hạn', key: 'daysOverdue',     width: 16 },
    ]
    // Phân giải nhãn trạng thái/ưu tiên theo danh mục động (khách tự đặt) — tránh ghi mã thô
    const stMap = Object.fromEntries((await enums.getOptions('task_status')).map((o) => [o.key, o.label]))
    const prMap = Object.fromEntries((await enums.getOptions('task_priority')).map((o) => [o.key, o.label]))
    data.forEach((r) => ws.addRow({ ...r, status: stMap[r.status] ?? r.status, priority: prMap[r.priority] ?? r.priority }))
    styleHeader(ws)

  } else if (type === 'velocity') {
    const ws = wb.addWorksheet('Hiệu Suất')
    ws.columns = [
      { header: 'Kỳ',              key: 'period',             width: 14 },
      { header: 'Hoàn thành',      key: 'completed',          width: 12 },
      { header: 'TB ngày xử lý',   key: 'avgDaysToComplete',  width: 16 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)

  } else if (type === 'forecast') {
    const ws = wb.addWorksheet('Dự Báo')
    ws.columns = [
      { header: 'Công ty',         key: 'companyName',    width: 28 },
      { header: 'Loại CV',         key: 'taskTypeName',   width: 24 },
      { header: 'Nhóm',            key: 'groupName',      width: 18 },
      { header: 'Nhân viên',       key: 'assignedToName', width: 18 },
      { header: 'Ngày kích hoạt',  key: 'triggerDate',    width: 16 },
      { header: 'Hết hạn dự kiến', key: 'dueDate',        width: 16 },
    ]
    data.forEach((r) => ws.addRow(r))
    styleHeader(ws)
  }

  wb.worksheets.forEach((ws) => applyStandardStyle(ws, { headerRows: 1 }))
  return wb.xlsx.writeBuffer()
}

module.exports = {
  overviewReport,
  staffPerformance,
  companyStatus,
  slaCompliance,
  aging,
  velocity,
  forecast,
  exportToExcel,
}
