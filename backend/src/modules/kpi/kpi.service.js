'use strict'
// KPI THÁNG (Phase C). Tháng CHƯA chốt → tính LIVE từ checklist/tasks. Tháng ĐÃ chốt → đọc snapshot
// từ kpi_monthly_results (khóa số liệu lịch sử). Điểm khối lượng = Σ điểm bước LEAF đã tick trong
// tháng (theo completed_at, gom theo người phụ trách). Đúng hạn = task đúng hạn / được giao (due_date
// trong tháng). "Được giao" & "khối lượng" neo mốc khác nhau — cố ý (đo 2 thứ khác nhau).
const { query } = require('../../config/db')
const audit = require('../../lib/audit')

// Mốc tháng (chuỗi ngày) — [start, end)
function monthBounds(year, month) {
  const y = parseInt(year, 10), m = parseInt(month, 10)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { y, m, start, end }
}

// CTE xác định bước LEAF (mục phụ, hoặc mục chính không con) — khớp cách tính tiến độ.
const LEAF_CTE = `
  WITH leaf AS (
    SELECT ci.task_id, ci.points, ci.is_completed, ci.completed_at,
           NOT (ci.level = 0 AND COALESCE(LEAD(ci.level) OVER (PARTITION BY ci.task_id ORDER BY ci.step_order, ci.id), 0) = 1) AS is_leaf
    FROM task_checklist_items ci
  )`

async function isMonthClosed(year, month) {
  const { y, m } = monthBounds(year, month)
  const { rows: [r] } = await query(
    'SELECT 1 FROM kpi_monthly_results WHERE period_year = $1 AND period_month = $2 LIMIT 1', [y, m])
  return !!r
}

// ── Danh sách KPI (LIVE) — mỗi NV active 1 dòng ───────────────────────────────
async function listLive(year, month, userId = null) {
  const { start, end } = monthBounds(year, month)
  const params = [start, end]
  let userCond = ''
  if (userId) { params.push(userId); userCond = ` AND u.id = $${params.length}` }
  const { rows } = await query(`
    ${LEAF_CTE},
    vol AS (
      SELECT t.assigned_to AS user_id, COALESCE(SUM(leaf.points), 0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date
        AND t.assigned_to IS NOT NULL
      GROUP BY t.assigned_to
    ),
    ont AS (
      SELECT t.assigned_to AS user_id,
             COUNT(*)::int AS assigned_count,
             COUNT(*) FILTER (WHERE t.status = 'completed' AND t.completed_at::date <= t.due_date)::int AS on_time_count
      FROM tasks t
      WHERE t.assigned_to IS NOT NULL AND t.due_date >= $1::date AND t.due_date < $2::date
      GROUP BY t.assigned_to
    )
    SELECT u.id AS user_id, u.name AS user_name, u.job_title,
           COALESCE(vol.volume_points, 0) AS volume_points,
           COALESCE(ont.assigned_count, 0) AS assigned_count,
           COALESCE(ont.on_time_count, 0)  AS on_time_count
    FROM users u
    LEFT JOIN vol ON vol.user_id = u.id
    LEFT JOIN ont ON ont.user_id = u.id
    WHERE u.status = 'active'${userCond}
    ORDER BY u.name
  `, params)
  return rows.map(toKpiDto)
}

function toKpiDto(r) {
  const assigned = parseInt(r.assigned_count, 10) || 0
  const onTime = parseInt(r.on_time_count, 10) || 0
  return {
    userId: r.user_id, userName: r.user_name, jobTitle: r.job_title ?? null,
    volumePoints: parseInt(r.volume_points, 10) || 0,
    assignedCount: assigned, onTimeCount: onTime,
    onTimePct: assigned > 0 ? Math.round((onTime * 100) / assigned) : null,
  }
}

// ── Danh sách KPI (đọc snapshot nếu tháng đã chốt) ────────────────────────────
async function listMonthly(year, month, userId = null) {
  const { y, m } = monthBounds(year, month)
  if (await isMonthClosed(y, m)) {
    const params = [y, m]
    let userCond = ''
    if (userId) { params.push(userId); userCond = ` AND k.user_id = $${params.length}` }
    const { rows } = await query(`
      SELECT k.user_id, u.name AS user_name, u.job_title,
             k.volume_points, k.assigned_count, k.on_time_count, k.on_time_pct
      FROM kpi_monthly_results k JOIN users u ON u.id = k.user_id
      WHERE k.period_year = $1 AND k.period_month = $2${userCond}
      ORDER BY u.name`, params)
    return { closed: true, rows: rows.map((r) => ({
      userId: r.user_id, userName: r.user_name, jobTitle: r.job_title ?? null,
      volumePoints: r.volume_points, assignedCount: r.assigned_count,
      onTimeCount: r.on_time_count, onTimePct: r.on_time_pct,
    })) }
  }
  return { closed: false, rows: await listLive(y, m, userId) }
}

