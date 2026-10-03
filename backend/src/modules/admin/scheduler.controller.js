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

// Điều kiện khớp: bước checklist của TASK ĐỊNH KỲ (due trong kỳ) ↔ cấu hình LỊCH của chính nó
// (schedule_checklist_items qua template step). CHỈ các bước LỆCH điểm/độ khó so với cấu hình.
const SYNC_WHERE = `
  FROM task_checklist_items ci
  JOIN tasks t ON t.id = ci.task_id AND t.source = 'auto'
       AND t.due_date >= $1::date AND t.due_date < $2::date
  JOIN schedule_checklist_items sci
       ON sci.schedule_id = t.customer_task_schedule_id
      AND sci.source_template_step_id = ci.source_step_id
  WHERE ci.source_step_id IS NOT NULL
    AND (ci.points IS DISTINCT FROM sci.points OR ci.difficulty IS DISTINCT FROM sci.difficulty)`

// Đồng bộ điểm/độ khó từ cấu hình lịch → task định kỳ đã sinh (theo THÁNG). Mặc định DRY-RUN.
async function syncScores(req, res, next) {
  try {
    const { year, month } = req.body
    const dryRun = req.body.dryRun !== false
    const { y, m, start, end } = monthRange(year, month)
    const closed = await kpiSvc.isMonthClosed(y, m)

    const { rows: [stat] } = await query(`
      SELECT COUNT(*)::int AS items,
             COUNT(DISTINCT ci.task_id)::int AS tasks,
             COALESCE(SUM(COALESCE(sci.points,0) - COALESCE(ci.points,0)),0)::int AS points_delta
      ${SYNC_WHERE}`, [start, end])

    if (dryRun) {
      return res.json({ success: true, data: { dryRun: true, year: y, month: m, closed,
        itemsToUpdate: stat.items, tasksAffected: stat.tasks, pointsDelta: stat.points_delta } })
    }
    if (closed) { const e = new Error('Tháng đã CHỐT SỔ KPI — hãy Mở lại sổ trước khi đồng bộ.'); e.status = 400; throw e }

    const client = await getClient()
    try {
      await client.query('BEGIN')
      const { rowCount } = await client.query(`
        UPDATE task_checklist_items ci
        SET points = sci.points, difficulty = sci.difficulty
        FROM tasks t, schedule_checklist_items sci
        WHERE ci.task_id = t.id AND t.source = 'auto'
          AND t.due_date >= $1::date AND t.due_date < $2::date
          AND sci.schedule_id = t.customer_task_schedule_id
          AND sci.source_template_step_id = ci.source_step_id
          AND ci.source_step_id IS NOT NULL
          AND (ci.points IS DISTINCT FROM sci.points OR ci.difficulty IS DISTINCT FROM sci.difficulty)`,
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
