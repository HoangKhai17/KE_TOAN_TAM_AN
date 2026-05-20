const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')
const { calculateAttendanceRecord } = require('./attendance.service')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id:            r.id,
    userId:        r.user_id,
    userName:      r.user_name     ?? undefined,
    leaveType:     r.leave_type,
    startDate:     r.start_date,
    endDate:       r.end_date,
    totalDays:     parseFloat(r.total_days),
    reason:        r.reason,
    status:        r.status,
    approvedBy:    r.approved_by,
    approverName:  r.approver_name ?? undefined,
    approvedAt:    r.approved_at,
    approvalNote:  r.approval_note  ?? undefined,
    rejectionNote: r.rejection_note ?? undefined,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function countWorkingDays(startDate, endDate) {
  const holidayRes = await query(
    'SELECT holiday_date FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2',
    [startDate, endDate]
  )
  const holidays = new Set(
    holidayRes.rows.map((r) => {
      const d = r.holiday_date instanceof Date ? r.holiday_date : new Date(r.holiday_date)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    })
  )

  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  let count = 0
  while (cur <= end) {
    const dow     = cur.getDay()
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dow !== 0 && dow !== 6 && !holidays.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

async function notifyAdmins(title, body) {
  const { rows } = await query(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
  )
  await Promise.all(rows.map((r) => createAndEmit(r.id, 'task_assigned', title, body, null)))
}

function toDateStr(d) {
  if (!d) return null
  const obj = d instanceof Date ? d : new Date(d)
  return `${obj.getUTCFullYear()}-${String(obj.getUTCMonth() + 1).padStart(2, '0')}-${String(obj.getUTCDate()).padStart(2, '0')}`
}

// ── Service functions ─────────────────────────────────────────────────────────

async function listLeaveRequests({ userId, status, leaveType, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (userId)    { params.push(userId);    conditions.push(`l.user_id    = $${params.length}`) }
  if (status)    { params.push(status);    conditions.push(`l.status     = $${params.length}`) }
  if (leaveType) { params.push(leaveType); conditions.push(`l.leave_type = $${params.length}`) }
  if (from)      { params.push(from);      conditions.push(`l.start_date >= $${params.length}`) }
  if (to)        { params.push(to);        conditions.push(`l.end_date   <= $${params.length}`) }

  const where = conditions.join(' AND ')

  // Single query with window COUNT — eliminates the separate COUNT(*) round-trip
  const { rows } = await query(
    `SELECT l.*, u.name AS user_name, a.name AS approver_name, COUNT(*) OVER() AS _total
     FROM leave_requests l
     JOIN  users u ON l.user_id    = u.id
     LEFT JOIN users a ON l.approved_by = a.id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const total = parseInt(rows[0]?._total ?? 0, 10)
  return { requests: rows.map(toDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function createLeaveRequest({ userId, leaveType, startDate, endDate, reason }) {
  const totalDays = await countWorkingDays(startDate, endDate)

  const { rows } = await query(
    `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, total_days, reason)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, leaveType, startDate, endDate, totalDays, reason ?? null]
  )

  const userRes  = await query('SELECT name FROM users WHERE id = $1', [userId])
  const userName = userRes.rows[0]?.name ?? 'Nhân viên'
  await notifyAdmins(
    `Đơn nghỉ phép mới — ${userName}`,
    `${userName} đăng ký nghỉ (${leaveType}) từ ${startDate} đến ${endDate} (${totalDays} ngày công)`
  )

  return toDto(rows[0])
}

async function approveLeaveRequest(id, approvedBy, approvalNote) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(),
         approval_note = $3, updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, id, approvalNote ?? null]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })
  const leave = rows[0]

  // Recalculate attendance for every day in the leave period (parallel — each day is independent)
  const [sy, sm, sd] = toDateStr(leave.start_date).split('-').map(Number)
  const endStr = toDateStr(leave.end_date)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const datesToRecalc = []
  while (cur <= end) {
    datesToRecalc.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  await Promise.all(
    datesToRecalc.map((d) => calculateAttendanceRecord(leave.user_id, d).catch(() => {}))
  )

  await createAndEmit(
    leave.user_id, 'task_status_changed',
    'Đơn nghỉ phép được duyệt',
    `Đơn nghỉ ${leave.leave_type} từ ${toDateStr(leave.start_date)} đến ${toDateStr(leave.end_date)} đã được duyệt.`,
    null
  )

  return toDto(rows[0])
}

async function rejectLeaveRequest(id, { rejectionNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [reviewedBy, rejectionNote ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })

  await createAndEmit(
    rows[0].user_id, 'task_status_changed',
    'Đơn nghỉ phép bị từ chối',
    `Đơn nghỉ ${rows[0].leave_type} từ ${toDateStr(rows[0].start_date)} đến ${toDateStr(rows[0].end_date)} bị từ chối. Lý do: ${rejectionNote ?? 'Không rõ'}`,
    null
  )

  return toDto(rows[0])
}

async function cancelLeaveRequest(id, userId) {
  const { rows } = await query(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, userId]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or cannot be cancelled'), { status: 404 })
  return toDto(rows[0])
}

module.exports = { listLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest }
