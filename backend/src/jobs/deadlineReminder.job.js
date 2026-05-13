'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const { sendMail } = require('../utils/mailer')
const logger = require('../config/logger')

async function runDeadlineReminder() {
  logger.info('[DeadlineReminder] Starting job')
  try {
    const { rows: [cfg] } = await query(
      "SELECT value FROM system_configs WHERE key = 'deadline_warning_days'"
    )
    const warningDays = parseInt(cfg?.value || '3', 10)

    const { rows: tasks } = await query(
      `SELECT t.id, t.title, t.due_date, t.assigned_to,
              u.name AS user_name, u.email AS user_email,
              c.name AS company_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status NOT IN ('done','cancelled')
         AND t.due_date IS NOT NULL
         AND t.due_date::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($1 || ' days')::interval)::date
         AND t.assigned_to IS NOT NULL`,
      [String(warningDays)]
    )

    logger.info(`[DeadlineReminder] Found ${tasks.length} tasks approaching deadline`)

    for (const task of tasks) {
      const dueStr = new Date(task.due_date).toLocaleDateString('vi-VN')

      await createAndEmit(
        task.assigned_to,
        'deadline_reminder',
        `Nhắc nhở: "${task.title}" sắp đến hạn`,
        `Công việc "${task.title}" (${task.company_name}) đến hạn ngày ${dueStr}.`,
        task.id,
      )

      if (task.user_email) {
        await sendMail({
          to: task.user_email,
          subject: `[Nhắc nhở] Công việc sắp đến hạn: ${task.title}`,
          html: `<p>Xin chào <strong>${task.user_name}</strong>,</p>
                 <p>Công việc <strong>"${task.title}"</strong> (${task.company_name}) sẽ đến hạn vào ngày <strong>${dueStr}</strong>.</p>
                 <p>Vui lòng hoàn thành đúng hạn.</p>
                 <br><p>— Hệ thống Kế Toán Tâm An</p>`,
          text: `Công việc "${task.title}" đến hạn ngày ${dueStr}.`,
        })
      }
    }

    logger.info(`[DeadlineReminder] Processed ${tasks.length} reminders`)
    return { processed: tasks.length }
  } catch (err) {
    logger.error('[DeadlineReminder] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runDeadlineReminder }
