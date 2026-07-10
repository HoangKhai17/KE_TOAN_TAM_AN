'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const { sendMail } = require('../utils/mailer')
const { getTemplate, renderTemplate, DEFAULTS } = require('../utils/emailTemplates')
const logger = require('../config/logger')

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC_MAP[c])

async function runOverdueEscalation() {
  logger.info('[OverdueEscalation] Starting job')
  try {
    const { rows: [cfg] } = await query(
      "SELECT value FROM system_configs WHERE key = 'escalation_overdue_days'"
    )
    const overdueDays = parseInt(cfg?.value || '3', 10)

    const { rows: tasks } = await query(
      `SELECT t.id, t.title, t.due_date, t.assigned_to, t.status,
              (CURRENT_DATE - t.due_date) AS days_overdue,
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
    if (tasks.length === 0) return { processed: 0, emailsSent: 0 }

    const { rows: admins } = await query(
      "SELECT id, name, email FROM users WHERE role = 'admin' AND status = 'active'"
    )

    // ── Đổi trạng thái + thông báo trong app (theo từng task) ────────────────
    const escalated = []
    for (const task of tasks) {
      // Guard chống race: chỉ đi tiếp nếu CHÍNH lần update này đổi được trạng thái.
      // Nếu ai đó vừa đổi trạng thái task → rowCount = 0 → bỏ qua, không thông báo thừa.
      const { rowCount } = await query(
        `UPDATE tasks SET status = 'needs_revision' WHERE id = $1 AND status IN ('pending','in_progress')`,
        [task.id]
      )
      if (rowCount === 0) continue

      const dueStr = new Date(task.due_date).toLocaleDateString('vi-VN')

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
      }

      escalated.push({ ...task, dueStr })
    }

    if (escalated.length === 0) {
      logger.info('[OverdueEscalation] Không task nào được escalate (đã đổi trạng thái trước đó)')
      return { processed: 0, emailsSent: 0 }
    }

    // ── MỘT email tổng hợp cho mỗi admin (thay vì 1 email / task) ────────────
    const today = new Date().toLocaleDateString('vi-VN')
    const taskRowsHtml = escalated.map((t) => `<tr>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.title)}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.company_name) || '—'}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.user_name) || '—'}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;white-space:nowrap;color:#dc2626;font-weight:600">${t.dueStr} <span style="color:#94a3b8;font-weight:400">(${t.days_overdue} ngày)</span></td>
      </tr>`).join('')

    // Template đã lưu trong Settings có thể là bản CŨ (1 email / task, dùng {{task_title}}…).
    // Bản tổng hợp bắt buộc có {{task_rows_html}} — thiếu thì dùng mặc định để email không bị hỏng.
    let tpl = await getTemplate('email_tpl_escalation')
    if (!tpl.includes('{{task_rows_html}}')) {
      logger.warn('[OverdueEscalation] Template "Escalation" trong Settings là bản cũ (theo từng task) — đang dùng bản tổng hợp mặc định. Hãy cập nhật hoặc xoá trắng template đó trong Settings.')
      tpl = DEFAULTS.email_tpl_escalation
    }

    // Khử trùng theo địa chỉ email → một hộp thư chỉ nhận đúng 1 email/ngày,
    // kể cả khi có 2 tài khoản admin dùng chung email.
    const sentTo = new Set()
    let sent = 0
    for (const admin of admins) {
      const addr = admin.email?.trim().toLowerCase()
      if (!addr || sentTo.has(addr)) continue
      sentTo.add(addr)

      const html = renderTemplate(tpl, {
        admin_name:     admin.name,
        date:           today,
        task_count:     escalated.length,
        task_rows_html: taskRowsHtml,
      })

      const ok = await sendMail({
        to: admin.email,
        subject: `[Escalation] ${escalated.length} công việc quá hạn — ${today}`,
        html,
        text: `Có ${escalated.length} công việc quá hạn đã tự động chuyển sang "Cần xem lại". Vui lòng đăng nhập hệ thống để xử lý.`,
      })
      if (ok) sent++
    }

    logger.info(`[OverdueEscalation] Escalated ${escalated.length} task(s) · gửi ${sent}/${sentTo.size} email tổng hợp`)
    return { processed: escalated.length, emailsSent: sent }
  } catch (err) {
    logger.error('[OverdueEscalation] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runOverdueEscalation }
