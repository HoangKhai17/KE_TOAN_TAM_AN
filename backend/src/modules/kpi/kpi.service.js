'use strict'
// KPI THÁNG (Phase C). Tháng CHƯA chốt → tính LIVE từ checklist/tasks. Tháng ĐÃ chốt → đọc snapshot
// từ kpi_monthly_results (khóa số liệu lịch sử). Điểm khối lượng = Σ điểm MỤC CHA đã đạt (rollup) trong
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

// CTE: ĐƠN VỊ CHẤM ĐIỂM = MỤC CHA (level 0). Điểm nằm ở mục cha; mục con (level 1) chỉ là bước phụ.
// Mỗi mục cha "đạt điểm" theo ROLLUP:
//   · có con   → khi MỌI con đã tick; mốc hoàn thành = lần tick con cuối (MAX completed_at con)
//   · không con → theo tick của chính nó.
// grp_no = số thứ tự nhóm (đếm dồn mục cha) → mọi dòng cùng nhóm (1 cha + các con theo sau) chung grp_no.
const UNIT_CTE = `
  WITH ord AS (
    SELECT ci.task_id, ci.points, ci.level, ci.is_completed, ci.completed_at,
           SUM(CASE WHEN ci.level = 0 THEN 1 ELSE 0 END)
             OVER (PARTITION BY ci.task_id ORDER BY ci.step_order, ci.id ROWS UNBOUNDED PRECEDING) AS grp_no
    FROM task_checklist_items ci
  ),
  unit AS (
    SELECT g.task_id,
           COALESCE(MAX(g.points) FILTER (WHERE g.level = 0), 0) AS points,
           CASE WHEN COUNT(*) FILTER (WHERE g.level = 1) > 0
                THEN COALESCE(bool_and(g.is_completed) FILTER (WHERE g.level = 1), FALSE)
                ELSE COALESCE(bool_or(g.is_completed)  FILTER (WHERE g.level = 0), FALSE) END AS is_completed,
           CASE WHEN COUNT(*) FILTER (WHERE g.level = 1) > 0
                THEN MAX(g.completed_at) FILTER (WHERE g.level = 1)
                ELSE MAX(g.completed_at) FILTER (WHERE g.level = 0) END AS completed_at
    FROM ord g
    GROUP BY g.task_id, g.grp_no
    HAVING bool_or(g.level = 0)   -- bỏ nhóm con mồ côi (không có mục cha đứng trước)
  )`

