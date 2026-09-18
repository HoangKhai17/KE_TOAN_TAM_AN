'use strict'
// THƯỞNG/PHẠT — nghiệp vụ. Giá trị enum lấy ĐỘNG qua lib/enums (không hardcode).
const { query } = require('../../config/db')
const enums = require('../../lib/enums')
const { emitToUser, createAndEmit } = require('../../lib/notify')

// Bắn popup tức thời cho nhân viên khi dòng thưởng/phạt của họ ĐÃ DUYỆT.
function notifyStaffApproved(entry) {
  if (!entry || entry.status !== 'approved') return
  emitToUser(entry.userId, 'reward_penalty:new', entry)
}

async function assertEnum(typeKey, value, field) {
  if (value == null || value === '') return
  const vals = await enums.getValues(typeKey)
  if (!vals.includes(value)) {
    throw Object.assign(new Error(`Giá trị "${field}" không hợp lệ: ${value}`), { status: 422 })
  }
}

// ── DTO ──────────────────────────────────────────────────────────────────────
function ruleToDto(r) {
  return {
    id: r.id, label: r.label, kind: r.kind,
    defaultPoints: Number(r.default_points),
    detectSource: r.detect_source, isActive: r.is_active, sortOrder: r.sort_order,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}
function entryToDto(e) {
  return {
    id: e.id, userId: e.user_id, userName: e.user_name ?? null,
    periodYear: e.period_year, periodMonth: e.period_month, occurredOn: e.occurred_on,
    ruleId: e.rule_id ?? null, kind: e.kind, categoryLabel: e.category_label,
    points: Number(e.points),
    note: e.note ?? null, source: e.source, status: e.status,
    discussion: Array.isArray(e.discussion) ? e.discussion : [],
    createdBy: e.created_by ?? null, approvedBy: e.approved_by ?? null, approvedAt: e.approved_at ?? null,
    createdAt: e.created_at, updatedAt: e.updated_at,
  }
}

// ── QUY TẮC (admin) ──────────────────────────────────────────────────────────
async function listRules({ activeOnly = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM kpi_rules ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY sort_order, created_at`)
  return rows.map(ruleToDto)
}

async function createRule(data, actorId) {
  await assertEnum('reward_penalty_kind', data.kind, 'Loại')
  await assertEnum('reward_penalty_detect', data.detectSource, 'Nguồn phát hiện')
  const { rows: [m] } = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM kpi_rules')
  const { rows: [r] } = await query(
    `INSERT INTO kpi_rules (label, kind, default_points, detect_source, sort_order, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.label, data.kind || 'violation', data.defaultPoints ?? 0,
     data.detectSource || 'manual', data.sortOrder ?? m.n, actorId])
  return ruleToDto(r)
}

async function updateRule(id, data) {
  if (data.kind !== undefined) await assertEnum('reward_penalty_kind', data.kind, 'Loại')
  if (data.detectSource !== undefined) await assertEnum('reward_penalty_detect', data.detectSource, 'Nguồn phát hiện')
  const map = {
    label: 'label', kind: 'kind', defaultPoints: 'default_points',
    detectSource: 'detect_source', isActive: 'is_active', sortOrder: 'sort_order',
  }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  const { rows: [r] } = await query(
    `UPDATE kpi_rules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
  if (!r) { const e = new Error('Không tìm thấy quy tắc'); e.status = 404; throw e }
  return ruleToDto(r)
}

async function deleteRule(id) {
  const { rows } = await query('DELETE FROM kpi_rules WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy quy tắc'); e.status = 404; throw e }
}

// ── SỔ GHI ───────────────────────────────────────────────────────────────────
// scopeUserId: nếu có → chỉ lấy dòng của user đó (staff xem của mình). Admin để trống.
async function listEntries({ year, month, userId, kind, status, scopeUserId } = {}) {
  const conds = []; const params = []
  const add = (sql, val) => { params.push(val); conds.push(sql.replace('$?', `$${params.length}`)) }
  if (scopeUserId) add('s.user_id = $?', scopeUserId)
  else if (userId) add('s.user_id = $?', userId)
  if (year)  add('s.period_year = $?', year)
  if (month) add('s.period_month = $?', month)
  if (kind)  add('s.kind = $?', kind)
  if (status) add('s.status = $?', status)
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT s.*, u.name AS user_name FROM staff_reward_penalty s
       JOIN users u ON u.id = s.user_id
     ${where}
     ORDER BY s.occurred_on DESC, s.created_at DESC`, params)
  return rows.map(entryToDto)
}

async function createEntry(data, actorId) {
  await assertEnum('reward_penalty_kind', data.kind, 'Loại')
  await assertEnum('reward_penalty_source', data.source, 'Nguồn ghi nhận')
  await assertEnum('reward_penalty_status', data.status, 'Trạng thái')

  // Lấy mặc định từ quy tắc (nếu chọn) — đóng băng nhãn + loại.
  let kind = data.kind, categoryLabel = data.categoryLabel, points = data.points
  if (data.ruleId) {
    const { rows: [rule] } = await query('SELECT * FROM kpi_rules WHERE id = $1', [data.ruleId])
    if (!rule) { const e = new Error('Không tìm thấy quy tắc'); e.status = 404; throw e }
    kind = kind ?? rule.kind
    categoryLabel = categoryLabel ?? rule.label
    points = points ?? Number(rule.default_points)
  }
  if (!categoryLabel) { const e = new Error('Thiếu tên quy tắc'); e.status = 422; throw e }
  kind = kind || 'violation'
  points = points ?? 0

  const occ = new Date(data.occurredOn)
  const py = occ.getUTCFullYear(); const pm = occ.getUTCMonth() + 1
  const status = data.status || 'approved'
  const approvedBy = status === 'approved' ? actorId : null
  const approvedAt = status === 'approved' ? new Date() : null

  const { rows: [e] } = await query(
    `INSERT INTO staff_reward_penalty
       (user_id, period_year, period_month, occurred_on, rule_id, kind, category_label,
        points, note, source, status, created_by, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [data.userId, py, pm, data.occurredOn, data.ruleId ?? null, kind, categoryLabel,
     points, data.note ?? null, data.source || 'manual', status, actorId, approvedBy, approvedAt])
  const dto = await getEntry(e.id)
  notifyStaffApproved(dto)
  return dto
}

async function updateEntry(id, data) {
  if (data.kind !== undefined)   await assertEnum('reward_penalty_kind', data.kind, 'Loại')
  if (data.status !== undefined) await assertEnum('reward_penalty_status', data.status, 'Trạng thái')
  const map = {
    kind: 'kind', categoryLabel: 'category_label', points: 'points', ruleId: 'rule_id',
    note: 'note', occurredOn: 'occurred_on', userId: 'user_id', status: 'status',
  }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  // Chuyển về trạng thái KHÔNG phải 'approved' → xoá thông tin duyệt
  if (data.status !== undefined && data.status !== 'approved') {
    sets.push('approved_by = NULL'); sets.push('approved_at = NULL')
  }
  // Đổi ngày → cập nhật kỳ
  if (data.occurredOn !== undefined) {
    const o = new Date(data.occurredOn)
    params.push(o.getUTCFullYear()); sets.push(`period_year = $${params.length}`)
    params.push(o.getUTCMonth() + 1); sets.push(`period_month = $${params.length}`)
  }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  const { rows } = await query(
    `UPDATE staff_reward_penalty SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING id`, params)
  if (!rows.length) { const e = new Error('Không tìm thấy bản ghi'); e.status = 404; throw e }
  return getEntry(id)
}

async function approveEntry(id, actorId) {
  const { rows } = await query(
    `UPDATE staff_reward_penalty SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING id`, [id, actorId])
  if (!rows.length) { const e = new Error('Không tìm thấy bản ghi'); e.status = 404; throw e }
  const dto = await getEntry(id)
  notifyStaffApproved(dto)
  return dto
}

// GIẢI TRÌNH dạng hội thoại: staff và admin cùng nhắn trong 1 thread trên dòng.
//   actor = { id, role }. Non-admin chỉ được nhắn trên dòng của MÌNH.
async function discussEntry(id, actor, text) {
  const { rows: [row] } = await query('SELECT user_id, created_by, category_label FROM staff_reward_penalty WHERE id = $1', [id])
  if (!row) { const e = new Error('Không tìm thấy bản ghi'); e.status = 404; throw e }
  const isAdmin = actor.role === 'admin'
  if (!isAdmin && row.user_id !== actor.id) { const e = new Error('Bạn chỉ được giải trình dòng của mình'); e.status = 403; throw e }
  const { rows: [au] } = await query('SELECT name FROM users WHERE id = $1', [actor.id])
  const msg = { role: isAdmin ? 'admin' : 'staff', name: au?.name ?? '', text, at: new Date().toISOString() }
  await query(
    `UPDATE staff_reward_penalty SET discussion = COALESCE(discussion, '[]'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify([msg])])
  const dto = await getEntry(id)
  const staffId = row.user_id, adminId = row.created_by
  const recipient = isAdmin ? staffId : adminId
  if (recipient && recipient !== actor.id) {
    createAndEmit(recipient, 'reward_penalty',
      isAdmin ? `Phản hồi giải trình` : `Giải trình: ${msg.name}`,
      `${isAdmin ? 'Quản lý' : msg.name} (${row.category_label}): ${text}`).catch(() => {})
  }
  // Cả 2 phía refresh bảng.
  for (const uid of [staffId, adminId]) if (uid) emitToUser(uid, 'reward_penalty:discussion', { id })
  return dto
}

async function deleteEntry(id) {
  const { rows } = await query('DELETE FROM staff_reward_penalty WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy bản ghi'); e.status = 404; throw e }
}

