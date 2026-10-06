'use strict'
// Quản lý ảnh selfie chấm công: thống kê dung lượng, liệt kê, dọn ảnh cũ.
// Dọn ảnh = xoá FILE trên đĩa + gỡ photo_path; GIỮ NGUYÊN log giờ vào/ra & bản ghi công.

const fs       = require('fs')
const { query } = require('../../config/db')
const storage  = require('../../lib/storage')
const logger   = require('../../config/logger')

const RETENTION_KEY     = 'attendance.photo_retention_months'
const DEFAULT_RETENTION = 3
const MIN_RETENTION = 1
const MAX_RETENTION = 60

async function getRetentionMonths() {
  const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [RETENTION_KEY])
  const n = parseInt(row?.value, 10)
  return Number.isInteger(n) && n >= MIN_RETENTION && n <= MAX_RETENTION ? n : DEFAULT_RETENTION
}

async function setRetentionMonths(months, updatedBy) {
  const n = parseInt(months, 10)
  if (!Number.isInteger(n) || n < MIN_RETENTION || n > MAX_RETENTION) {
    throw Object.assign(new Error(`Số tháng giữ ảnh phải từ ${MIN_RETENTION} đến ${MAX_RETENTION}`), { status: 400 })
  }
  await query(
    `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, 'Số tháng giữ ảnh chấm công trước khi tự động dọn.', $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [RETENTION_KEY, String(n), updatedBy ?? null]
  )
  return n
}

// Ngày đầu của (tháng hiện tại − (N−1)) → giữ N tháng gần nhất, dọn phần cũ hơn.
// N=3 tại 2026-10 → '2026-08-01' (giữ T8, T9, T10).
function retentionCutoff(months) {
  const d = new Date()
  const c = new Date(d.getFullYear(), d.getMonth() - (months - 1), 1)
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-01`
}

const isoDate = (val) => new Date(val).toISOString().slice(0, 10)

function fileBytes(relPath) {
  try { return fs.statSync(storage.toAbsolute(relPath)).size }
  catch { return 0 }
}

// Thống kê: tổng số ảnh/dung lượng, chia theo tháng, và phần sẽ bị dọn theo retention hiện hành.
async function getPhotoStats() {
  const months = await getRetentionMonths()
  const cutoff = retentionCutoff(months)
  const { rows } = await query(
    `SELECT photo_path, logged_at FROM attendance_logs WHERE photo_path IS NOT NULL`
  )
  let totalBytes = 0, deletableCount = 0, deletableBytes = 0
  const byMonth = new Map()
  for (const r of rows) {
    const b = fileBytes(r.photo_path)
    totalBytes += b
    const key = isoDate(r.logged_at).slice(0, 7) // YYYY-MM
    const cur = byMonth.get(key) || { month: key, count: 0, bytes: 0 }
    cur.count += 1; cur.bytes += b
    byMonth.set(key, cur)
    if (isoDate(r.logged_at) < cutoff) { deletableCount += 1; deletableBytes += b }
  }
  return {
    totalCount: rows.length,
    totalBytes,
    retentionMonths: months,
    cutoff,                 // ảnh TRƯỚC ngày này sẽ bị dọn tự động
    deletableCount,
    deletableBytes,
    byMonth: [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month)),
  }
}

