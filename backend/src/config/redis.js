const Redis = require('ioredis')
const env = require('./env')
const logger = require('./logger')

const redis = new Redis(env.redis.url, {
  retryStrategy(times) {
    if (times > 5) return null
    return Math.min(times * 200, 2000)
  },
  lazyConnect: true,
})

redis.on('connect', () => logger.info('Redis connected successfully'))
redis.on('error', (err) => logger.error('Redis connection error', { error: err.message }))
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'))

async function testConnection() {
  await redis.ping()
  logger.info('Redis ping OK')
}

module.exports = { redis, testConnection }
