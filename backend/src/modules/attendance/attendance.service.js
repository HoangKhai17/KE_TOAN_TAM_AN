const { query } = require('../../config/db')

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toRecordDto(r) {
  return {
    id:              r.id,
    userId:          r.user_id,
    userName:        r.user_name    ?? undefined,
    workDate:        r.work_date,
    shiftId:         r.shift_id,
    shiftName:       r.shift_name   ?? undefined,
    checkInTime:     r.check_in_time,
    checkOutTime:    r.check_out_time,
    actualHours:     r.actual_hours  != null ? parseFloat(r.actual_hours) : null,
    lateMinutes:     r.late_minutes  ?? 0,
    earlyMinutes:    r.early_minutes ?? 0,
    workUnits:       r.work_units    != null ? parseFloat(r.work_units) : 0,
    status:          r.status,
    isAdjusted:      r.is_adjusted,
    isHoliday:       r.is_holiday,
    leaveRequestId:  r.leave_request_id,
    otHours:         r.ot_hours != null ? parseFloat(r.ot_hours) : 0,
    notes:           r.notes,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  }
}

function toLogDto(r) {
  return {
    id:         r.id,
    userId:     r.user_id,
    logType:    r.log_type,
    loggedAt:   r.logged_at,
    method:     r.method,
    deviceInfo: r.device_info,
    ipAddress:  r.ip_address,
    notes:      r.notes,
  }
}

// ── Work Schedule Resolution ──────────────────────────────────────────────────
// Returns an effective "ws" object for a given date — either from an explicit
// override in work_schedules, or derived from system config (day-of-week + shifts).
// Returns null if the date is a day off with no logs to record.

async function resolveWorkSchedule(date) {
  const jsDay = new Date(date + 'T00:00:00').getDay() // 0=Sun, 6=Sat

  // 1. Read both system config keys in one query
  const cfgRes = await query(
    `SELECT key, value FROM system_configs WHERE key IN ('attendance.default_shift_id', 'attendance.saturday_shift_id')`
  )
  const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value ?? '']))
  const defaultShiftId  = cfg['attendance.default_shift_id']  || null
  const saturdayShiftId = cfg['attendance.saturday_shift_id'] || null

  // Determine the applicable shiftId for this day
  let shiftId = null
  let isDayOff = false

  if (jsDay === 0) {
    isDayOff = true // Sunday always off
  } else if (jsDay === 6) {
    shiftId  = saturdayShiftId
    isDayOff = !shiftId  // Saturday: off if no shift configured
  } else {
    shiftId = defaultShiftId
  }

  if (isDayOff) return { is_day_off: true, shift_id: null }

  // 2. Fetch shift details
  const shift = shiftId
    ? (await query('SELECT * FROM shifts WHERE id = $1', [shiftId])).rows[0] ?? null
    : null

  return {
    shift_id:       shiftId,
    is_day_off:     false,
    start_time:     shift?.start_time     ?? null,
    end_time:       shift?.end_time       ?? null,
    break_minutes:  shift?.break_minutes  ?? 60,
    required_hours: shift?.required_hours ?? null,
    tolerance_in:   shift?.tolerance_in   ?? 15,
    tolerance_out:  shift?.tolerance_out  ?? 15,
    shift_type:     shift?.shift_type     ?? null,
  }
}

// ── Core Calculation ──────────────────────────────────────────────────────────

