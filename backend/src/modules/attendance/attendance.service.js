const { query } = require('../../config/db')

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toAttDto(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name ?? undefined,
    userJobTitle: r.user_job_title ?? undefined,
    workDate: r.work_date,
    checkIn: r.check_in,
    checkOut: r.check_out,
    status: r.status,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function toLeaveDto(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name ?? undefined,
    userJobTitle: r.user_job_title ?? undefined,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    daysCount: r.days_count,
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewerName: r.reviewer_name ?? undefined,
    reviewedAt: r.reviewed_at,
    reviewNote: r.review_note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// ── Attendance Records ────────────────────────────────────────────────────────

async function listAttendanceRecords({ userId, from, to, status, page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (userId) {
    params.push(userId)
    conditions.push(`a.user_id = $${params.length}`)
  }
  if (from) {
    params.push(from)
    conditions.push(`a.work_date >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    conditions.push(`a.work_date <= $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`a.status = $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const countRes = await query(
    `SELECT COUNT(*) FROM attendance_records a WHERE ${where}`,
    params
  )
  const total = parseInt(countRes.rows[0].count, 10)

  const dataParams = [...params, limit, offset]
  const { rows } = await query(
    `SELECT a.*, u.name AS user_name, u.job_title AS user_job_title
     FROM attendance_records a
     JOIN users u ON a.user_id = u.id
     WHERE ${where}
     ORDER BY a.work_date DESC, u.name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  )

  return {
    records: rows.map(toAttDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function upsertAttendanceRecord({ userId, workDate, checkIn, checkOut, status = 'present', notes, createdBy }) {
  const { rows } = await query(
    `INSERT INTO attendance_records (user_id, work_date, check_in, check_out, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, work_date) DO UPDATE SET
       check_in   = EXCLUDED.check_in,
       check_out  = EXCLUDED.check_out,
       status     = EXCLUDED.status,
       notes      = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [userId, workDate, checkIn ?? null, checkOut ?? null, status, notes ?? null, createdBy ?? null]
  )
  return toAttDto(rows[0])
}

async function deleteAttendanceRecord(id) {
  const { rows } = await query(
    `DELETE FROM attendance_records WHERE id = $1 RETURNING id`,
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Attendance record not found'), { status: 404 })
}

// ── Leave Requests ────────────────────────────────────────────────────────────

async function listLeaveRequests({ userId, status, leaveType, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (userId) {
    params.push(userId)
    conditions.push(`l.user_id = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`l.status = $${params.length}`)
  }
  if (leaveType) {
    params.push(leaveType)
    conditions.push(`l.leave_type = $${params.length}`)
  }
  if (from) {
    params.push(from)
    conditions.push(`l.start_date >= $${params.length}`)
  }
  if (to) {
    params.push(to)
    conditions.push(`l.end_date <= $${params.length}`)
  }

  const where = conditions.join(' AND ')
  const countRes = await query(
    `SELECT COUNT(*) FROM leave_requests l WHERE ${where}`,
    params
  )
  const total = parseInt(countRes.rows[0].count, 10)

  const dataParams = [...params, limit, offset]
  const { rows } = await query(
    `SELECT l.*,
       u.name     AS user_name,
       u.job_title AS user_job_title,
       r.name     AS reviewer_name
     FROM leave_requests l
     JOIN  users u ON l.user_id     = u.id
     LEFT JOIN users r ON l.reviewed_by = r.id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    dataParams
  )

  return {
    requests: rows.map(toLeaveDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function createLeaveRequest({ userId, leaveType, startDate, endDate, reason }) {
  const { rows: calc } = await query(
    `SELECT ($1::date - $2::date + 1) AS days_count`,
    [endDate, startDate]
  )
  const daysCount = Math.max(1, parseInt(calc[0].days_count, 10))

  const { rows } = await query(
    `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, days_count, reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, leaveType, startDate, endDate, daysCount, reason ?? null]
  )
  return toLeaveDto(rows[0])
}

async function reviewLeaveRequest(id, { status, reviewNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4 AND status = 'pending'
     RETURNING *`,
    [status, reviewNote ?? null, reviewedBy, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })
  return toLeaveDto(rows[0])
}

async function cancelLeaveRequest(id, userId) {
  const { rows } = await query(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, userId]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or cannot be cancelled'), { status: 404 })
  return toLeaveDto(rows[0])
}

// ── Monthly Summary ───────────────────────────────────────────────────────────

async function getAttendanceSummary({ userId, year, month }) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const extraCond = userId ? `AND a.user_id = $3` : ''
  const params = userId ? [from, to, userId] : [from, to]

  const { rows } = await query(
    `SELECT
       u.id          AS user_id,
       u.name        AS user_name,
       u.job_title,
       COUNT(*) FILTER (WHERE a.status = 'present')  AS present_days,
       COUNT(*) FILTER (WHERE a.status = 'absent')   AS absent_days,
       COUNT(*) FILTER (WHERE a.status = 'late')     AS late_days,
       COUNT(*) FILTER (WHERE a.status = 'half_day') AS half_days,
       COUNT(*) FILTER (WHERE a.status = 'remote')   AS remote_days,
       COUNT(*) FILTER (WHERE a.status = 'holiday')  AS holiday_days,
       COUNT(a.id)   AS total_records
     FROM users u
     LEFT JOIN attendance_records a
       ON a.user_id = u.id
       AND a.work_date >= $1
       AND a.work_date <= $2
       ${extraCond}
     WHERE u.status IN ('active', 'on_leave')
     GROUP BY u.id, u.name, u.job_title
     ORDER BY u.name`,
    params
  )

  return rows.map((r) => ({
    userId:      r.user_id,
    userName:    r.user_name,
    jobTitle:    r.job_title,
    presentDays: parseInt(r.present_days,  10),
    absentDays:  parseInt(r.absent_days,   10),
    lateDays:    parseInt(r.late_days,     10),
    halfDays:    parseInt(r.half_days,     10),
    remoteDays:  parseInt(r.remote_days,   10),
    holidayDays: parseInt(r.holiday_days,  10),
    totalRecords:parseInt(r.total_records, 10),
  }))
}

module.exports = {
  listAttendanceRecords,
  upsertAttendanceRecord,
  deleteAttendanceRecord,
  listLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  getAttendanceSummary,
}
