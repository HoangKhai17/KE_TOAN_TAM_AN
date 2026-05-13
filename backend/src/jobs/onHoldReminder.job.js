'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const logger = require('../config/logger')

async function runOnHoldReminder() {
  logger.info('[OnHoldReminder] Starting job')
  try {
    const { rows: [cfg] } = await query(
      "SELECT value FROM system_configs WHERE key = 'escalation_on_hold_days'"
    )
    const holdDays = parseInt(cfg?.value || '7', 10)

    const { rows: tasks } = await query(
      `SELECT t.id, t.title, t.updated_at, t.assigned_to,
              u.name AS user_name,
              c.name AS company_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status = 'on_hold'
         AND t.updated_at < NOW() - ($1 || ' days')::interval
         AND t.assigned_to IS NOT NULL`,
      [String(holdDays)]
    )

    logger.info(`[OnHoldReminder] Found ${tasks.length} on-hold tasks`)

    for (const task of tasks) {
      await createAndEmit(
        task.assigned_to,
        'deadline_reminder',
        `Nhắc nhở: "${task.title}" đang tạm hoãn`,
        `Công việc "${task.title}" (${task.company_name}) đã tạm hoãn hơn ${holdDays} ngày. Vui lòng cập nhật trạng thái.`,
        task.id,
      )
    }

    logger.info(`[OnHoldReminder] Sent ${tasks.length} reminders`)
    return { processed: tasks.length }
  } catch (err) {
    logger.error('[OnHoldReminder] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runOnHoldReminder }