async function getEntry(id) {
  const { rows: [e] } = await query(
    `SELECT s.*, u.name AS user_name FROM staff_reward_penalty s JOIN users u ON u.id = s.user_id WHERE s.id = $1`, [id])
  if (!e) { const err = new Error('Không tìm thấy bản ghi'); err.status = 404; throw err }
  return entryToDto(e)
}

// ── TỔNG HỢP theo kỳ (chỉ dòng ĐÃ DUYỆT) — ĐIỂM THUẦN (chưa quy ra tiền) ──
// Gộp NGAY TẠI DB theo (nhân viên × tên quy tắc × loại) rồi roll-up ở server, nên
// dữ liệu trả về gọn (không kéo từng dòng về client). Kèm chi tiết items để bung.
async function getSummary({ year, month }) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.name AS user_name, s.category_label, s.kind,
            COUNT(*)::int AS cnt, COALESCE(SUM(s.points), 0) AS points
       FROM staff_reward_penalty s JOIN users u ON u.id = s.user_id
      WHERE s.period_year = $1 AND s.period_month = $2 AND s.status = 'approved'
      GROUP BY u.id, u.name, s.category_label, s.kind
      ORDER BY u.name, ABS(SUM(s.points)) DESC`, [year, month])
  const byUser = new Map()
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, { userId: r.user_id, userName: r.user_name, rewardPoints: 0, penaltyPoints: 0, netPoints: 0, items: [] })
    }
    const u = byUser.get(r.user_id)
    const pts = Number(r.points)
    if (pts > 0) u.rewardPoints += pts
    else if (pts < 0) u.penaltyPoints += pts
    u.netPoints += pts
    u.items.push({ label: r.category_label, kind: r.kind, count: r.cnt, points: pts })
  }
  return [...byUser.values()]
}

// Danh sách NĂM có dữ liệu (để dropdown, không hardcode) — luôn kèm năm hiện tại.
async function listYears({ scopeUserId } = {}) {
  const params = []; let where = ''
  if (scopeUserId) { params.push(scopeUserId); where = 'WHERE user_id = $1' }
  const { rows } = await query(`SELECT DISTINCT period_year AS y FROM staff_reward_penalty ${where}`, params)
  const set = new Set(rows.map((r) => Number(r.y)))
  set.add(new Date().getFullYear())
  return [...set].sort((a, b) => b - a)
}

// ── QUY ĐỔI XẾP LOẠI (grades) ────────────────────────────────────────────────
function gradeToDto(g) {
  return {
    id: g.id, code: g.code, label: g.label,
    minPoints: g.min_points != null ? Number(g.min_points) : null,
    maxPoints: g.max_points != null ? Number(g.max_points) : null,
    amount: Number(g.amount), sortOrder: g.sort_order, isActive: g.is_active,
    createdAt: g.created_at, updatedAt: g.updated_at,
  }
}
async function listGrades({ activeOnly = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM kpi_grades ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY sort_order, created_at`)
  return rows.map(gradeToDto)
}
async function createGrade(data, actorId) {
  const { rows: [m] } = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM kpi_grades')
  const { rows: [g] } = await query(
    `INSERT INTO kpi_grades (code, label, min_points, max_points, amount, sort_order, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [data.code || '', data.label, data.minPoints ?? null, data.maxPoints ?? null,
     data.amount ?? 0, data.sortOrder ?? m.n, data.isActive ?? true, actorId])
  return gradeToDto(g)
}
async function updateGrade(id, data) {
  const map = {
    code: 'code', label: 'label', minPoints: 'min_points', maxPoints: 'max_points',
    amount: 'amount', sortOrder: 'sort_order', isActive: 'is_active',
  }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  const { rows: [g] } = await query(
    `UPDATE kpi_grades SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
  if (!g) { const e = new Error('Không tìm thấy xếp loại'); e.status = 404; throw e }
  return gradeToDto(g)
}
async function deleteGrade(id) {
  const { rows } = await query('DELETE FROM kpi_grades WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy xếp loại'); e.status = 404; throw e }
}

module.exports = {
  listRules, createRule, updateRule, deleteRule,
  listEntries, createEntry, updateEntry, approveEntry, deleteEntry, getEntry, discussEntry,
  getSummary, listYears,
  listGrades, createGrade, updateGrade, deleteGrade,
}
