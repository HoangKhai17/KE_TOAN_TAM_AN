const { query } = require('../../config/db')
const ExcelJS = require('exceljs')
const { shouldGenerateToday } = require('../../utils/recurrence.calculator')

// ── 0. Overview ───────────────────────────────────────────────────────────────

async function overviewReport({ from, to, prevFrom, prevTo }) {
  const hasPrev = Boolean(prevFrom && prevTo)

  const [curStats, prevStats, trend, prevTrend, byTaskType, byStatus, byAssignee] = await Promise.all([
    query(`
      SELECT
        COUNT(*)                                                                    AS total,
        COUNT(*) FILTER (WHERE status = 'completed')                               AS completed,
        COUNT(*) FILTER (WHERE status != 'completed')                              AS pending,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed')  AS overdue
      FROM tasks WHERE created_at BETWEEN $1 AND $2
    `, [from, to]),

    hasPrev
      ? query(`
          SELECT
            COUNT(*)                                                                    AS total,
            COUNT(*) FILTER (WHERE status = 'completed')                               AS completed,
            COUNT(*) FILTER (WHERE status != 'completed')                              AS pending,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status != 'completed')  AS overdue
          FROM tasks WHERE created_at BETWEEN $1 AND $2
        `, [prevFrom, prevTo])
      : Promise.resolve({ rows: [{}] }),

    query(`
      SELECT created_at::date AS date,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed
      FROM tasks WHERE created_at BETWEEN $1 AND $2
      GROUP BY created_at::date ORDER BY date
    `, [from, to]),

    hasPrev
      ? query(`
          SELECT created_at::date AS date,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'completed') AS completed
          FROM tasks WHERE created_at BETWEEN $1 AND $2
          GROUP BY created_at::date ORDER BY date
        `, [prevFrom, prevTo])
      : Promise.resolve({ rows: [] }),

    query(`
      SELECT tt.name AS label,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.status = 'completed') AS completed
      FROM tasks t
      LEFT JOIN task_types tt ON tt.id = t.task_type_id
      WHERE t.created_at BETWEEN $1 AND $2
      GROUP BY tt.name ORDER BY total DESC LIMIT 10
    `, [from, to]),

    query(`
      SELECT status AS label, COUNT(*) AS total
      FROM tasks WHERE created_at BETWEEN $1 AND $2
      GROUP BY status ORDER BY total DESC
    `, [from, to]),

    query(`
      SELECT u.name AS label,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE t.status = 'completed') AS completed,
        ROUND(COUNT(*) FILTER (WHERE t.status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS rate
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.created_at BETWEEN $1 AND $2
      GROUP BY u.name ORDER BY total DESC LIMIT 10
    `, [from, to]),
  ])

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
      overdue:   { value: parseInt(c.overdue, 10) || 0,   change: hasPrev ? pctChange(c.overdue, p.overdue) : null },
    },
    trend:      trend.rows.map((r) => ({ date: r.date, total: parseInt(r.total, 10), completed: parseInt(r.completed, 10) })),
    prevTrend:  prevTrend.rows.map((r) => ({ date: r.date, total: parseInt(r.total, 10), completed: parseInt(r.completed, 10) })),
    byTaskType: byTaskType.rows.map((r) => ({ label: r.label || '(Không có)', total: parseInt(r.total, 10), completed: parseInt(r.completed, 10) })),
    byStatus:   byStatus.rows.map((r) => ({ label: r.label, total: parseInt(r.total, 10) })),
    byAssignee: byAssignee.rows.map((r) => ({ label: r.label || '(Không có)', total: parseInt(r.total, 10), completed: parseInt(r.completed, 10), rate: parseFloat(r.rate) || 0 })),
  }
}

// ── 1. Staff Performance ──────────────────────────────────────────────────────

