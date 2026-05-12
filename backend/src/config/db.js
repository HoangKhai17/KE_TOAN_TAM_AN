const { Pool, types } = require('pg')
const env = require('./env')
const logger = require('./logger')
const { getTimezone } = require('./appSettings')

// Return DATE columns as plain YYYY-MM-DD strings to avoid pg's local-midnight
// Date object conversion which shifts the date when serialised to ISO UTC.
types.setTypeParser(1082, (val) => val)

const pool = new Pool({
  connectionString: env.db.url,
  max: env.db.max,
  idleTimeoutMillis: env.db.idleTimeoutMillis,
  connectionTimeoutMillis: env.db.connectionTimeoutMillis,
})

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL client error', { error: err.message })
})

// Apply system timezone on every new connection so NOW() and timezone-aware
// operations use the configured timezone instead of PostgreSQL's default (UTC).
pool.on('connect', (client) => {
  client.query(`SET TIME ZONE '${getTimezone()}'`).catch((err) => {
    logger.warn('Failed to set session timezone', { error: err.message })
  })
})

async function testConnection() {
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
    logger.info('PostgreSQL connected successfully')
  } finally {
    client.release()
  }
}

/**
 * Run a query with automatic client release.
 * @param {string} text
 * @param {any[]} [params]
 */
async function query(text, params) {
  const start = Date.now()
  const result = await pool.query(text, params)
  const duration = Date.now() - start
  if (duration > 1000) {
    logger.warn('Slow query detected', { duration, query: text.substring(0, 100) })
  }
  return result
}

/**
 * Get a client for transaction use.
 * Remember to call client.release() in a finally block.
 */
async function getClient() {
  return pool.connect()
}

module.exports = { pool, query, getClient, testConnection }
