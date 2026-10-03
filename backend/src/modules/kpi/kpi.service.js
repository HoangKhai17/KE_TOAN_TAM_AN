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

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

// Mốc [start, end) cho KPI. Ưu tiên KHOẢNG NGÀY tùy chọn (from/to); không có thì theo năm+tháng.
// rpStart/rpEnd = mốc để cộng thưởng/phạt (neo theo THÁNG) — gồm mọi tháng mà khoảng chạm tới.
function resolveBounds({ year, month, from, to }) {
  if (from || to) {
    const start = from || '1900-01-01'
    const end = to ? addDays(to, 1) : '2999-01-01'
    return { start, end, custom: true, rpStart: start, rpEnd: to || '2999-01-01' }
  }
  const { start, end } = monthBounds(year, month)
  return { start, end, custom: false, rpStart: start, rpEnd: addDays(end, -1) }
}

// CTE xác định bước LEAF (mục phụ, hoặc mục chính không con) — khớp cách tính tiến độ.
const LEAF_CTE = `
  WITH leaf AS (
    SELECT ci.task_id, ci.points, ci.difficulty, ci.is_completed, ci.completed_at,
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
async function listLive(year, month, opts = {}) {
  const { userId = null, role = null, userIds = null, sources = null } = opts
  const { start, end } = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const params = [start, end]
  // Lọc theo NGUỒN (auto/manual/customer/…): thêm sớm để $3 cố định cho vol/ont. Bỏ trống = mọi nguồn.
  let srcClause = ''
  if (Array.isArray(sources) && sources.length) { params.push(sources); srcClause = ` AND t.source = ANY($${params.length}::text[])` }
  const uConds = ["u.status = 'active'"]
  if (userId) { params.push(userId); uConds.push(`u.id = $${params.length}`) }
  if (role) { params.push(role); uConds.push(`u.role = $${params.length}`) }
  if (Array.isArray(userIds) && userIds.length) { params.push(userIds); uConds.push(`u.id = ANY($${params.length}::uuid[])`) }
  const { rows } = await query(`
    ${LEAF_CTE},
    vol AS (
      SELECT t.assigned_to AS user_id, COALESCE(SUM(leaf.points), 0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date
        AND t.assigned_to IS NOT NULL${srcClause}
      GROUP BY t.assigned_to
    ),
    ont AS (
      -- Mẫu số "được giao" CHỈ gồm task ĐÃ ĐẾN HẠN (đã xong, HOẶC quá hạn): task chưa tới hạn
      -- & chưa xong KHÔNG tính là trượt (tránh phạt oan khi kỳ đang diễn ra). Kỳ đã khép thì
      -- mọi due_date đều < hôm nay nên không đổi.
      SELECT t.assigned_to AS user_id,
             COUNT(*)::int AS assigned_count,
             COUNT(*) FILTER (WHERE t.status = 'completed' AND t.completed_at::date <= t.due_date)::int AS on_time_count
      FROM tasks t
      WHERE t.assigned_to IS NOT NULL AND t.due_date >= $1::date AND t.due_date < $2::date
        AND (t.status = 'completed' OR t.due_date < CURRENT_DATE)${srcClause}
      GROUP BY t.assigned_to
    ),
    poss AS (
      -- TỔNG điểm có thể đạt trong kỳ (mẫu số cho "đạt/tổng"): cộng TẤT CẢ bước LEAF (xong hay chưa)
      -- của task đến hạn trong kỳ, CỘNG các bước đã tick trong kỳ của task ngoài kỳ → luôn ≥ điểm đã đạt.
      SELECT t.assigned_to AS user_id, COALESCE(SUM(leaf.points), 0)::int AS possible_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id
      WHERE leaf.is_leaf AND t.assigned_to IS NOT NULL${srcClause}
        AND ( (t.due_date >= $1::date AND t.due_date < $2::date)
              OR (leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date) )
      GROUP BY t.assigned_to
    )
    SELECT u.id AS user_id, u.name AS user_name, u.job_title,
           COALESCE(vol.volume_points, 0) AS volume_points,
           COALESCE(poss.possible_points, 0) AS possible_points,
           COALESCE(ont.assigned_count, 0) AS assigned_count,
           COALESCE(ont.on_time_count, 0)  AS on_time_count
    FROM users u
    LEFT JOIN vol ON vol.user_id = u.id
    LEFT JOIN poss ON poss.user_id = u.id
    LEFT JOIN ont ON ont.user_id = u.id
    WHERE ${uConds.join(' AND ')}
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
    volumePossible: Math.max(parseInt(r.possible_points, 10) || 0, parseInt(r.volume_points, 10) || 0),
    assignedCount: assigned, onTimeCount: onTime,
    onTimePct: assigned > 0 ? Math.round((onTime * 100) / assigned) : null,
  }
}