// ── LŨY TUYẾN: hệ số theo số tháng hoàn thành TRỄ (bảng kpi_delay_factors) ─────
// Đọc hệ số đang bật, sắp theo số tháng trễ tăng dần.
async function loadDelayFactors() {
  const { rows } = await query(
    'SELECT months_late, factor_pct FROM kpi_delay_factors WHERE is_active = TRUE ORDER BY months_late')
  return rows.map((r) => ({ monthsLate: r.months_late, factorPct: Number(r.factor_pct) }))
}
// Trả MỘT biểu thức SQL = hệ số (thang 0..1, CÓ THỂ ÂM) cho 1 đơn vị, dựa trên:
//   mlate = số tháng trễ = max(0, tháng(unit.completed_at) − tháng(t.due_date)); due_date NULL → hệ số 1.
//   mlate ≥ mốc lớn nhất cấu hình → lấy hệ số dòng cuối (giữ nguyên). Mốc không cấu hình → 1 (an toàn).
// (cần có bí danh `unit` + JOIN tasks `t` trong truy vấn)
function buildDecayExpr(factors) {
  if (!factors || !factors.length) return '1'
  const maxM = factors[factors.length - 1].monthsLate
  const maxF = factors[factors.length - 1].factorPct / 100
  const L = '(GREATEST(0, (EXTRACT(YEAR FROM unit.completed_at)::int*12 + EXTRACT(MONTH FROM unit.completed_at)::int)'
          + ' - (EXTRACT(YEAR FROM t.due_date)::int*12 + EXTRACT(MONTH FROM t.due_date)::int)))'
  const whens = factors.map((f) => `WHEN ${L} = ${f.monthsLate} THEN ${f.factorPct / 100}`).join(' ')
  return `(CASE WHEN t.due_date IS NULL THEN 1 WHEN ${L} >= ${maxM} THEN ${maxF} ${whens} ELSE 1 END)`
}
// Giá trị điểm 1 ĐƠN VỊ (mục cha): CHỈ task ĐỊNH KỲ (source='auto') mới có điểm × hệ số lũy tuyến.
// MỌI nguồn khác = 0 điểm (chỉ thống kê số việc). `decay` = biểu thức từ buildDecayExpr().
function unitPt(decay) {
  // Làm tròn TỪNG đơn vị rồi mới cộng → headline khớp với tổng từng task (tránh lệch làm tròn).
  return `ROUND(CASE WHEN t.source = 'auto' THEN COALESCE(unit.points, 0) * ${decay} ELSE 0 END)`
}

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
  const decay = buildDecayExpr(await loadDelayFactors())
  const params = [start, end]
  // Lọc theo NGUỒN (auto/manual/customer/…): thêm sớm để $3 cố định cho vol/ont. Bỏ trống = mọi nguồn.
  let srcClause = ''
  if (Array.isArray(sources) && sources.length) { params.push(sources); srcClause = ` AND t.source = ANY($${params.length}::text[])` }
  const uConds = ["u.status = 'active'"]
  if (userId) { params.push(userId); uConds.push(`u.id = $${params.length}`) }
  if (role) { params.push(role); uConds.push(`u.role = $${params.length}`) }
  if (Array.isArray(userIds) && userIds.length) { params.push(userIds); uConds.push(`u.id = ANY($${params.length}::uuid[])`) }
  const { rows } = await query(`
    ${UNIT_CTE},
    vol AS (
      -- vol_recurring = điểm ĐỊNH KỲ (auto) × hệ số lũy tuyến theo tháng trễ. vol_other = SỐ VIỆC nguồn khác (thống kê).
      SELECT t.assigned_to AS user_id,
             COALESCE(SUM(ROUND(unit.points * ${decay})) FILTER (WHERE t.source = 'auto'), 0)::int AS vol_recurring,
             COUNT(DISTINCT unit.task_id) FILTER (WHERE t.source <> 'auto')::int AS vol_other
      FROM unit JOIN tasks t ON t.id = unit.task_id
      WHERE unit.is_completed
        AND unit.completed_at >= $1::date AND unit.completed_at < $2::date
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
      -- TỔNG điểm có thể đạt trong kỳ (mẫu số "đạt/tổng") — CHỈ task ĐỊNH KỲ (nguồn khác không có điểm):
      -- cộng điểm mọi mục cha (đạt hay chưa) của task auto đến hạn trong kỳ, CỘNG mục cha auto đã đạt
      -- trong kỳ của task ngoài kỳ → luôn ≥ điểm đã đạt.
      SELECT t.assigned_to AS user_id,
             COALESCE(SUM(unit.points) FILTER (WHERE t.source = 'auto'), 0)::int AS possible_points
      FROM unit JOIN tasks t ON t.id = unit.task_id
      WHERE t.assigned_to IS NOT NULL${srcClause}
        AND ( (t.due_date >= $1::date AND t.due_date < $2::date)
              OR (unit.is_completed AND unit.completed_at >= $1::date AND unit.completed_at < $2::date) )
      GROUP BY t.assigned_to
    )
    SELECT u.id AS user_id, u.name AS user_name, u.job_title,
           COALESCE(vol.vol_recurring, 0) AS vol_recurring,
           COALESCE(vol.vol_other, 0) AS vol_other,
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
  const volRec = parseInt(r.vol_recurring, 10) || 0    // điểm task ĐỊNH KỲ (điểm cấu hình)
  const volOther = parseInt(r.vol_other, 10) || 0      // SỐ VIỆC nguồn khác đã xong (thống kê, KHÔNG điểm)
  // Điểm khối lượng KPI = CHỈ điểm định kỳ. Task nguồn khác không tính điểm (chỉ thống kê số việc).
  const volumePoints = volRec
  return {
    userId: r.user_id, userName: r.user_name, jobTitle: r.job_title ?? null,
    volumeRecurring: volRec, volumeOther: volOther, volumePoints,
    volumePossible: Math.max(parseInt(r.possible_points, 10) || 0, volumePoints),
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
      volumePoints: r.volume_points, volumeRecurring: r.volume_points, volumeOther: 0,
      volumePossible: r.volume_points, assignedCount: r.assigned_count,
      onTimeCount: r.on_time_count, onTimePct: r.on_time_pct,
    })) }
  }
  return { closed: false, rows: await listLive(y, m, opts) }
}

// ── Chi tiết breakdown (LIVE) theo công ty + loại CV cho 1 NV ──────────────────
async function detailLive(year, month, userId, opts = {}) {
  const { start, end } = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const UNIT_PT = unitPt(buildDecayExpr(await loadDelayFactors()))
  const p = [start, end, userId]
  const [byCompany, byType, bySource, byStatus] = await Promise.all([
    query(`
      ${UNIT_CTE}
      SELECT c.id AS key, c.name AS label, ROUND(COALESCE(SUM(${UNIT_PT}),0))::int AS volume_points
      FROM unit JOIN tasks t ON t.id = unit.task_id JOIN companies c ON c.id = t.company_id
      WHERE unit.is_completed
        AND unit.completed_at >= $1::date AND unit.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY c.id, c.name ORDER BY volume_points DESC`, p),
    query(`
      ${UNIT_CTE}
      SELECT COALESCE(tt.name, t.group_name, '(Không có loại)') AS label,
             ROUND(COALESCE(SUM(${UNIT_PT}),0))::int AS volume_points
      FROM unit JOIN tasks t ON t.id = unit.task_id LEFT JOIN task_types tt ON tt.id = t.task_type_id
      WHERE unit.is_completed
        AND unit.completed_at >= $1::date AND unit.completed_at < $2::date AND t.assigned_to = $3
      GROUP BY COALESCE(tt.name, t.group_name, '(Không có loại)') ORDER BY volume_points DESC`, p),
    // Tách theo NGUỒN task: định kỳ (auto) vs tự tạo (manual) — số lượng + đã đến hạn + đúng hạn + điểm.
    query(`
      ${UNIT_CTE},
      pts AS (
        SELECT t.id AS task_id, ROUND(COALESCE(SUM(${UNIT_PT}),0))::int AS points
        FROM unit JOIN tasks t ON t.id = unit.task_id
        WHERE unit.is_completed
          AND unit.completed_at >= $1::date AND unit.completed_at < $2::date AND t.assigned_to = $3
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
// Gồm task có MỤC CHA đạt điểm trong tháng (theo completed_at rollup) HOẶC task đến hạn trong tháng.
async function getUserTasks(year, month, userId, opts = {}) {
  const { start, end } = resolveBounds({ year, month, from: opts.from, to: opts.to })
  const UNIT_PT = unitPt(buildDecayExpr(await loadDelayFactors()))
  const { rows } = await query(`
    ${UNIT_CTE},
    pts AS (
      SELECT t.id AS task_id,
             ROUND(COALESCE(SUM(${UNIT_PT}), 0))::int AS points,
             ROUND(COALESCE(SUM(CASE WHEN t.source = 'auto' THEN COALESCE(unit.points, 0) ELSE 0 END), 0))::int AS gross_points,
             COALESCE(MAX(CASE WHEN t.source = 'auto' AND t.due_date IS NOT NULL
                       THEN GREATEST(0, (EXTRACT(YEAR FROM unit.completed_at)::int*12 + EXTRACT(MONTH FROM unit.completed_at)::int)
                                       - (EXTRACT(YEAR FROM t.due_date)::int*12 + EXTRACT(MONTH FROM t.due_date)::int))
                       ELSE 0 END), 0) AS months_late
      FROM unit JOIN tasks t ON t.id = unit.task_id
      WHERE unit.is_completed
        AND unit.completed_at >= $1::date AND unit.completed_at < $2::date
        AND t.assigned_to = $3
      GROUP BY t.id
    )
    SELECT t.id, t.title, t.status, t.source, t.due_date, t.completed_at,
           c.name AS company_name,
           COALESCE(tt.name, t.group_name) AS type_name,
           COALESCE(pts.points, 0) AS points,
           COALESCE(pts.gross_points, 0) AS gross_points,
           COALESCE(pts.months_late, 0) AS months_late,
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
    points: parseInt(r.points, 10) || 0,             // điểm sau lũy tuyến (đã giảm)
    grossPoints: parseInt(r.gross_points, 10) || 0,  // điểm gốc (chưa giảm) — chỉ task định kỳ
    monthsLate: parseInt(r.months_late, 10) || 0,    // số tháng hoàn thành trễ
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

// ── Hệ số LŨY TUYẾN theo số tháng trễ (kpi_delay_factors) — admin cấu hình ─────
function delayToDto(r) {
  return { id: r.id, monthsLate: r.months_late, factorPct: Number(r.factor_pct), sortOrder: r.sort_order, isActive: r.is_active }
}
async function listDelayFactorRows() {
  const { rows } = await query('SELECT * FROM kpi_delay_factors ORDER BY months_late, sort_order')
  return rows.map(delayToDto)
}
async function createDelayFactor(data, actorId) {
  try {
    const { rows: [r] } = await query(
      `INSERT INTO kpi_delay_factors (months_late, factor_pct, sort_order, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.monthsLate ?? 0, data.factorPct ?? 0, data.sortOrder ?? (data.monthsLate ?? 0), data.isActive ?? true, actorId])
    return delayToDto(r)
  } catch (e) {
    if (e.code === '23505') { const err = new Error('Đã có dòng cho số tháng trễ này'); err.status = 409; throw err }
    throw e
  }
}
async function updateDelayFactor(id, data) {
  const map = { monthsLate: 'months_late', factorPct: 'factor_pct', sortOrder: 'sort_order', isActive: 'is_active' }
  const sets = []; const params = []
  for (const [k, col] of Object.entries(map)) {
    if (data[k] !== undefined) { params.push(data[k]); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) { const e = new Error('Không có gì để cập nhật'); e.status = 400; throw e }
  params.push(id)
  try {
    const { rows: [r] } = await query(
      `UPDATE kpi_delay_factors SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
    if (!r) { const e = new Error('Không tìm thấy dòng'); e.status = 404; throw e }
    return delayToDto(r)
  } catch (e) {
    if (e.code === '23505') { const err = new Error('Đã có dòng cho số tháng trễ này'); err.status = 409; throw err }
    throw e
  }
}
async function deleteDelayFactor(id) {
  const { rows } = await query('DELETE FROM kpi_delay_factors WHERE id = $1 RETURNING id', [id])
  if (!rows.length) { const e = new Error('Không tìm thấy dòng'); e.status = 404; throw e }
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
  const UNIT_PT = unitPt(buildDecayExpr(await loadDelayFactors()))
  const base = await listMonthly(year, month, opts)               // { closed, rows:[{...onTimePct, volumePoints}] }
  const tiers = await listTiers({ activeOnly: true })
  // grades ở bảng kpi_grades (module reward-penalty) — đọc trực tiếp, TÁCH 2 nhánh theo category.
  const { rows: grades } = await query(
    `SELECT code, label, category, min_points, max_points, amount, sort_order
     FROM kpi_grades WHERE is_active = TRUE ORDER BY category, sort_order, created_at`)
  const mapGrades = (cat) => grades
    .filter((g) => (g.category || 'progress') === cat)
    .map((g, idx) => ({
      code: g.code, label: g.label, sortOrder: idx,
      minPoints: g.min_points != null ? Number(g.min_points) : null,
      maxPoints: g.max_points != null ? Number(g.max_points) : null,
      amount: Number(g.amount),
    }))
  const progressGrades = mapGrades('progress')
  const rpGrades = mapGrades('reward_penalty')
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
    const keyOf = (u, s) => `${u}||${s}`
    const entryMap = new Map()
    for (const a of srcAgg) {
      if (!srcByUser.has(a.user_id)) srcByUser.set(a.user_id, [])
      const entry = { source: a.source, taskCount: a.task_count, dueCount: a.due_count, onTimeCount: a.on_time_count, volumePoints: 0 }
      srcByUser.get(a.user_id).push(entry)
      entryMap.set(keyOf(a.user_id, a.source), entry)
    }
    // Điểm khối lượng theo (NV × nguồn) — hoàn thành trong kỳ (auto = điểm cấu hình; khác = 1đ/bước).
    const { rows: volAgg } = await query(`
      ${UNIT_CTE}
      SELECT t.assigned_to AS user_id, t.source, ROUND(COALESCE(SUM(${UNIT_PT}),0))::int AS vol
      FROM unit JOIN tasks t ON t.id = unit.task_id
      WHERE unit.is_completed
        AND unit.completed_at >= $1::date AND unit.completed_at < $2::date
        AND t.assigned_to IS NOT NULL${sClause}
      GROUP BY t.assigned_to, t.source`, sp)
    for (const v of volAgg) {
      const e = entryMap.get(keyOf(v.user_id, v.source))
      if (e) { e.volumePoints = v.vol }
      else {
        if (!srcByUser.has(v.user_id)) srcByUser.set(v.user_id, [])
        srcByUser.get(v.user_id).push({ source: v.source, taskCount: 0, dueCount: 0, onTimeCount: 0, volumePoints: v.vol })
      }
    }
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

    // NHÁNH 1 — Tiến độ công việc: định kỳ + task khác + điểm % đúng hạn.
    const progressPoints = (r.volumePoints || 0) + kpiPoints
    const pGrade = matchRange(progressPoints, progressGrades, 'minPoints', 'maxPoints')
    const progressAmount = pGrade ? pGrade.amount : 0

    // NHÁNH 2 — Thưởng/phạt quy chế: tính riêng trên tổng điểm thưởng/phạt.
    const rpGrade = matchRange(rpNet, rpGrades, 'minPoints', 'maxPoints')
    const rpAmount = rpGrade ? rpGrade.amount : 0

    const totalAmount = progressAmount + rpAmount

    return {
      ...r,
      kpiPoints, rewardPenaltyNet: rpNet,
      // Nhánh tiến độ
      progressPoints,
      progressGradeCode: pGrade?.code ?? null, progressGradeLabel: pGrade?.label ?? null,
      progressGradeSort: pGrade?.sortOrder ?? null, progressAmount,
      // Nhánh thưởng/phạt
      rpGradeCode: rpGrade?.code ?? null, rpGradeLabel: rpGrade?.label ?? null,
      rpGradeSort: rpGrade?.sortOrder ?? null, rpAmount,
      // Tổng tiền
      totalAmount,
      // ── Tương thích ngược (KpiPanel/PayrollDetail): "grade/amount" trỏ về nhánh tiến độ,
      //    totalPoints = điểm tiến độ, amount = TỔNG tiền (cho payroll kéo đủ).
      totalPoints: progressPoints,
      gradeCode: pGrade?.code ?? null, gradeLabel: pGrade?.label ?? null, gradeSort: pGrade?.sortOrder ?? null,
      amount: totalAmount,
      bySource: srcByUser.get(r.userId) ?? [],
    }
  })
  return { closed: base.closed, rows, statusReport, overdueCount, completedCount, taskTotal }
}

module.exports = {
  listMonthly, getDetail, getUserTasks, closeMonth, reopenMonth, isMonthClosed,
  listTiers, createTier, updateTier, deleteTier, getPerformance,
  listDelayFactorRows, createDelayFactor, updateDelayFactor, deleteDelayFactor,
}
