'use strict'
// Thiết bị tin cậy: ghi nhận thiết bị chấm công, duyệt/thu hồi, và (khi bật khóa)
// chặn chấm công từ thiết bị chưa được duyệt.

const { query } = require('../../config/db')

const LOCK_KEY = 'attendance.device_lock_enabled'
const LOCK_AT_KEY = 'attendance.device_lock_enabled_at' // mốc thời gian BẬT khóa gần nhất

async function isLockEnabled() {
  const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [LOCK_KEY])
  return row?.value === '1' || row?.value === 'true'
}

// Mốc BẬT khóa gần nhất (để phân biệt thiết bị có-từ-trước vs mới-xuất-hiện-sau-khi-khóa).
async function getLockEnabledAt() {
  const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [LOCK_AT_KEY])
  return row?.value ? new Date(row.value) : null
}

async function setLockEnabled(on, updatedBy) {
  await query(
    `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, 'Bật = chỉ thiết bị đã duyệt mới chấm công được.', $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [LOCK_KEY, on ? '1' : '0', updatedBy ?? null]
  )
  // Ghi mốc thời gian lúc BẬT (để xác định "grandfather": máy đã có trước mốc này được treo,
  // máy mới xuất hiện sau mốc này bị chặn hẳn → chống spam).
  if (on) {
    await query(
      `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, 'Mốc thời gian bật khóa thiết bị gần nhất.', $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [LOCK_AT_KEY, new Date().toISOString(), updatedBy ?? null]
    )
  }
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

// Gọi trước khi ghi log chấm công. Luôn ghi nhận thiết bị và trả quyết định:
//   { held: false } → chấm công bình thường (tính công ngay).
//   { held: true }  → VẪN cho chấm nhưng TREO (chờ admin duyệt thiết bị mới tính công).
//   throw 403       → CHẶN hẳn (không tạo log chấm công).
//
// Quy tắc khi khóa BẬT:
//   - approved                                   → tính ngay.
//   - revoked                                    → chặn.
//   - pending & ĐÃ CÓ TRƯỚC mốc bật khóa         → treo (grandfather: máy đang dùng lúc bật khóa).
//   - pending & MỚI xuất hiện SAU mốc bật khóa   → chặn (chống spam: máy lạ phải được duyệt trước).
//   - không gửi deviceId                         → chặn.
async function evaluateDevice({ userId, deviceId, label, deviceInfo, ip }) {
  const lockOn = await isLockEnabled()

  // Tra thiết bị TRƯỚC khi upsert để biết nó đã tồn tại từ bao giờ.
  let existing = null
  if (deviceId) {
    const { rows: [row] } = await query(
      'SELECT status, first_seen FROM trusted_devices WHERE user_id = $1 AND device_id = $2',
      [userId, String(deviceId).slice(0, 64)]
    )
    existing = row || null
  }

  // Luôn ghi nhận/ cập nhật thiết bị (để admin thấy cả máy mới thử chấm → duyệt được).
  const status = await touchDevice({ userId, deviceId, label, deviceInfo, ip })

  if (!lockOn) return { held: false } // khóa tắt → tính ngay

  if (!deviceId) {
    throw Object.assign(new Error('Thiết bị chưa định danh được. Vui lòng chấm công bằng ứng dụng trên điện thoại.'), { status: 403, code: 'DEVICE_NOT_REGISTERED' })
  }
  if (status === 'approved') return { held: false }
  if (status === 'revoked') {
    throw Object.assign(new Error('Thiết bị này đã bị thu hồi quyền chấm công. Liên hệ quản trị viên.'), { status: 403, code: 'DEVICE_REVOKED' })
  }

  // pending: treo nếu máy đã đăng ký TRƯỚC khi bật khóa; ngược lại chặn hẳn.
  const lockAt = await getLockEnabledAt()
  const registeredBeforeLock = existing && lockAt && new Date(existing.first_seen) < lockAt
  if (registeredBeforeLock) return { held: true }

  throw Object.assign(
    new Error('Thiết bị chưa được duyệt. Vui lòng báo quản trị viên duyệt thiết bị này, sau đó chấm công lại.'),
    { status: 403, code: 'DEVICE_PENDING' }
  )
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

// Bỏ treo mọi log của đúng (user, device) → trả danh sách ngày cần tính lại công.
async function releaseHeld(userId, deviceId) {
  if (!deviceId) return { userId, dates: [] }
  const { rows } = await query(
    `UPDATE attendance_logs SET held = false
     WHERE user_id = $1 AND device_id = $2 AND held = true
     RETURNING to_char(logged_at::date, 'YYYY-MM-DD') AS d`,
    [userId, deviceId]
  )
  return { userId, dates: [...new Set(rows.map((r) => r.d))] }
}

// Đổi trạng thái thiết bị. Khi DUYỆT → giải phóng log treo, trả { userId, dates } để tính lại công.
async function setStatus(id, status, adminId) {
  const approved = status === 'approved'
  const { rows: [row] } = await query(
    `UPDATE trusted_devices
       SET status = $2,
           approved_by = $3,
           approved_at = $4
     WHERE id = $1
     RETURNING user_id, device_id`,
    [id, status, approved ? adminId : null, approved ? new Date() : null]
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy thiết bị'), { status: 404 })
  if (approved) return releaseHeld(row.user_id, row.device_id)
  return { userId: row.user_id, dates: [] }
}

// Duyệt hàng loạt mọi thiết bị đang chờ — dùng khi rollout khóa thiết bị.
// Trả { approved, affected: [{userId, dates}] } để tính lại công các log vừa được giải phóng.
async function approveAllPending(adminId) {
  const { rows } = await query(
    `UPDATE trusted_devices
       SET status = 'approved', approved_by = $1, approved_at = NOW()
     WHERE status = 'pending'
     RETURNING user_id, device_id`,
    [adminId]
  )
  const affected = []
  for (const r of rows) affected.push(await releaseHeld(r.user_id, r.device_id))
  return { approved: rows.length, affected }
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
  touchDevice, evaluateDevice,
  listDevices, countPending, setStatus, approveAllPending, renameDevice, deleteDevice,
}
