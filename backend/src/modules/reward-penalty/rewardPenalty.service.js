'use strict'
// THƯỞNG/PHẠT — nghiệp vụ. Giá trị enum lấy ĐỘNG qua lib/enums (không hardcode).
const { query } = require('../../config/db')
const enums = require('../../lib/enums')

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
    points: Number(e.points), amount: e.amount != null ? Number(e.amount) : null,
    note: e.note ?? null, source: e.source, status: e.status,
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
  let kind = data.kind, categoryLabel = data.categoryLabel, points = data.points, amount = data.amount ?? null
  if (data.ruleId) {
    const { rows: [rule] } = await query('SELECT * FROM kpi_rules WHERE id = $1', [data.ruleId])
    if (!rule) { const e = new Error('Không tìm thấy quy tắc'); e.status = 404; throw e }
    kind = kind ?? rule.kind
    categoryLabel = categoryLabel ?? rule.label
    points = points ?? Number(rule.default_points)
    amount = amount ?? (rule.default_amount != null ? Number(rule.default_amount) : null)
  }
  if (!categoryLabel) { const e = new Error('Thiếu danh mục / nhãn'); e.status = 422; throw e }
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
        points, amount, note, source, status, created_by, approved_by, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [data.userId, py, pm, data.occurredOn, data.ruleId ?? null, kind, categoryLabel,
     points, amount, data.note ?? null, data.source || 'manual', status, actorId, approvedBy, approvedAt])
  return getEntry(e.id)
}

async function updateEntry(id, data) {
  if (data.kind !== undefined)   await assertEnum('reward_penalty_kind', data.kind, 'Loại')
  if (data.status !== undefined) await assertEnum('reward_penalty_status', data.status, 'Trạng thái')
  const map = {
    kind: 'kind', categoryLabel: 'category_label', points: 'points', amount: 'amount',
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
  return getEntry(id)
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

// ── TỔNG HỢP theo kỳ (chỉ dòng ĐÃ DUYỆT) — payroll sẽ đọc net_amount theo tháng ──
async function getSummary({ year, month }) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.name AS user_name,
            COALESCE(SUM(points) FILTER (WHERE points > 0), 0) AS reward_points,
            COALESCE(SUM(points) FILTER (WHERE points < 0), 0) AS penalty_points,
            COALESCE(SUM(points), 0)                           AS net_points,
            COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS reward_amount,
            COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0) AS penalty_amount,
            COALESCE(SUM(amount), 0)                           AS net_amount
       FROM staff_reward_penalty s JOIN users u ON u.id = s.user_id
      WHERE s.period_year = $1 AND s.period_month = $2 AND s.status = 'approved'
      GROUP BY u.id, u.name ORDER BY u.name`, [year, month])
  return rows.map((r) => ({
    userId: r.user_id, userName: r.user_name,
    rewardPoints: Number(r.reward_points), penaltyPoints: Number(r.penalty_points), netPoints: Number(r.net_points),
    rewardAmount: Number(r.reward_amount), penaltyAmount: Number(r.penalty_amount), netAmount: Number(r.net_amount),
  }))
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

module.exports = {
  listRules, createRule, updateRule, deleteRule,
  listEntries, createEntry, updateEntry, approveEntry, deleteEntry, getEntry,
  getSummary, listYears,
}