async function calculateAttendanceRecord(userId, date) {
  // Step 1: Check for an explicit work_schedule override for this user/date.
  // These are written only for exceptions (e.g. a specific day off, or a
  // different shift for one employee). Fall back to system-derived schedule.
  const wsOverrideRes = await query(
    `SELECT ws.*, ws.is_day_off,
            s.start_time, s.end_time, s.break_minutes, s.required_hours,
            s.tolerance_in, s.tolerance_out, s.shift_type
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ws.user_id = $1 AND ws.work_date = $2`,
    [userId, date]
  )
  const ws = wsOverrideRes.rows[0] ?? await resolveWorkSchedule(date)

  // Step 2: day off → no record needed
  if (ws.is_day_off) return null

  // Step 4: public holiday
  const holidayRes = await query(
    'SELECT name FROM public_holidays WHERE holiday_date = $1',
    [date]
  )
  if (holidayRes.rows.length > 0) {
    const { rows } = await query(
      `INSERT INTO attendance_records (user_id, work_date, shift_id, status, work_units, is_holiday)
       VALUES ($1, $2, $3, 'holiday', 1.0, TRUE)
       ON CONFLICT (user_id, work_date) DO UPDATE SET
         status = 'holiday', work_units = 1.0, is_holiday = TRUE,
         shift_id = $3, updated_at = NOW()
       RETURNING *`,
      [userId, date, ws.shift_id ?? null]
    )
    return toRecordDto(rows[0])
  }

  // Step 5: approved leave covers this date
  const leaveRes = await query(
    `SELECT id, leave_type FROM leave_requests
     WHERE user_id = $1 AND status = 'approved'
       AND start_date <= $2 AND end_date >= $2
     LIMIT 1`,
    [userId, date]
  )
  if (leaveRes.rows.length > 0) {
    const leave = leaveRes.rows[0]
    // Map leave_type → attendance_status (enum only has on_leave/business_trip/wfh)
    const leaveStatusMap = { business_trip: 'business_trip', wfh: 'wfh' }
    const attendanceStatus = leaveStatusMap[leave.leave_type] ?? 'on_leave'
    const { rows } = await query(
      `INSERT INTO attendance_records (user_id, work_date, shift_id, status, work_units, leave_request_id)
       VALUES ($1, $2, $3, $4, 1.0, $5)
       ON CONFLICT (user_id, work_date) DO UPDATE SET
         status = $4, work_units = 1.0, leave_request_id = $5,
         shift_id = $3, updated_at = NOW()
       RETURNING *`,
      [userId, date, ws.shift_id ?? null, attendanceStatus, leave.id]
    )
    return toRecordDto(rows[0])
  }

  // Step 6: get MIN(check_in) and MAX(check_out) from logs
  const timesRes = await query(
    `SELECT
       MIN(logged_at) FILTER (WHERE log_type = 'check_in')  AS check_in_time,
       MAX(logged_at) FILTER (WHERE log_type = 'check_out') AS check_out_time
     FROM attendance_logs
     WHERE user_id = $1 AND logged_at::date = $2`,
    [userId, date]
  )
  const checkInTime  = timesRes.rows[0].check_in_time  ?? null
  const checkOutTime = timesRes.rows[0].check_out_time ?? null

  // No check-in → absent
  if (!checkInTime) {
    const { rows } = await query(
      `INSERT INTO attendance_records (user_id, work_date, shift_id, status, work_units,
         check_in_time, check_out_time)
       VALUES ($1, $2, $3, 'absent', 0.0, NULL, NULL)
       ON CONFLICT (user_id, work_date) DO UPDATE SET
         status = 'absent', work_units = 0.0,
         check_in_time = NULL, check_out_time = NULL,
         shift_id = $3, updated_at = NOW()
       RETURNING *`,
      [userId, date, ws.shift_id ?? null]
    )
    return toRecordDto(rows[0])
  }

  // Step 7: actual_hours (only after checkout)
  let actualHours = null
  const breakHours = (ws.break_minutes ?? 60) / 60

  if (checkOutTime) {
    const diffHours = (new Date(checkOutTime) - new Date(checkInTime)) / 3600000
    actualHours = Math.max(0, diffHours - breakHours)
  }

  // Required hours from shift definition
  let requiredHours = ws.required_hours != null ? parseFloat(ws.required_hours) : null
  if (!requiredHours && ws.start_time && ws.end_time) {
    const [sh, sm] = ws.start_time.split(':').map(Number)
    const [eh, em] = ws.end_time.split(':').map(Number)
    requiredHours = (eh * 60 + em - sh * 60 - sm) / 60 - breakHours
  }

  // Step 8: late_minutes and early_minutes
  let lateMinutes  = 0
  let earlyMinutes = 0

  if (ws.start_time) {
    const [sh, sm] = ws.start_time.split(':').map(Number)
    const ciDate = new Date(checkInTime)
    const shiftStart = new Date(ciDate)
    shiftStart.setHours(sh, sm, 0, 0)
    const diffMin = (ciDate - shiftStart) / 60000
    const tol = ws.tolerance_in ?? 15
    if (diffMin > tol) lateMinutes = Math.floor(diffMin - tol)
  }

  if (ws.end_time && checkOutTime) {
    const [eh, em] = ws.end_time.split(':').map(Number)
    const coDate = new Date(checkOutTime)
    const shiftEnd = new Date(coDate)
    shiftEnd.setHours(eh, em, 0, 0)
    const diffMin = (shiftEnd - coDate) / 60000
    const tol = ws.tolerance_out ?? 15
    if (diffMin > tol) earlyMinutes = Math.floor(diffMin - tol)
  }

  // Step 9: work_units
  let workUnits = 0.0
  if (actualHours != null && requiredHours) {
    const ratio = actualHours / requiredHours
    if (ratio >= 0.8)      workUnits = 1.0
    else if (ratio >= 0.5) workUnits = 0.5
  }

  // Step 10: status
  let status = 'present'
  if (lateMinutes > 0 && earlyMinutes > 0) status = 'late_and_early'
  else if (lateMinutes > 0)  status = 'late'
  else if (earlyMinutes > 0) status = 'early_leave'

  // Step 11: upsert
  const { rows } = await query(
    `INSERT INTO attendance_records
       (user_id, work_date, shift_id, check_in_time, check_out_time, actual_hours,
        late_minutes, early_minutes, work_units, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (user_id, work_date) DO UPDATE SET
       shift_id      = $3,
       check_in_time = $4,
       check_out_time= $5,
       actual_hours  = $6,
       late_minutes  = $7,
       early_minutes = $8,
       work_units    = $9,
       status        = $10,
       updated_at    = NOW()
     RETURNING *`,
    [userId, date, ws.shift_id ?? null, checkInTime, checkOutTime, actualHours,
     lateMinutes, earlyMinutes, workUnits, status]
  )
  return toRecordDto(rows[0])
}