// ── Danh sách KPI (đọc snapshot nếu tháng đã chốt) ────────────────────────────
async function listMonthly(year, month, opts = {}) {
  const { userId = null, role = null, userIds = null } = opts
  // Khoảng ngày tùy chọn → luôn tính LIVE (không có snapshot cho khoảng tự do).
  if (opts.from || opts.to) return { closed: false, rows: await listLive(year, month, opts) }
  const { y, m } = monthBounds(year, month)
  if (await isMonthClosed(y, m)) {
    const params = [y, m]
    const conds = []
    if (userId) { params.push(userId); conds.push(`k.user_id = $${params.length}`) }
    if (role) { params.push(role); conds.push(`u.role = $${params.length}`) }
    if (Array.isArray(userIds) && userIds.length) { params.push(userIds); conds.push(`k.user_id = ANY($${params.length}::uuid[])`) }
    const { rows } = await query(`
      SELECT k.user_id, u.name AS user_name, u.job_title,
             k.volume_points, k.assigned_count, k.on_time_count, k.on_time_pct
      FROM kpi_monthly_results k JOIN users u ON u.id = k.user_id
      WHERE k.period_year = $1 AND k.period_month = $2${conds.length ? ' AND ' + conds.join(' AND ') : ''}
      ORDER BY u.name`, params)
    return { closed: true, rows: rows.map((r) => ({
      userId: r.user_id, userName: r.user_name, jobTitle: r.job_title ?? null,
      volumePoints: r.volume_points, volumePossible: r.volume_points, assignedCount: r.assigned_count,
      onTimeCount: r.on_time_count, onTimePct: r.on_time_pct,
    })) }
  }
  return { closed: false, rows: await listLive(y, m, opts) }
}

