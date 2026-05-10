require('./config/env') // validate env vars first — throws if missing
const createApp  = require('./app')
const { pool, testConnection: testDb } = require('./config/db')
const { redis, testConnection: testRedis } = require('./config/redis')
const logger     = require('./config/logger')
const env        = require('./config/env')
const { applyTimezone } = require('./config/appSettings')
const scheduler  = require('./jobs')

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

    // Start background job scheduler (Phase 8)
    scheduler.startScheduler()

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
