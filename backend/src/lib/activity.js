const { query } = require('../config/db')
const logger = require('../config/logger')

async function logActivity(taskId, userId, action, oldValue, newValue, meta) {
  try {
    await query(
      `INSERT INTO task_activity_logs (task_id, user_id, action, old_value, new_value, meta)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        taskId,
        userId ?? null,
        action,
        oldValue != null ? String(oldValue) : null,
        newValue != null ? String(newValue) : null,
        meta ? JSON.stringify(meta) : null,
      ]
    )
  } catch (err) {
    logger.error('Failed to write activity log', { taskId, action, error: err.message })
  }
}

module.exports = { logActivity }