async function staffPerformance({ from, to, staffIds }) {
  const params = [from, to]
  let staffFilter = ''
  if (staffIds && staffIds.length) {
    params.push(staffIds)
    staffFilter = `AND u.id = ANY($${params.length})`
  }

  const { rows } = await query(`
    SELECT
      u.id, u.name, u.job_title,
      COUNT(t.id)                                                                          AS total,
      COUNT(t.id) FILTER (WHERE t.status = 'completed')                                   AS completed,
      COUNT(t.id) FILTER (WHERE t.status = 'completed' AND t.completed_at::date <= t.due_date) AS on_time,
      COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'completed')    AS overdue,
      ROUND(COALESCE(AVG(t.actual_hours) FILTER (WHERE t.actual_hours > 0), 0), 1)        AS avg_hours,
      ROUND(COUNT(t.id) FILTER (WHERE t.status = 'completed') * 100.0 / NULLIF(COUNT(t.id), 0), 1) AS completion_rate
    FROM users u
    LEFT JOIN tasks t ON t.assigned_to = u.id
      AND t.created_at BETWEEN $1 AND $2
    WHERE u.role = 'staff' ${staffFilter}
    GROUP BY u.id, u.name, u.job_title
    ORDER BY total DESC
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

async function companyStatus({ from, to, companyIds }) {
  const params = [from, to]
  let companyFilter = ''
  if (companyIds && companyIds.length) {
    params.push(companyIds)
    companyFilter = `AND c.id = ANY($${params.length})`
  }

  const { rows } = await query(`
    SELECT
      c.id, c.name, c.tax_code,
      COUNT(t.id)                                                                          AS total,
      COUNT(t.id) FILTER (WHERE t.status = 'completed')                                   AS completed,
      COUNT(t.id) FILTER (WHERE t.status != 'completed')                                  AS open_count,
      COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'completed')    AS overdue,
      ROUND(COUNT(t.id) FILTER (WHERE t.status = 'completed') * 100.0 / NULLIF(COUNT(t.id), 0), 1) AS completion_rate
    FROM companies c
    LEFT JOIN tasks t ON t.company_id = c.id
      AND t.created_at BETWEEN $1 AND $2
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

async function slaCompliance({ from, to, groupBy = 'staff' }) {
  const allowedGroups = { staff: 'u.name', company: 'c.name', task_type: 'tt.name' }
  const labelExpr = allowedGroups[groupBy] || 'u.name'

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
      AND t.completed_at BETWEEN $1 AND $2
      AND t.due_date IS NOT NULL
    GROUP BY ${labelExpr}
    ORDER BY total DESC
    LIMIT 20
  `, [from, to])

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

async function aging({ assignedTo, companyId }) {
  const params = []
  const conds = [`t.status != 'completed'`]

  if (assignedTo) { params.push(assignedTo); conds.push(`t.assigned_to = $${params.length}`) }
  if (companyId)  { params.push(companyId);  conds.push(`t.company_id  = $${params.length}`) }

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

async function velocity({ from, to, period = 'week' }) {
  const allowedPeriods = ['week', 'month']
  const pg_period = allowedPeriods.includes(period) ? period : 'week'

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
      AND completed_at BETWEEN $2 AND $3
    GROUP BY period
    ORDER BY period
  `, [pg_period, from, to])

  return rows.map((r) => ({
    period:             r.period,
    completed:          parseInt(r.completed, 10),
    avgDaysToComplete:  parseFloat(r.avg_days_to_complete) || 0,
  }))
}

// ── 6. Forecast ───────────────────────────────────────────────────────────────

async function forecast({ month, year }) {
  const targetMonth = parseInt(month, 10)
  const targetYear  = parseInt(year, 10)

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
      AND c.status != 'terminated'
    ORDER BY c.name, tt.name
  `)

  // Calculate occurrences in the target month using recurrence calculator
  const result = []
  const daysInMonth = new Date(targetYear, targetMonth, 0).getDate()

  for (const s of schedules) {
    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(targetYear, targetMonth - 1, day)
      try {
        const { shouldGenerate, forDate } = shouldGenerateToday(
          s.recurrence_type,
          s.recurrence_config,
          s.last_generated_at,
          checkDate
        )
        if (shouldGenerate && forDate) {
          const dueDate = new Date(forDate)
          dueDate.setDate(dueDate.getDate() + (s.deadline_offset_days || 0))
          result.push({
            scheduleId:       s.id,
            taskTypeName:     s.task_type_name,
            groupName:        s.group_name,
            companyName:      s.company_name,
            assignedToName:   s.assigned_to_name,
            triggerDate:      forDate,
            dueDate:          dueDate.toISOString().slice(0, 10),
            deadlineOffset:   s.deadline_offset_days || 0,
          })
          break // only first occurrence per schedule per month
        }
      } catch { /* skip invalid schedule */ }
    }
  }

  return result.sort((a, b) => a.triggerDate - b.triggerDate)
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
    data.forEach((r) => ws.addRow(r))
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
