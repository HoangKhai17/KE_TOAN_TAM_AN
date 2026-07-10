const svc = require('./system-configs.service')
const logger = require('../../config/logger')

// Đổi giờ 2 job này thì phải lên lịch lại cron ngay, không đợi restart server.
const CRON_TIME_KEYS = new Set(['deadline_reminder_time', 'escalation_run_time'])

async function listConfigs(req, res, next) {
  try {
    const configs = await svc.listConfigs()
    res.json({ success: true, data: { configs } })
  } catch (err) { next(err) }
}

async function updateConfig(req, res, next) {
  try {
    const config = await svc.updateConfig(req.params.key, req.body.value, req.user.id)

    if (CRON_TIME_KEYS.has(req.params.key)) {
      // require trễ để tránh phụ thuộc vòng giữa jobs ↔ modules
      try {
        await require('../../jobs').restartDeadlineJobs()
      } catch (err) {
        logger.error('[SystemConfigs] Không thể lên lịch lại job deadline', { error: err.message })
      }
    }

    res.json({ success: true, data: { config } })
  } catch (err) { next(err) }
}

module.exports = { listConfigs, updateConfig }
