const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id:            r.id,
    userId:        r.user_id,
    userName:      r.user_name     ?? undefined,
    otDate:        r.ot_date,
    startTime:     r.start_time,
    endTime:       r.end_time,
    otHours:       parseFloat(r.ot_hours),
    otRate:        parseFloat(r.ot_rate),
    reason:        r.reason,
    status:        r.status,
    approvedBy:    r.approved_by,
    approverName:  r.approver_name ?? undefined,
    approvedAt:    r.approved_at,
    rejectionNote: r.rejection_note,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function calcOtHours(startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime)
  let endMin     = parseTimeToMinutes(endTime)
  if (endMin <= startMin) endMin += 24 * 60 // midnight crossover
  const diffHours = (endMin - startMin) / 60
  return diffHours > 4 ? diffHours - 0.5 : diffHours // deduct 30min break if >4h
}

async function calcOtRate(otDate) {
  const dayOfWeek = new Date(`${otDate}T00:00:00`).getDay() // 0=Sun, 6=Sat

  const holidayRes = await query(
    'SELECT id FROM public_holidays WHERE holiday_date = $1',
    [otDate]
  )
  if (holidayRes.rows.length > 0) return 3.0
  if (dayOfWeek === 0 || dayOfWeek === 6) return 2.0
  return 1.5
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

async function listOvertimeRequests({ userId, status, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (userId) { params.push(userId); conditions.push(`o.user_id  = $${params.length}`) }
  if (status) { params.push(status); conditions.push(`o.status   = $${params.length}`) }
  if (from)   { params.push(from);   conditions.push(`o.ot_date >= $${params.length}`) }
  if (to)     { params.push(to);     conditions.push(`o.ot_date <= $${params.length}`) }

  const where    = conditions.join(' AND ')
  const countRes = await query(`SELECT COUNT(*) FROM overtime_requests o WHERE ${where}`, params)
  const total    = parseInt(countRes.rows[0].count, 10)

  const { rows } = await query(
    `SELECT o.*, u.name AS user_name, a.name AS approver_name
     FROM overtime_requests o
     JOIN  users u ON o.user_id    = u.id
     LEFT JOIN users a ON o.approved_by = a.id
     WHERE ${where}
     ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  return { requests: rows.map(toDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function createOvertimeRequest({ userId, otDate, startTime, endTime, reason }) {
  const otHours = calcOtHours(startTime, endTime)
  const otRate  = await calcOtRate(otDate)

  const { rows } = await query(
    `INSERT INTO overtime_requests (user_id, ot_date, start_time, end_time, ot_hours, ot_rate, reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, otDate, startTime, endTime, parseFloat(otHours.toFixed(2)), otRate, reason ?? null]
  )

  const userRes  = await query('SELECT name FROM users WHERE id = $1', [userId])
  const userName = userRes.rows[0]?.name ?? 'Nhân viên'
  await notifyAdmins(
    `Đơn tăng ca mới — ${userName}`,
    `${userName} đăng ký OT ngày ${otDate} từ ${startTime} đến ${endTime} (${otHours.toFixed(1)}h × ${otRate})`
  )

  return toDto(rows[0])
}

async function approveOvertimeRequest(id, approvedBy) {
  const { rows } = await query(
    `UPDATE overtime_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, id]
  )
  if (!rows[0]) throw Object.assign(new Error('OT request not found or already reviewed'), { status: 404 })
  const ot = rows[0]

  // Recalculate total approved OT hours for that day and update attendance_records
  const totalOtRes = await query(
    `SELECT COALESCE(SUM(ot_hours), 0) AS total_ot
     FROM overtime_requests
     WHERE user_id = $1 AND ot_date = $2 AND status = 'approved'`,
    [ot.user_id, ot.ot_date]
  )
  const totalOt = parseFloat(totalOtRes.rows[0].total_ot)

  await query(
    `UPDATE attendance_records SET ot_hours = $1, updated_at = NOW()
     WHERE user_id = $2 AND work_date = $3`,
    [totalOt, ot.user_id, ot.ot_date]
  )

  await createAndEmit(
    ot.user_id, 'task_status_changed',
    'Đơn tăng ca được duyệt',
    `Đơn OT ngày ${toDateStr(ot.ot_date)} từ ${ot.start_time} đến ${ot.end_time} đã được duyệt.`,
    null
  )

  return toDto(rows[0])
}

async function rejectOvertimeRequest(id, { rejectionNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE overtime_requests
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [reviewedBy, rejectionNote ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('OT request not found or already reviewed'), { status: 404 })

  await createAndEmit(
    rows[0].user_id, 'task_status_changed',
    'Đơn tăng ca bị từ chối',
    `Đơn OT ngày ${toDateStr(rows[0].ot_date)} bị từ chối. Lý do: ${rejectionNote ?? 'Không rõ'}`,
    null
  )

  return toDto(rows[0])
}

module.exports = { listOvertimeRequests, createOvertimeRequest, approveOvertimeRequest, rejectOvertimeRequest }
