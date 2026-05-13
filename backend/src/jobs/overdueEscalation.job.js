'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const { sendMail } = require('../utils/mailer')
const logger = require('../config/logger')

async function runOverdueEscalation() {
  logger.info('[OverdueEscalation] Starting job')
  try {
    const { rows: [cfg] } = await query(
      "SELECT value FROM system_configs WHERE key = 'escalation_overdue_days'"
    )
    const overdueDays = parseInt(cfg?.value || '3', 10)

    const { rows: tasks } = await query(
      `SELECT t.id, t.title, t.due_date, t.assigned_to, t.status,
              u.name AS user_name, u.email AS user_email,
              c.name AS company_name
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status IN ('pending','in_progress')
         AND t.due_date IS NOT NULL
         AND t.due_date::date < (CURRENT_DATE - ($1 || ' days')::interval)::date
         AND t.assigned_to IS NOT NULL`,
      [String(overdueDays)]
    )

    logger.info(`[OverdueEscalation] Found ${tasks.length} overdue tasks to escalate`)

    const { rows: admins } = await query(
      "SELECT id, name, email FROM users WHERE role = 'admin' AND status = 'active'"
    )

    for (const task of tasks) {
      const dueStr = new Date(task.due_date).toLocaleDateString('vi-VN')

      await query(
        `UPDATE tasks SET status = 'needs_revision' WHERE id = $1 AND status IN ('pending','in_progress')`,
        [task.id]
      )

      await createAndEmit(
        task.assigned_to,
        'task_overdue',
        `Công việc quá hạn: "${task.title}"`,
        `Công việc "${task.title}" (${task.company_name}) đã quá hạn từ ${dueStr}. Trạng thái chuyển sang "Cần xem lại".`,
        task.id,
      )

      for (const admin of admins) {
        await createAndEmit(
          admin.id,
          'escalation',
          `Escalation: "${task.title}" quá hạn`,
          `Công việc "${task.title}" của ${task.user_name} (${task.company_name}) đã quá hạn từ ${dueStr}.`,
          task.id,
        )

        if (admin.email) {
          await sendMail({
            to: admin.email,
            subject: `[Escalation] Công việc quá hạn: ${task.title}`,
            html: `<p>Xin chào <strong>${admin.name}</strong>,</p>
                   <p>Công việc <strong>"${task.title}"</strong> được giao cho <strong>${task.user_name}</strong>
                   (${task.company_name}) đã quá hạn từ ngày <strong>${dueStr}</strong>.</p>
                   <p>Trạng thái đã tự động chuyển sang <strong>"Cần xem lại"</strong>.</p>
                   <br><p>— Hệ thống Kế Toán Tâm An</p>`,
            text: `Công việc "${task.title}" của ${task.user_name} quá hạn từ ${dueStr}.`,
          })
        }
      }
    }

    logger.info(`[OverdueEscalation] Processed ${tasks.length} escalations`)
    return { processed: tasks.length }
  } catch (err) {
    logger.error('[OverdueEscalation] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runOverdueEscalation }