// ── Chi tiết breakdown (LIVE) theo công ty + loại CV cho 1 NV ──────────────────
async function detailLive(year, month, userId) {
  const { start, end } = monthBounds(year, month)
  const p = [start, end, userId]
  const [byCompany, byType] = await Promise.all([
    query(`
      ${LEAF_CTE}
      SELECT c.id AS key, c.name AS label, COALESCE(SUM(leaf.points),0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id JOIN companies c ON c.id = t.company_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY c.id, c.name ORDER BY volume_points DESC`, p),
    query(`
      ${LEAF_CTE}
      SELECT tt.id AS key, tt.name AS label, COALESCE(SUM(leaf.points),0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id JOIN task_types tt ON tt.id = t.task_type_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY tt.id, tt.name ORDER BY volume_points DESC`, p),
  ])
  return {
    byCompany: byCompany.rows.map((r) => ({ key: r.key, label: r.label, volumePoints: r.volume_points })),
    byType:    byType.rows.map((r) => ({ key: r.key, label: r.label, volumePoints: r.volume_points })),
  }
}

async function getDetail(year, month, userId) {
  const { y, m } = monthBounds(year, month)
  if (await isMonthClosed(y, m)) {
    const { rows: [k] } = await query(
      'SELECT breakdown FROM kpi_monthly_results WHERE user_id = $1 AND period_year = $2 AND period_month = $3',
      [userId, y, m])
    return { closed: true, ...(k?.breakdown ?? { byCompany: [], byType: [] }) }
  }
  return { closed: false, ...(await detailLive(y, m, userId)) }
}

// ── Chốt sổ tháng: tính LIVE rồi ghi snapshot (khóa) ──────────────────────────
async function closeMonth(year, month, actorId, ipAddress, userAgent) {
  const { y, m } = monthBounds(year, month)
  const list = await listLive(y, m)
  for (const k of list) {
    const detail = await detailLive(y, m, k.userId)
    await query(`
      INSERT INTO kpi_monthly_results
        (user_id, period_year, period_month, volume_points, assigned_count, on_time_count, on_time_pct,
         breakdown, status, closed_by, closed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'closed',$9,NOW())
      ON CONFLICT (user_id, period_year, period_month) DO UPDATE SET
        volume_points = EXCLUDED.volume_points, assigned_count = EXCLUDED.assigned_count,
        on_time_count = EXCLUDED.on_time_count, on_time_pct = EXCLUDED.on_time_pct,
        breakdown = EXCLUDED.breakdown, status = 'closed',
        closed_by = EXCLUDED.closed_by, closed_at = NOW(), computed_at = NOW()`,
      [k.userId, y, m, k.volumePoints, k.assignedCount, k.onTimeCount, k.onTimePct,
       JSON.stringify(detail), actorId])
  }
  await audit.log({
    userId: actorId, action: 'kpi.month_closed', targetType: 'kpi_monthly_results',
    targetId: null, meta: { year: y, month: m, users: list.length }, ipAddress, userAgent,
  })
  return { year: y, month: m, users: list.length }
}

async function reopenMonth(year, month, actorId, ipAddress, userAgent) {
  const { y, m } = monthBounds(year, month)
  await query('DELETE FROM kpi_monthly_results WHERE period_year = $1 AND period_month = $2', [y, m])
  await audit.log({
    userId: actorId, action: 'kpi.month_reopened', targetType: 'kpi_monthly_results',
    targetId: null, meta: { year: y, month: m }, ipAddress, userAgent,
  })
  return { year: y, month: m }
}

