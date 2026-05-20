const { query } = require('../../config/db')

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toHolidayDto(r) {
  return {
    id:           r.id,
    holidayDate:  r.holiday_date,
    name:         r.name,
    otMultiplier: parseFloat(r.ot_multiplier),
    createdAt:    r.created_at,
  }
}

// ── Holidays CRUD ─────────────────────────────────────────────────────────────

async function listHolidays({ year } = {}) {
  const params = []
  let where = ''
  if (year) {
    params.push(year)
    where = `WHERE EXTRACT(YEAR FROM holiday_date) = $1`
  }
  const { rows } = await query(
    `SELECT * FROM public_holidays ${where} ORDER BY holiday_date`,
    params
  )
  return rows.map(toHolidayDto)
}

async function createHoliday({ holidayDate, name, otMultiplier = 3.0 }) {
  const { rows } = await query(
    `INSERT INTO public_holidays (holiday_date, name, ot_multiplier)
     VALUES ($1, $2, $3)
     ON CONFLICT (holiday_date) DO UPDATE SET name = $2, ot_multiplier = $3
     RETURNING *`,
    [holidayDate, name, otMultiplier]
  )
  return toHolidayDto(rows[0])
}

async function updateHoliday(id, { name, otMultiplier }) {
  const { rows } = await query(
    `UPDATE public_holidays
     SET name = COALESCE($1, name), ot_multiplier = COALESCE($2, ot_multiplier)
     WHERE id = $3
     RETURNING *`,
    [name ?? null, otMultiplier != null ? Number(otMultiplier) : null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Holiday not found'), { status: 404 })
  return toHolidayDto(rows[0])
}

async function deleteHoliday(id) {
  const { rows } = await query(
    'DELETE FROM public_holidays WHERE id = $1 RETURNING id',
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Holiday not found'), { status: 404 })
}

// ── Monthly Report ────────────────────────────────────────────────────────────

async function getMonthlyReport({ month, year }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { rows: attRows } = await query(
    `SELECT
       u.id         AS user_id,
       u.name       AS user_name,
       u.job_title,
       COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('present','late','early_leave','late_and_early')), 0) AS actual_work_days,
       COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('on_leave','wfh','business_trip','holiday')),       0) AS leave_paid_days,
       COUNT(*) FILTER (WHERE ar.status = 'absent')    AS absent_days,
       COUNT(*) FILTER (WHERE ar.status = 'late')      AS late_count,
       COUNT(*) FILTER (WHERE ar.status IN ('early_leave','late_and_early')) AS early_count,
       COALESCE(SUM(ar.ot_hours), 0)                   AS total_ot_hours,
       COUNT(ar.id)                                     AS total_records
     FROM users u
     LEFT JOIN attendance_records ar
       ON ar.user_id = u.id AND ar.work_date BETWEEN $1 AND $2
     WHERE u.status IN ('active','on_leave')
     GROUP BY u.id, u.name, u.job_title
     ORDER BY u.name`,
    [from, to]
  )

  // Raw approved OT hours (giờ thực tế đã duyệt, từ overtime_requests)
  const { rows: otRows } = await query(
    `SELECT user_id,
            SUM(ot_hours)              AS approved_ot_hours,
            SUM(ot_hours * ot_rate)    AS weighted_ot
     FROM overtime_requests
     WHERE ot_date BETWEEN $1 AND $2 AND status = 'approved'
     GROUP BY user_id`,
    [from, to]
  )
  const otMap = new Map(otRows.map((r) => [r.user_id, {
    approvedOtHours: parseFloat(r.approved_ot_hours ?? 0),
    weightedOtHours: parseFloat(r.weighted_ot ?? 0),
  }]))

  return attRows.map((r) => ({
    userId:          r.user_id,
    userName:        r.user_name,
    jobTitle:        r.job_title,
    actualWorkDays:  parseFloat(r.actual_work_days),
    leavePaidDays:   parseFloat(r.leave_paid_days),
    absentDays:      parseInt(r.absent_days,   10),
    lateCount:       parseInt(r.late_count,    10),
    earlyCount:      parseInt(r.early_count,   10),
    approvedOtHours: otMap.get(r.user_id)?.approvedOtHours ?? 0,
    weightedOtHours: otMap.get(r.user_id)?.weightedOtHours ?? 0,
    totalRecords:    parseInt(r.total_records, 10),
  }))
}

// ── Sync Attendance → Payroll ─────────────────────────────────────────────────

async function syncAttendanceToPayroll(payrollPeriodId) {
  // Get payroll period
  const periodRes = await query(
    'SELECT * FROM payroll_periods WHERE id = $1',
    [payrollPeriodId]
  )
  if (!periodRes.rows[0]) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  const period = periodRes.rows[0]

  if (period.status === 'paid') {
    throw Object.assign(new Error('Kỳ lương đã chốt (paid), không thể cập nhật'), { status: 409 })
  }

  const from = typeof period.start_date === 'string' ? period.start_date
    : `${period.start_date.getUTCFullYear()}-${String(period.start_date.getUTCMonth() + 1).padStart(2, '0')}-${String(period.start_date.getUTCDate()).padStart(2, '0')}`
  const to   = typeof period.end_date   === 'string' ? period.end_date
    : `${period.end_date.getUTCFullYear()}-${String(period.end_date.getUTCMonth() + 1).padStart(2, '0')}-${String(period.end_date.getUTCDate()).padStart(2, '0')}`

  // Check for incomplete records (warnings)
  const { rows: warningRows } = await query(
    `SELECT u.name, ar.work_date, ar.status
     FROM attendance_records ar
     JOIN users u ON ar.user_id = u.id
     WHERE ar.work_date BETWEEN $1 AND $2
       AND (ar.status = 'unscheduled' OR (ar.check_out_time IS NULL AND ar.status IN ('present','late','early_leave','late_and_early')))
     ORDER BY ar.work_date, u.name`,
    [from, to]
  )

  // Get all active employees
  const { rows: employees } = await query(
    `SELECT id FROM users WHERE status IN ('active', 'on_leave') ORDER BY name`,
    []
  )

  const updatedUsers = []
  for (const emp of employees) {
    // Attendance summary for this employee
    const { rows: attRows } = await query(
      `SELECT
         COALESCE(SUM(work_units) FILTER (WHERE status IN ('present','late','early_leave','late_and_early')), 0) AS actual_work_days,
         COALESCE(SUM(work_units) FILTER (WHERE status IN ('on_leave','wfh','business_trip','holiday')),       0) AS leave_paid_days,
         COUNT(*)   FILTER (WHERE status = 'absent')  AS absent_days,
         COUNT(*)   FILTER (WHERE status = 'late')    AS late_count,
         COALESCE(SUM(ot_hours), 0)                   AS total_ot_hours
       FROM attendance_records
       WHERE user_id = $1 AND work_date BETWEEN $2 AND $3`,
      [emp.id, from, to]
    )
    const att = attRows[0]

    // Raw approved OT hours + weighted OT (hours × rate) from overtime_requests
    const { rows: otRows } = await query(
      `SELECT
         COALESCE(SUM(ot_hours), 0)           AS approved_ot_hours,
         COALESCE(SUM(ot_hours * ot_rate), 0) AS weighted_ot
       FROM overtime_requests
       WHERE user_id = $1 AND ot_date BETWEEN $2 AND $3 AND status = 'approved'`,
      [emp.id, from, to]
    )

    const summary = {
      actual_work_days:  parseFloat(att.actual_work_days),
      leave_paid_days:   parseFloat(att.leave_paid_days),
      total_paid_days:   parseFloat(att.actual_work_days) + parseFloat(att.leave_paid_days),
      absent_days:       parseInt(att.absent_days, 10),
      late_count:        parseInt(att.late_count,  10),
      ot_hours:          parseFloat(otRows[0].approved_ot_hours),
      ot_weighted_hours: parseFloat(otRows[0].weighted_ot),
    }

    // UPSERT: tạo mới nếu chưa có, cập nhật attendance_summary nếu đã có
    await query(
      `INSERT INTO payroll_records
         (payroll_period_id, user_id, created_by, components)
       VALUES ($1, $2, $3, jsonb_build_object('attendance_summary', $4::jsonb))
       ON CONFLICT (payroll_period_id, user_id)
       DO UPDATE SET
         components = COALESCE(payroll_records.components, '{}') ||
                      jsonb_build_object('attendance_summary', $4::jsonb),
         updated_at = NOW()`,
      [payrollPeriodId, emp.id, period.created_by, JSON.stringify(summary)]
    )
    updatedUsers.push(emp.id)
  }

  return {
    periodId:     payrollPeriodId,
    periodYear:   period.period_year,
    periodMonth:  period.period_month,
    updatedCount: updatedUsers.length,
    warnings:     warningRows.map((r) => ({
      userName: r.name,
      workDate: r.work_date,
      status:   r.status,
    })),
  }
}

module.exports = { listHolidays, createHoliday, updateHoliday, deleteHoliday, getMonthlyReport, syncAttendanceToPayroll }
