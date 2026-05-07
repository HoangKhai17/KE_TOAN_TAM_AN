require('./config/env') // validate env vars first — throws if missing
const createApp = require('./app')
const { testConnection: testDb } = require('./config/db')
const { redis, testConnection: testRedis } = require('./config/redis')
const logger = require('./config/logger')
const env = require('./config/env')

async function start() {
  try {
    await testDb()
    await redis.connect()
    await testRedis()

    const app = createApp()
    const server = app.listen(env.PORT, () => {
      logger.info(`Server started`, { port: env.PORT, env: env.NODE_ENV })
    })

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
