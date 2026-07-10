require('./config/env') // validate env vars first — throws if missing
const createApp  = require('./app')
const { pool, testConnection: testDb } = require('./config/db')
const { redis, testConnection: testRedis } = require('./config/redis')
const logger     = require('./config/logger')
const env        = require('./config/env')
const { applyTimezone } = require('./config/appSettings')
const scheduler  = require('./jobs')
const { initSocket } = require('./config/socket')

async function loadTimezone() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_configs WHERE key = 'system_timezone'"
    )
    if (rows.length) {
      applyTimezone(rows[0].value)
      logger.info(`System timezone set to: ${rows[0].value}`)
    }
  } catch (err) {
    logger.warn('Could not load system_timezone from DB, using default Asia/Ho_Chi_Minh', { error: err.message })
  }
}

async function loadSchedulerHour() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM system_configs WHERE key = 'scheduler_run_hour'"
    )
    if (rows.length) return parseInt(rows[0].value, 10)
  } catch (err) {
    logger.warn('Could not load scheduler_run_hour from DB, using default 5', { error: err.message })
  }
  return 5  // default: 05:00 VN
}

async function start() {
  try {
    await testDb()
    await redis.connect()
    await testRedis()

    // Load runtime settings before app handles any requests
    await loadTimezone()

    const app = createApp()
    const server = app.listen(env.PORT, () => {
      logger.info(`Server started`, { port: env.PORT, env: env.NODE_ENV })
    })

    // Attach Socket.io to the HTTP server (Phase 12)
    initSocket(server)

    // Start background job scheduler (Phase 8)
    const schedulerHour = await loadSchedulerHour()
    scheduler.startScheduler(schedulerHour)

    // Start notification & escalation cron jobs (Phase 12)
    await scheduler.startNotificationJobs()

    // Start auto-backup cron (đọc lịch từ system_configs)
    await require('./modules/backup/backup.service').scheduleBackupCron()

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`)
      server.close(async () => {
        await redis.quit()
        logger.info('Server closed')
        process.exit(0)
      })
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection', { reason: String(reason) })
    })
  } catch (err) {
    logger.error('Failed to start server', { error: err.message })
    process.exit(1)
  }
}

start()
