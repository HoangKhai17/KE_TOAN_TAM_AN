const cron   = require('node-cron')
const logger = require('../config/logger')
const { runTaskGenerator } = require('./taskGenerator.job')

let schedulerTask = null
let lastRunAt     = null
let lastRunResult = null
let isRunning     = false

function startScheduler() {
  // Run every day at 05:00 Vietnam time (UTC+7 = 22:00 UTC previous day)
  // Cron expression: "0 22 * * *" (UTC) — or use TZ option with node-cron
  schedulerTask = cron.schedule(
    '0 22 * * *',
    async () => {
      if (isRunning) {
        logger.warn('[Scheduler] Skipping run — previous run still in progress')
        return
      }
      isRunning = true
      lastRunAt = new Date()
      try {
        lastRunResult = await runTaskGenerator()
      } catch (err) {
        lastRunResult = { error: err.message }
      } finally {
        isRunning = false
      }
    },
    { timezone: 'UTC' }
  )

  logger.info('[Scheduler] Task generator cron started (05:00 VN time daily)')
}

function getStatus() {
  return {
    active:        schedulerTask != null,
    isRunning,
    lastRunAt,
    lastRunResult,
  }
}

async function triggerNow() {
  if (isRunning) {
    throw Object.assign(new Error('Scheduler is already running'), { status: 409 })
  }
  isRunning = true
  lastRunAt = new Date()
  try {
    lastRunResult = await runTaskGenerator()
    return lastRunResult
  } catch (err) {
    lastRunResult = { error: err.message }
    throw err
  } finally {
    isRunning = false
  }
}

module.exports = { startScheduler, getStatus, triggerNow }
