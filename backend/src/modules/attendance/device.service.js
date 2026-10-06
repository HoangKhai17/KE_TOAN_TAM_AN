'use strict'
// Thiết bị tin cậy: ghi nhận thiết bị chấm công, duyệt/thu hồi, và (khi bật khóa)
// chặn chấm công từ thiết bị chưa được duyệt.

const { query } = require('../../config/db')

const LOCK_KEY = 'attendance.device_lock_enabled'

async function isLockEnabled() {
  const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [LOCK_KEY])
  return row?.value === '1' || row?.value === 'true'
}

async function setLockEnabled(on, updatedBy) {
  await query(
    `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, 'Bật = chỉ thiết bị đã duyệt mới chấm công được.', $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [LOCK_KEY, on ? '1' : '0', updatedBy ?? null]
  )
  return !!on
}

// Ghi nhận thiết bị khi NV chấm công (upsert). Thiết bị mới → 'pending'.
// Trả về status hiện tại, hoặc null nếu client không gửi deviceId.
async function touchDevice({ userId, deviceId, label, deviceInfo, ip }) {
  if (!deviceId) return null
  const { rows: [row] } = await query(
    `INSERT INTO trusted_devices (user_id, device_id, label, device_info, last_ip, last_seen)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET last_seen   = NOW(),
           last_ip     = EXCLUDED.last_ip,
           device_info = COALESCE(EXCLUDED.device_info, trusted_devices.device_info),
           label       = COALESCE(trusted_devices.label, EXCLUDED.label)
     RETURNING status`,
    [userId, String(deviceId).slice(0, 64), label ? String(label).slice(0, 120) : null,
     deviceInfo ? String(deviceInfo).slice(0, 200) : null, ip ?? null]
  )
  return row.status
}

// Gọi trước khi ghi log chấm công. Luôn ghi nhận thiết bị; nếu khóa bật thì chặn
// khi thiết bị chưa approved.
async function assertDeviceAllowed({ userId, deviceId, label, deviceInfo, ip }) {
  const status = await touchDevice({ userId, deviceId, label, deviceInfo, ip })
  if (!(await isLockEnabled())) return // khóa tắt → chỉ theo dõi, không chặn

  if (!deviceId) {
    throw Object.assign(new Error('Thiết bị chưa được đăng ký. Vui lòng chấm công bằng ứng dụng trên điện thoại.'), { status: 403, code: 'DEVICE_NOT_REGISTERED' })
  }
  if (status === 'approved') return
  if (status === 'revoked') {
    throw Object.assign(new Error('Thiết bị này đã bị thu hồi quyền chấm công. Liên hệ quản trị viên.'), { status: 403, code: 'DEVICE_REVOKED' })
  }
  // pending (hoặc vừa tạo)
  throw Object.assign(new Error('Thiết bị đang chờ quản trị viên duyệt. Vui lòng báo admin duyệt thiết bị này.'), { status: 403, code: 'DEVICE_PENDING' })
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function toDto(r) {
  return {
    id: r.id, userId: r.user_id, userName: r.user_name,
    deviceId: r.device_id, label: r.label, status: r.status,
    deviceInfo: r.device_info, lastIp: r.last_ip,
    firstSeen: r.first_seen, lastSeen: r.last_seen,
    approvedBy: r.approved_by, approvedByName: r.approved_by_name, approvedAt: r.approved_at,
  }
}

async function listDevices({ status, userId } = {}) {
  const where = []
  const params = []
  if (status === 'pending' || status === 'approved' || status === 'revoked') { params.push(status); where.push(`d.status = $${params.length}`) }
  if (userId) { params.push(userId); where.push(`d.user_id = $${params.length}`) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT d.*, u.name AS user_name, a.name AS approved_by_name
     FROM trusted_devices d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN users a ON a.id = d.approved_by
     ${whereSql}
     ORDER BY (d.status = 'pending') DESC, d.last_seen DESC`,
    params
  )
  return rows.map(toDto)
}

async function countPending() {
  const { rows: [row] } = await query(`SELECT count(*)::int n FROM trusted_devices WHERE status = 'pending'`)
  return row.n
}

async function setStatus(id, status, adminId) {
  const approved = status === 'approved'
  const { rows: [row] } = await query(
    `UPDATE trusted_devices
       SET status = $2,
           approved_by = $3,
           approved_at = $4
     WHERE id = $1
     RETURNING id`,
    [id, status, approved ? adminId : null, approved ? new Date() : null]
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy thiết bị'), { status: 404 })
  return row.id
}

// Duyệt hàng loạt mọi thiết bị đang chờ — dùng khi rollout khóa thiết bị.
async function approveAllPending(adminId) {
  const { rowCount } = await query(
    `UPDATE trusted_devices
       SET status = 'approved', approved_by = $1, approved_at = NOW()
     WHERE status = 'pending'`,
    [adminId]
  )
  return rowCount
}

async function renameDevice(id, label) {
  const { rows: [row] } = await query(
    `UPDATE trusted_devices SET label = $2 WHERE id = $1 RETURNING id`,
    [id, label ? String(label).slice(0, 120) : null]
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy thiết bị'), { status: 404 })
  return row.id
}

async function deleteDevice(id) {
  await query('DELETE FROM trusted_devices WHERE id = $1', [id])
}

module.exports = {
  isLockEnabled, setLockEnabled,
  touchDevice, assertDeviceAllowed,
  listDevices, countPending, setStatus, approveAllPending, renameDevice, deleteDevice,
}