// ── Chi tiết breakdown (LIVE) theo công ty + loại CV cho 1 NV ──────────────────
async function detailLive(year, month, userId, opts = {}) {
  const { start, end } = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const p = [start, end, userId]
  const [byCompany, byType, bySource, byDifficulty, byStatus] = await Promise.all([
    query(`
      ${LEAF_CTE}
      SELECT c.id AS key, c.name AS label, COALESCE(SUM(leaf.points),0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id JOIN companies c ON c.id = t.company_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY c.id, c.name ORDER BY volume_points DESC`, p),
    query(`
      ${LEAF_CTE}
      SELECT COALESCE(tt.name, t.group_name, '(Không có loại)') AS label,
             COALESCE(SUM(leaf.points),0)::int AS volume_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id LEFT JOIN task_types tt ON tt.id = t.task_type_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY COALESCE(tt.name, t.group_name, '(Không có loại)') ORDER BY volume_points DESC`, p),
    // Tách theo NGUỒN task: định kỳ (auto) vs tự tạo (manual) — số lượng + đã đến hạn + đúng hạn + điểm.
    query(`
      ${LEAF_CTE},
      pts AS (
        SELECT t.id AS task_id, COALESCE(SUM(leaf.points),0)::int AS points
        FROM leaf JOIN tasks t ON t.id = leaf.task_id
        WHERE leaf.is_leaf AND leaf.is_completed
          AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date AND t.assigned_to = $3
        GROUP BY t.id
      )
      SELECT t.source AS key,
             COUNT(*)::int AS task_count,
             COUNT(*) FILTER (WHERE t.status='completed' OR t.due_date < CURRENT_DATE)::int AS due_count,
             COUNT(*) FILTER (WHERE t.status='completed' AND t.completed_at::date<=t.due_date)::int AS on_time_count,
             COALESCE(SUM(pts.points),0)::int AS volume_points
      FROM tasks t LEFT JOIN pts ON pts.task_id = t.id
      WHERE t.assigned_to = $3 AND t.due_date >= $1::date AND t.due_date < $2::date
      GROUP BY t.source ORDER BY task_count DESC`, p),
    // Phân bố theo ĐỘ KHÓ bước checklist — CHỈ nguồn định kỳ (auto). Nguồn khác không có độ khó.
    query(`
      ${LEAF_CTE}
      SELECT leaf.difficulty AS key,
             COUNT(*)::int AS step_count,
             COALESCE(SUM(leaf.points),0)::int AS total_points,
             COUNT(*) FILTER (WHERE leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date)::int AS done_count,
             COALESCE(SUM(leaf.points) FILTER (WHERE leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date),0)::int AS done_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id
      WHERE leaf.is_leaf AND leaf.difficulty IS NOT NULL AND t.source = 'auto' AND t.assigned_to = $3
        AND ( (t.due_date >= $1::date AND t.due_date < $2::date)
              OR (leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date) )
      GROUP BY leaf.difficulty`, p),
    // Theo TRẠNG THÁI task (enum task_status — GROUP BY động, KHÔNG hardcode key). "Quá hạn chưa xong"
    // = chưa có mốc hoàn thành (completed_at NULL) & đã qua hạn → không neo key enum.
    query(`
      SELECT t.status AS key, COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.completed_at IS NULL)::int AS overdue
      FROM tasks t
      WHERE t.assigned_to = $3 AND t.due_date >= $1::date AND t.due_date < $2::date
      GROUP BY t.status`, p),
  ])
  return {
    byCompany: byCompany.rows.map((r) => ({ key: r.key, label: r.label, volumePoints: r.volume_points })),
    byType:    byType.rows.map((r) => ({ key: r.label, label: r.label, volumePoints: r.volume_points })),
    bySource:  bySource.rows.map((r) => ({
      key: r.key, source: r.key,
      label: r.key === 'auto' ? 'Định kỳ (tự sinh)' : r.key === 'manual' ? 'Tự tạo (thủ công)' : (r.key || '(Khác)'),
      taskCount: r.task_count, dueCount: r.due_count, onTimeCount: r.on_time_count, volumePoints: r.volume_points,
    })),
    byDifficulty: byDifficulty.rows.map((r) => ({
      difficulty: r.key, stepCount: r.step_count, totalPoints: r.total_points,
      doneCount: r.done_count, donePoints: r.done_points,
    })),
    byStatus: byStatus.rows.map((r) => ({ status: r.key, count: r.cnt })),
    overdueCount: byStatus.rows.reduce((a, r) => a + r.overdue, 0),
  }
}

async function getDetail(year, month, userId, opts = {}) {
  if (opts.from || opts.to) return { closed: false, ...(await detailLive(year, month, userId, opts)) }
  const { y, m } = monthBounds(year, month)
  if (await isMonthClosed(y, m)) {
    const { rows: [k] } = await query(
      'SELECT breakdown FROM kpi_monthly_results WHERE user_id = $1 AND period_year = $2 AND period_month = $3',
      [userId, y, m])
    return { closed: true, ...(k?.breakdown ?? { byCompany: [], byType: [] }) }
  }
  return { closed: false, ...(await detailLive(y, m, userId)) }
}