// ── Phase D: MỐC quy đổi % đúng hạn → điểm (kpi_ontime_tiers) ─────────────────
function tierToDto(t) {
  return {
    id: t.id, minPct: t.min_pct, maxPct: t.max_pct, points: Number(t.points),
    sortOrder: t.sort_order, isActive: t.is_active,
  }
}
async function listTiers({ activeOnly = false } = {}) {
  const { rows } = await query(
    `SELECT * FROM kpi_ontime_tiers ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY sort_order, created_at`)
  return rows.map(tierToDto)
}
async function createTier(data, actorId) {
  const { rows: [m] } = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM kpi_ontime_tiers')
  const { rows: [t] } = await query(
    `INSERT INTO kpi_ontime_tiers (min_pct, max_pct, points, sort_order, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [data.minPct ?? null, data.maxPct ?? null, data.points ?? 0, data.sortOrder ?? m.n, data.isActive ?? true, actorId])
  return tierToDto(t)
}
async function updateTier(id, data) {
  const map = { minPct: 'min_pct', maxPct: 'max_pct', points: 'points', sortOrder: 'sort_order', isActive: 'is_active' }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  const { rows: [t] } = await query(
    `UPDATE kpi_ontime_tiers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
  if (!t) { const e = new Error('Không tìm thấy mốc'); e.status = 404; throw e }
  return tierToDto(t)
}
async function deleteTier(id) {
  const { rows } = await query('DELETE FROM kpi_ontime_tiers WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy mốc'); e.status = 404; throw e }
}

// Dò mốc/xếp loại theo dải [min, max] (bao gồm 2 đầu; NULL = không giới hạn).
// Chịu được trường hợp admin nhập min/max NGƯỢC (vd E: -21..-100) → tự chuẩn hoá lo≤hi.
function matchRange(value, list, minKey, maxKey) {
  if (value == null) return null
  for (const x of list) {
    let lo = x[minKey], hi = x[maxKey]
    if (lo != null && hi != null && lo > hi) { const t = lo; lo = hi; hi = t }
    if ((lo == null || value >= lo) && (hi == null || value <= hi)) return x
  }
  return null
}

// ── Phase D: HIỆU SUẤT TỔNG HỢP = điểm KPI (từ % đúng hạn) + net thưởng/phạt → xếp loại → tiền ──
async function getPerformance(year, month, userId = null) {
  const { y, m } = monthBounds(year, month)
  const base = await listMonthly(y, m, userId)                    // { closed, rows:[{...onTimePct, volumePoints}] }
  const tiers = await listTiers({ activeOnly: true })
  // grades ở bảng kpi_grades (module reward-penalty) — đọc trực tiếp.
  const { rows: grades } = await query(
    `SELECT code, label, min_points, max_points, amount, sort_order FROM kpi_grades WHERE is_active = TRUE ORDER BY sort_order, created_at`)
  const gradeList = grades.map((g, idx) => ({
    code: g.code, label: g.label, sortOrder: idx,
    minPoints: g.min_points != null ? Number(g.min_points) : null,
    maxPoints: g.max_points != null ? Number(g.max_points) : null,
    amount: Number(g.amount),
  }))
  // net thưởng/phạt (đã duyệt) theo NV trong kỳ.
  const rpParams = [y, m]
  let rpUserCond = ''
  if (userId) { rpParams.push(userId); rpUserCond = ` AND user_id = $${rpParams.length}` }
  const { rows: rp } = await query(
    `SELECT user_id, COALESCE(SUM(points),0)::numeric AS net FROM staff_reward_penalty
     WHERE period_year = $1 AND period_month = $2 AND status = 'approved'${rpUserCond}
     GROUP BY user_id`, rpParams)
  const netByUser = new Map(rp.map((r) => [r.user_id, Number(r.net)]))

  const rows = base.rows.map((r) => {
    const tier = matchRange(r.onTimePct, tiers, 'minPct', 'maxPct')
    const kpiPoints = tier ? tier.points : 0
    const rpNet = netByUser.get(r.userId) ?? 0
    const totalPoints = kpiPoints + rpNet
    const grade = matchRange(totalPoints, gradeList, 'minPoints', 'maxPoints')
    return {
      ...r,
      kpiPoints, rewardPenaltyNet: rpNet, totalPoints,
      gradeCode: grade?.code ?? null, gradeLabel: grade?.label ?? null, gradeSort: grade?.sortOrder ?? null,
      amount: grade ? grade.amount : 0,
    }
  })
  return { closed: base.closed, rows }
}

module.exports = {
  listMonthly, getDetail, closeMonth, reopenMonth, isMonthClosed,
  listTiers, createTier, updateTier, deleteTier, getPerformance,
}