// Liệt kê ảnh (phân trang) để admin duyệt — lọc theo tháng (YYYY-MM), nhân viên, loại (Vào/Ra).
async function listPhotos({ month, userId, logType, page = 1, limit = 30 }) {
  const where = ['l.photo_path IS NOT NULL']
  const params = []
  if (month && /^\d{4}-\d{2}$/.test(month)) { params.push(month); where.push(`to_char(l.logged_at, 'YYYY-MM') = $${params.length}`) }
  if (userId) { params.push(userId); where.push(`l.user_id = $${params.length}`) }
  if (logType === 'check_in' || logType === 'check_out') { params.push(logType); where.push(`l.log_type = $${params.length}`) }
  const whereSql = where.join(' AND ')

  const totalRes = await query(`SELECT count(*)::int n FROM attendance_logs l WHERE ${whereSql}`, params)
  const total = totalRes.rows[0].n

  const p = Math.max(1, parseInt(page, 10) || 1)
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 30))
  params.push(lim); params.push((p - 1) * lim)
  const { rows } = await query(
    `SELECT l.id, l.user_id, u.name AS user_name, l.log_type, l.logged_at, l.method
     FROM attendance_logs l JOIN users u ON u.id = l.user_id
     WHERE ${whereSql}
     ORDER BY l.logged_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )
  return {
    items: rows.map((r) => ({
      logId: r.id, userId: r.user_id, userName: r.user_name,
      logType: r.log_type, loggedAt: r.logged_at, method: r.method,
    })),
    total, page: p, limit: lim,
  }
}

// Xoá ảnh theo khoảng thời gian [gte, lt) (chuỗi 'YYYY-MM-DD', mỗi vế tuỳ chọn).
// Chỉ xoá file + gỡ photo_path; GIỮ log giờ & bản ghi công.
async function deleteByRange({ gte, lt }) {
  const conds = ['photo_path IS NOT NULL']
  const params = []
  if (gte) { params.push(gte); conds.push(`logged_at >= $${params.length}`) }
  if (lt)  { params.push(lt);  conds.push(`logged_at < $${params.length}`) }
  const { rows } = await query(
    `SELECT id, photo_path FROM attendance_logs WHERE ${conds.join(' AND ')}`,
    params
  )
  if (!rows.length) return { deletedCount: 0, freedBytes: 0 }
  let freedBytes = 0
  for (const r of rows) {
    freedBytes += fileBytes(r.photo_path)
    storage.removeFile(r.photo_path)
  }
  await query(`UPDATE attendance_logs SET photo_path = NULL WHERE id = ANY($1)`, [rows.map((r) => r.id)])
  return { deletedCount: rows.length, freedBytes }
}

// Ngày đầu tháng KẾ TIẾP của 'YYYY-MM' → dùng làm cận trên (lt).
function nextMonthStart(month) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m, 1) // m (1-based) → tháng kế tiếp
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Admin bấm dọn. Truyền 1 trong 2:
//   beforeMonth 'YYYY-MM' → xoá mọi ảnh TRƯỚC tháng đó.
//   month 'YYYY-MM'       → xoá đúng ảnh CỦA tháng đó (kể cả tháng hiện tại).
async function cleanupBefore({ beforeMonth, month }) {
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(String(month))) {
      throw Object.assign(new Error('Tháng không hợp lệ (định dạng YYYY-MM)'), { status: 400 })
    }
    return { ...(await deleteByRange({ gte: `${month}-01`, lt: nextMonthStart(month) })), month }
  }
  if (!/^\d{4}-\d{2}$/.test(String(beforeMonth || ''))) {
    throw Object.assign(new Error('Tháng không hợp lệ (định dạng YYYY-MM)'), { status: 400 })
  }
  return { ...(await deleteByRange({ lt: `${beforeMonth}-01` })), cutoff: `${beforeMonth}-01` }
}

// Job tự động: dọn theo số tháng giữ đã cấu hình.
async function runRetentionCleanup() {
  const months = await getRetentionMonths()
  const cutoff = retentionCutoff(months)
  const res = await deleteByRange({ lt: cutoff })
  if (res.deletedCount > 0) {
    logger.info(`[PhotoCleanup] Đã dọn ${res.deletedCount} ảnh cũ (trước ${cutoff}), giải phóng ${(res.freedBytes / 1024 / 1024).toFixed(1)}MB`)
  }
  return { ...res, cutoff }
}

module.exports = {
  getRetentionMonths, setRetentionMonths,
  getPhotoStats, listPhotos, cleanupBefore, runRetentionCleanup,
  DEFAULT_RETENTION, MIN_RETENTION, MAX_RETENTION,
}