// ── Danh sách TỪNG TASK của 1 NV trong kỳ (điểm khối lượng + đúng hạn) ─────────
// Gồm task có điểm bước LEAF tick trong tháng (theo completed_at) HOẶC task đến hạn trong tháng.
async function getUserTasks(year, month, userId, opts = {}) {
  const { start, end } = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const { rows } = await query(`
    ${LEAF_CTE},
    pts AS (
      SELECT t.id AS task_id, COALESCE(SUM(leaf.points), 0)::int AS points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id
      WHERE leaf.is_leaf AND leaf.is_completed
        AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date
        AND t.assigned_to = $3
      GROUP BY t.id
    )
    SELECT t.id, t.title, t.status, t.source, t.due_date, t.completed_at,
           c.name AS company_name,
           COALESCE(tt.name, t.group_name) AS type_name,
           COALESCE(pts.points, 0) AS points,
           (t.due_date >= $1::date AND t.due_date < $2::date) AS due_in_period,
           (t.due_date >= CURRENT_DATE AND t.status <> 'completed') AS not_due_yet,
           (t.status = 'completed' AND t.completed_at::date <= t.due_date) AS on_time
    FROM tasks t
    LEFT JOIN companies c   ON c.id  = t.company_id
    LEFT JOIN task_types tt ON tt.id = t.task_type_id
    LEFT JOIN pts ON pts.task_id = t.id
    WHERE t.assigned_to = $3
      AND (pts.points IS NOT NULL OR (t.due_date >= $1::date AND t.due_date < $2::date))
    ORDER BY COALESCE(pts.points, 0) DESC, t.due_date NULLS LAST, t.title
  `, [start, end, userId])
  return rows.map((r) => ({
    taskId: r.id, title: r.title, status: r.status,
    source: r.source ?? null, isRecurring: r.source === 'auto',
    companyName: r.company_name ?? null, typeName: r.type_name ?? null,
    points: parseInt(r.points, 10) || 0,
    dueDate: r.due_date, completedAt: r.completed_at,
    dueInPeriod: !!r.due_in_period,
    notDueYet: !!r.not_due_yet,   // chưa tới hạn & chưa xong → KHÔNG tính trượt
    onTime: !!r.on_time,
  }))
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
async function getPerformance(year, month, opts = {}) {
  const { userId = null } = opts
  const bounds = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const base = await listMonthly(year, month, opts)               // { closed, rows:[{...onTimePct, volumePoints}] }
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
  // net thưởng/phạt (đã duyệt) theo NV — neo theo THÁNG: gộp mọi tháng mà kỳ lọc chạm tới.
  const rpParams = [bounds.rpStart, bounds.rpEnd]
  let rpUserCond = ''
  if (userId) { rpParams.push(userId); rpUserCond = ` AND user_id = $${rpParams.length}` }
  const { rows: rp } = await query(
    `SELECT user_id, COALESCE(SUM(points),0)::numeric AS net FROM staff_reward_penalty
     WHERE make_date(period_year, period_month, 1) >= date_trunc('month', $1::date)
       AND make_date(period_year, period_month, 1) <= $2::date
       AND status = 'approved'${rpUserCond}
     GROUP BY user_id`, rpParams)
  const netByUser = new Map(rp.map((r) => [r.user_id, Number(r.net)]))

  // Báo cáo ĐA NGUỒN: số việc đến hạn / đúng hạn theo (NV × nguồn) trong kỳ — để vẽ stacked bar
  // ở Tổng quan. Tôn trọng bộ lọc nguồn (sources). CHỈ tính live (tháng đã chốt không có breakdown này).
  const srcByUser = new Map()   // userId → [{source, taskCount, dueCount, onTimeCount}]
  if (!base.closed) {
    const { start, end } = bounds
    const sp = [start, end]
    let sClause = ''
    if (Array.isArray(opts.sources) && opts.sources.length) { sp.push(opts.sources); sClause = ` AND t.source = ANY($${sp.length}::text[])` }
    const { rows: srcAgg } = await query(`
      SELECT t.assigned_to AS user_id, t.source,
             COUNT(*)::int AS task_count,
             COUNT(*) FILTER (WHERE t.status='completed' OR t.due_date < CURRENT_DATE)::int AS due_count,
             COUNT(*) FILTER (WHERE t.status='completed' AND t.completed_at::date <= t.due_date)::int AS on_time_count
      FROM tasks t
      WHERE t.assigned_to IS NOT NULL AND t.due_date >= $1::date AND t.due_date < $2::date${sClause}
      GROUP BY t.assigned_to, t.source`, sp)
    for (const a of srcAgg) {
      if (!srcByUser.has(a.user_id)) srcByUser.set(a.user_id, [])
      srcByUser.get(a.user_id).push({ source: a.source, taskCount: a.task_count, dueCount: a.due_count, onTimeCount: a.on_time_count })
    }
  }

  // Phân bố theo ĐỘ KHÓ checklist (Tổng quan) — gộp toàn NV trong bộ lọc. CHỈ nguồn định kỳ (auto).
  // Nếu đang lọc nguồn mà KHÔNG gồm 'auto' → để trống (user đã loại định kỳ).
  let difficultyReport = []
  const srcHasAuto = !(Array.isArray(opts.sources) && opts.sources.length) || opts.sources.includes('auto')
  if (!base.closed && srcHasAuto) {
    const { start, end } = bounds
    const dp = [start, end]
    const uc = ["u.status = 'active'", "t.source = 'auto'", 't.assigned_to IS NOT NULL']
    if (opts.userId) { dp.push(opts.userId); uc.push(`u.id = $${dp.length}`) }
    if (opts.role) { dp.push(opts.role); uc.push(`u.role = $${dp.length}`) }
    if (Array.isArray(opts.userIds) && opts.userIds.length) { dp.push(opts.userIds); uc.push(`u.id = ANY($${dp.length}::uuid[])`) }
    const { rows: dRows } = await query(`
      ${LEAF_CTE}
      SELECT leaf.difficulty AS key,
             COUNT(*)::int AS step_count,
             COALESCE(SUM(leaf.points),0)::int AS total_points,
             COUNT(*) FILTER (WHERE leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date)::int AS done_count,
             COALESCE(SUM(leaf.points) FILTER (WHERE leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date),0)::int AS done_points
      FROM leaf JOIN tasks t ON t.id = leaf.task_id JOIN users u ON u.id = t.assigned_to
      WHERE leaf.is_leaf AND leaf.difficulty IS NOT NULL AND ${uc.join(' AND ')}
        AND ( (t.due_date >= $1::date AND t.due_date < $2::date)
              OR (leaf.is_completed AND leaf.completed_at >= $1::date AND leaf.completed_at < $2::date) )
      GROUP BY leaf.difficulty`, dp)
    difficultyReport = dRows.map((r) => ({
      difficulty: r.key, stepCount: r.step_count, totalPoints: r.total_points,
      doneCount: r.done_count, donePoints: r.done_points,
    }))
  }

  // Thống kê theo TRẠNG THÁI task (Tổng quan) — gộp toàn NV theo bộ lọc. GROUP BY động (enum, không hardcode).
  // overdueCount = quá hạn chưa hoàn thành (completed_at NULL & qua hạn) — chỉ số suy ra, không neo key enum.
  let statusReport = []
  let overdueCount = 0
  let completedCount = 0   // hoàn thành = completed_at IS NOT NULL (KHÔNG neo key enum)
  let taskTotal = 0
  if (!base.closed) {
    const { start, end } = bounds
    const stp = [start, end]
    const stc = ["u.status = 'active'", 't.assigned_to IS NOT NULL']
    if (Array.isArray(opts.sources) && opts.sources.length) { stp.push(opts.sources); stc.push(`t.source = ANY($${stp.length}::text[])`) }
    if (opts.userId) { stp.push(opts.userId); stc.push(`u.id = $${stp.length}`) }
    if (opts.role) { stp.push(opts.role); stc.push(`u.role = $${stp.length}`) }
    if (Array.isArray(opts.userIds) && opts.userIds.length) { stp.push(opts.userIds); stc.push(`u.id = ANY($${stp.length}::uuid[])`) }
    const { rows: stRows } = await query(`
      SELECT t.status AS key, COUNT(*)::int AS cnt,
             COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.completed_at IS NULL)::int AS overdue,
             COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL)::int AS done
      FROM tasks t JOIN users u ON u.id = t.assigned_to
      WHERE t.due_date >= $1::date AND t.due_date < $2::date AND ${stc.join(' AND ')}
      GROUP BY t.status`, stp)
    statusReport = stRows.map((r) => ({ status: r.key, count: r.cnt }))
    overdueCount = stRows.reduce((a, r) => a + r.overdue, 0)
    completedCount = stRows.reduce((a, r) => a + r.done, 0)
    taskTotal = stRows.reduce((a, r) => a + r.cnt, 0)
  }

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
      bySource: srcByUser.get(r.userId) ?? [],
    }
  })
  return { closed: base.closed, rows, difficultyReport, statusReport, overdueCount, completedCount, taskTotal }
}

module.exports = {
  listMonthly, getDetail, getUserTasks, closeMonth, reopenMonth, isMonthClosed,
  listTiers, createTier, updateTier, deleteTier, getPerformance,
}
