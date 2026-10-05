'use strict'

const scheduler = require('../../jobs')
const { query, getClient } = require('../../config/db')
const kpiSvc = require('../kpi/kpi.service')
const audit = require('../../lib/audit')

function monthRange(year, month) {
  const y = parseInt(year, 10), m = parseInt(month, 10)
  if (!y || !m || m < 1 || m > 12) { const e = new Error('Thiếu hoặc sai year/month'); e.status = 400; throw e }
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { y, m, start, end }
}

// Khớp bước checklist của TASK ĐỊNH KỲ (due trong kỳ) với CẤU HÌNH LỊCH của CHÍNH NÓ:
//   schedule_checklist_items s WHERE s.schedule_id = t.customer_task_schedule_id
//   → tức LỊCH ĐỊNH KỲ của TỪNG CÔNG TY (customer_task_schedules), KHÔNG phải template mẫu
//     (task_type_checklist_templates). CTE này KHÔNG đụng tới bảng template.
// Cách khớp 2 tầng (hướng B – lai) để phủ CẢ bước nhập từ mẫu LẪN nhập thủ công:
//   (1) ưu tiên theo ID bước mẫu (source_template_step_id = source_step_id) — chính xác, giữ hành vi cũ;
//   (2) fallback theo NỘI DUNG (step_text chuẩn hoá + level) — phủ bước THỦ CÔNG (source_step_id NULL).
// LATERAL + LIMIT 1 → mỗi bước task chỉ khớp ĐÚNG 1 bước lịch (không nhân đôi, không nhập nhằng).
const MATCH_CTE = `
  WITH m AS (
    SELECT ci.id AS ci_id, ci.task_id,
           ci.points AS cur_points, ci.difficulty AS cur_diff,
           sci.points AS new_points, sci.difficulty AS new_diff,
           (ci.points IS DISTINCT FROM sci.points OR ci.difficulty IS DISTINCT FROM sci.difficulty) AS diff
    FROM task_checklist_items ci
    JOIN tasks t ON t.id = ci.task_id AND t.source = 'auto'
         AND t.due_date >= $1::date AND t.due_date < $2::date
    JOIN LATERAL (
      SELECT s.points, s.difficulty
      FROM schedule_checklist_items s
      WHERE s.schedule_id = t.customer_task_schedule_id
        AND (
          (ci.source_step_id IS NOT NULL AND s.source_template_step_id = ci.source_step_id)
          OR (lower(btrim(s.step_text)) = lower(btrim(ci.step_text)) AND COALESCE(s.level,0) = COALESCE(ci.level,0))
        )
      ORDER BY (CASE WHEN ci.source_step_id IS NOT NULL AND s.source_template_step_id = ci.source_step_id THEN 0 ELSE 1 END),
               s.step_order
      LIMIT 1
    ) sci ON TRUE
  )`

// Đồng bộ điểm/độ khó từ cấu hình lịch → task định kỳ đã sinh (theo THÁNG). Mặc định DRY-RUN.
async function syncScores(req, res, next) {
  try {
    const { year, month } = req.body
    const dryRun = req.body.dryRun !== false
    const { y, m, start, end } = monthRange(year, month)
    const closed = await kpiSvc.isMonthClosed(y, m)

    const { rows: [stat] } = await query(`
      ${MATCH_CTE}
      SELECT COUNT(*) FILTER (WHERE diff)::int AS items,
             COUNT(DISTINCT task_id) FILTER (WHERE diff)::int AS tasks,
             COALESCE(SUM(CASE WHEN diff THEN COALESCE(new_points,0) - COALESCE(cur_points,0) ELSE 0 END),0)::int AS points_delta
      FROM m`, [start, end])

    if (dryRun) {
      return res.json({ success: true, data: { dryRun: true, year: y, month: m, closed,
        itemsToUpdate: stat.items, tasksAffected: stat.tasks, pointsDelta: stat.points_delta } })
    }
    if (closed) { const e = new Error('Tháng đã CHỐT SỔ KPI — hãy Mở lại sổ trước khi đồng bộ.'); e.status = 400; throw e }

    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { rowCount } = await client.query(`
        ${MATCH_CTE}
        UPDATE task_checklist_items ci
        SET points = m.new_points, difficulty = m.new_diff
        FROM m
        WHERE ci.id = m.ci_id AND m.diff`,
        [start, end])
      await client.query('COMMIT')
      await audit.log({ userId: req.user?.id ?? null, action: 'kpi.scores_synced', targetType: 'task_checklist_items',
        targetId: null, meta: { year: y, month: m, items: rowCount, tasks: stat.tasks, pointsDelta: stat.points_delta },
        ipAddress: req.ip, userAgent: req.headers['user-agent'] })
      res.json({ success: true, data: { applied: rowCount, tasksAffected: stat.tasks, pointsDelta: stat.points_delta, year: y, month: m } })
    } catch (e) { await client.query('ROLLBACK'); throw e }
    finally { client.release() }
  } catch (err) { next(err) }
}

async function getStatus(req, res, next) {
  try {
    const status = scheduler.getStatus()
    res.json({ success: true, data: { scheduler: status } })
  } catch (err) { next(err) }
}

async function runNow(req, res, next) {
  try {
    const companyId = req.body?.companyId || null   // null = chạy toàn hệ thống
    const result = await scheduler.triggerNow(req.user?.id ?? null, { companyId })
    res.json({ success: true, data: { result } })
  } catch (err) { next(err) }
}

async function getLogs(req, res, next) {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '30', 10)))
    const logs  = await scheduler.getLogs(limit)
    res.json({ success: true, data: { logs } })
  } catch (err) { next(err) }
}

async function updateConfig(req, res, next) {
  try {
    const { runHour } = req.body
    if (runHour === undefined || runHour === null) {
      return res.status(400).json({ success: false, error: { message: 'runHour is required' } })
    }
    const hour = parseInt(runHour, 10)
    if (isNaN(hour) || hour < 0 || hour > 23) {
      return res.status(400).json({ success: false, error: { message: 'runHour must be 0–23' } })
    }

    await query(
      `INSERT INTO system_configs (key, value, description, updated_by)
       VALUES ('scheduler_run_hour', $1, 'Giờ chạy bộ lập lịch tự động (giờ Việt Nam, 0-23)', $2)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()`,
      [String(hour), req.user?.id ?? null]
    )

    scheduler.restartWithNewHour(hour)
    res.json({ success: true, data: { runHour: hour } })
  } catch (err) { next(err) }
}

async function deleteLog(req, res, next) {
  try {
    const { id } = req.params
    await scheduler.deleteLog(id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function clearLogs(req, res, next) {
  try {
    await scheduler.clearLogs()
    res.json({ success: true })
  } catch (err) { next(err) }
}

module.exports = { getStatus, runNow, getLogs, updateConfig, deleteLog, clearLogs, syncScores }