// ── Check-in / Check-out ──────────────────────────────────────────────────────

async function checkIn({ userId, method = 'web', notes, ip, deviceInfo }) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { rows: logRows } = await query(
    `INSERT INTO attendance_logs (user_id, log_type, method, device_info, ip_address, notes)
     VALUES ($1, 'check_in', $2, $3, $4, $5)
     RETURNING *`,
    [userId, method, deviceInfo ?? null, ip ?? null, notes ?? null]
  )

  const record = await calculateAttendanceRecord(userId, dateStr)
  return { log: toLogDto(logRows[0]), record }
}

async function checkOut({ userId, method = 'web', notes, ip, deviceInfo }) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const hasCheckIn = await query(
    `SELECT id FROM attendance_logs WHERE user_id = $1 AND log_type = 'check_in' AND logged_at::date = $2 LIMIT 1`,
    [userId, dateStr]
  )
  if (hasCheckIn.rows.length === 0) {
    throw Object.assign(new Error('Chưa có check-in cho ngày hôm nay'), { status: 400 })
  }

  const { rows: logRows } = await query(
    `INSERT INTO attendance_logs (user_id, log_type, method, device_info, ip_address, notes)
     VALUES ($1, 'check_out', $2, $3, $4, $5)
     RETURNING *`,
    [userId, method, deviceInfo ?? null, ip ?? null, notes ?? null]
  )

  const record = await calculateAttendanceRecord(userId, dateStr)
  return { log: toLogDto(logRows[0]), record }
}

