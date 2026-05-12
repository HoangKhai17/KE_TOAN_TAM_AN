'use strict'

const scheduler = require('../../jobs')
const { query } = require('../../config/db')

async function getStatus(req, res, next) {
  try {
    const status = scheduler.getStatus()
    res.json({ success: true, data: { scheduler: status } })
  } catch (err) { next(err) }
}

async function runNow(req, res, next) {
  try {
    const result = await scheduler.triggerNow(req.user?.id ?? null)
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

module.exports = { getStatus, runNow, getLogs, updateConfig, deleteLog, clearLogs }
