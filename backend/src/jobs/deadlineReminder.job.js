'use strict'
const { query } = require('../config/db')
const { createAndEmit } = require('../lib/notify')
const { sendMail } = require('../utils/mailer')
const { getTemplate, renderTemplate } = require('../utils/emailTemplates')
const logger = require('../config/logger')

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ESC_MAP[c])

// Tối đa số dòng trong bảng — nhiều hơn thì ghi rõ còn bao nhiêu, tránh để người
// nhận tưởng cả tuần chỉ có bấy nhiêu việc.
const MAX_DONG = 10

async function runDeadlineReminder() {
  logger.info('[DeadlineReminder] Starting job')
  try {
    const { rows: [cfg] } = await query(
      "SELECT value FROM system_configs WHERE key = 'deadline_warning_days'"
    )
    const warningDays = parseInt(cfg?.value || '3', 10)

    const { rows: tasks } = await query(
      // Trạng thái hợp lệ của task_status: pending, in_progress, on_hold,
      // pending_review, needs_revision, completed. Trước đây lọc theo
      // 'done'/'cancelled' — vốn là giá trị của enum assignment_status (Phân công
      // nội bộ) — nên Postgres ném lỗi và CẢ JOB CHẾT, không email nào được gửi.
      `SELECT t.id, t.title, t.due_date, t.assigned_to, t.priority,
              (t.due_date::date - CURRENT_DATE) AS con_lai_ngay,
              u.name AS user_name, u.email AS user_email,
              c.name AS company_name
       FROM tasks t
       JOIN users u ON u.id = t.assigned_to
       LEFT JOIN companies c ON c.id = t.company_id
       WHERE t.status <> 'completed'
         AND t.due_date IS NOT NULL
         AND t.due_date::date BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($1 || ' days')::interval)::date
         AND u.status = 'active'
       ORDER BY t.due_date ASC, c.name`,
      [String(warningDays)]
    )

    logger.info(`[DeadlineReminder] Found ${tasks.length} tasks approaching deadline`)
    if (tasks.length === 0) return { processed: 0, emailsSent: 0 }

    // ── Thông báo trong app: vẫn theo TỪNG task ───────────────────────────────
    for (const task of tasks) {
      const dueStr = new Date(task.due_date).toLocaleDateString('vi-VN')
      await createAndEmit(
        task.assigned_to,
        'deadline_reminder',
        `Nhắc nhở: "${task.title}" sắp đến hạn`,
        `Công việc "${task.title}" (${task.company_name}) đến hạn ngày ${dueStr}.`,
        task.id,
      )
    }

    // ── Email: GOM THEO NGƯỜI, mỗi người đúng MỘT email ──────────────────────
    // Trước đây gửi 1 email / task nên một nhân sự có 5 việc sắp đến hạn là nhận
    // 5 email rời rạc — vừa loãng vừa dễ bỏ sót, lại dễ bị đánh dấu spam.
    const theoNguoi = new Map()
    for (const t of tasks) {
      if (!t.user_email) continue
      if (!theoNguoi.has(t.assigned_to)) {
        theoNguoi.set(t.assigned_to, { name: t.user_name, email: t.user_email, items: [] })
      }
      theoNguoi.get(t.assigned_to).items.push(t)
    }

    const tpl = await getTemplate('email_tpl_reminder')
    const hopLe = tpl.includes('{{task_rows_html}}')
    if (!hopLe) {
      logger.warn('[DeadlineReminder] Template "Nhắc nhở deadline" trong Settings là bản CŨ (1 email/task, dùng {{task_title}}). Cần cập nhật sang bản có {{task_rows_html}} — tạm dùng bảng dựng sẵn.')
    }

    let sent = 0
    for (const [, ng] of theoNguoi) {
      const items = ng.items
      const hienThi = items.slice(0, MAX_DONG)

      const rowsHtml = hienThi.map((t) => {
        const dueStr = new Date(t.due_date).toLocaleDateString('vi-VN')
        const con = t.con_lai_ngay
        const nhan = con === 0
          ? '<span style="color:#dc2626;font-weight:700">HÔM NAY</span>'
          : `<span style="color:#d97706">còn ${con} ngày</span>`
        return `<tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.title)}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.company_name) || '—'}</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;white-space:nowrap">${dueStr} · ${nhan}</td>
        </tr>`
      }).join('')

      const conLai = items.length - hienThi.length
      // Template đặt {{task_rows_html}} BÊN TRONG <tbody>, nên phần ghi chú phải
      // là một hàng <tr> — dùng <p> ở đây sẽ làm hỏng cấu trúc bảng.
      const ghiChu = conLai > 0
        ? `<tr><td colspan="3" style="padding:8px 12px;border:1px solid #e2e8f0;background:#fffbeb;font-size:12px;color:#b45309">
             Đang hiển thị ${hienThi.length}/${items.length} công việc — còn <b>${conLai}</b> công việc nữa,
             xem đầy đủ trong phần mềm.
           </td></tr>`
        : ''

      const bangDuPhong = `<table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#fffbeb">
            <th style="padding:8px 12px;text-align:left;border:1px solid #fde68a">Công việc</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #fde68a">Khách hàng</th>
            <th style="padding:8px 12px;text-align:left;border:1px solid #fde68a">Hạn</th>
          </tr></thead>
          <tbody>${rowsHtml}${ghiChu}</tbody>
        </table>`

      const html = hopLe
        ? renderTemplate(tpl, {
          user_name:      ng.name,
          task_count:     items.length,
          warning_days:   warningDays,
          task_rows_html: rowsHtml + ghiChu,
        })
        : `<p>Xin chào <b>${escapeHtml(ng.name)}</b>, bạn có <b>${items.length}</b> công việc sắp đến hạn:</p>${bangDuPhong}`

      const ok = await sendMail({
        to: ng.email,
        subject: `[Nhắc nhở] ${items.length} công việc sắp đến hạn`,
        html,
        text: `Bạn có ${items.length} công việc sắp đến hạn trong ${warningDays + 1} ngày tới. Vui lòng đăng nhập hệ thống để xem chi tiết.`,
      })
      if (ok) sent++
    }

    logger.info(`[DeadlineReminder] ${tasks.length} task · gửi ${sent}/${theoNguoi.size} email (mỗi người 1 email)`)
    return { processed: tasks.length, emailsSent: sent, recipients: theoNguoi.size }
  } catch (err) {
    logger.error('[DeadlineReminder] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runDeadlineReminder }