async function getToday(userId) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [logsRes, recordRes] = await Promise.all([
    query(
      `SELECT log_type, logged_at, method
       FROM attendance_logs
       WHERE user_id = $1 AND logged_at::date = $2
       ORDER BY logged_at`,
      [userId, dateStr]
    ),
    query(
      `SELECT ar.*, s.name AS shift_name
       FROM attendance_records ar
       LEFT JOIN shifts s ON ar.shift_id = s.id
       WHERE ar.user_id = $1 AND ar.work_date = $2`,
      [userId, dateStr]
    ),
  ])

  const checkIns  = logsRes.rows.filter((l) => l.log_type === 'check_in')
  const checkOuts = logsRes.rows.filter((l) => l.log_type === 'check_out')

  return {
    date:          dateStr,
    hasCheckedIn:  checkIns.length  > 0,
    checkInTime:   checkIns[0]?.logged_at  ?? null,
    hasCheckedOut: checkOuts.length > 0,
    checkOutTime:  checkOuts[checkOuts.length - 1]?.logged_at ?? null,
    checkInCount:  checkIns.length,
    checkOutCount: checkOuts.length,
    record:        recordRes.rows[0] ? toRecordDto(recordRes.rows[0]) : null,
  }
}

// ── List / Summary ────────────────────────────────────────────────────────────

async function listAttendanceRecords({ userId, month, year, status, page = 1, limit = 31 } = {}) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const conditions = ['ar.work_date BETWEEN $1 AND $2']
  const params = [from, to]

  if (userId) { params.push(userId); conditions.push(`ar.user_id = $${params.length}`) }
  if (status) { params.push(status); conditions.push(`ar.status  = $${params.length}`) }

  const where  = conditions.join(' AND ')
  const offset = (page - 1) * limit

  const countRes = await query(`SELECT COUNT(*) FROM attendance_records ar WHERE ${where}`, params)
  const total    = parseInt(countRes.rows[0].count, 10)

  const dataParams = [...params, limit, offset]
  const { rows } = await query(
    `SELECT ar.*, u.name AS user_name, s.name AS shift_name
     FROM attendance_records ar
     JOIN  users u ON ar.user_id  = u.id
     LEFT JOIN shifts s ON ar.shift_id = s.id
     WHERE ${where}
     ORDER BY ar.work_date DESC, u.name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  )

  return {
    records: rows.map(toRecordDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getAttendanceSummary({ userId, month, year }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const extraCond = userId ? 'AND ar.user_id = $3' : ''
  const params    = userId ? [from, to, userId] : [from, to]

  const { rows } = await query(
    `SELECT
       u.id         AS user_id,
       u.name       AS user_name,
       u.job_title,
       COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('present','late','early_leave','late_and_early')), 0) AS actual_work_days,
       COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('on_leave','wfh','business_trip','holiday')),       0) AS leave_paid_days,
       COUNT(*) FILTER (WHERE ar.status = 'absent')                                                                  AS absent_days,
       COUNT(*) FILTER (WHERE ar.status = 'late')                                                                    AS late_count,
       COUNT(*) FILTER (WHERE ar.status IN ('early_leave','late_and_early'))                                         AS early_count,
       COALESCE(SUM(ar.ot_hours), 0)                                                                                 AS total_ot_hours,
       COUNT(ar.id)                                                                                                  AS total_records
     FROM users u
     LEFT JOIN attendance_records ar
       ON ar.user_id = u.id AND ar.work_date BETWEEN $1 AND $2
       ${extraCond}
     WHERE u.status IN ('active','on_leave')
     GROUP BY u.id, u.name, u.job_title
     ORDER BY u.name`,
    params
  )

  return rows.map((r) => ({
    userId:        r.user_id,
    userName:      r.user_name,
    jobTitle:      r.job_title,
    actualWorkDays: parseFloat(r.actual_work_days),
    leavePaidDays:  parseFloat(r.leave_paid_days),
    absentDays:     parseInt(r.absent_days,    10),
    lateCount:      parseInt(r.late_count,     10),
    earlyCount:     parseInt(r.early_count,    10),
    totalOtHours:   parseFloat(r.total_ot_hours),
    totalRecords:   parseInt(r.total_records,  10),
  }))
}

module.exports = {
  calculateAttendanceRecord,
  checkIn,
  checkOut,
  getToday,
  listAttendanceRecords,
  getAttendanceSummary,
}
