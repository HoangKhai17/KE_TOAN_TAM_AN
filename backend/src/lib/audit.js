const { query } = require('../config/db')
const logger = require('../config/logger')

async function log({ userId, action, targetType, targetId, meta, ipAddress, userAgent }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, meta, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
      [
        userId ?? null,
        action,
        targetType ?? null,
        targetId ?? null,
        meta ? JSON.stringify(meta) : null,
        ipAddress ?? null,
        userAgent ?? null,
      ]
    )
  } catch (err) {
    logger.error('Failed to write audit log', { action, userId, error: err.message })
  }
}

module.exports = { log }
