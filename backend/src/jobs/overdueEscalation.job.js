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
    // KHÔNG thoát sớm khi không có task mới: email vẫn phải gửi danh sách task
    // "Cần xem lại" còn tồn đọng. Trước đây thoát ở đây nên ngày nào không có
    // task mới rơi vào diện quá hạn là admin không nhận được gì, dù đang tồn
    // hàng chục task quá hạn.

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

    // ── Danh sách cho EMAIL: TOÀN BỘ task đang "Cần xem lại" và đã quá hạn ───
    //
    // KHÔNG dùng `escalated` (lô vừa bị đổi trạng thái ở trên). Lý do:
    //   · `pending`/`in_progress` là việc nhân sự ĐANG LÀM — không thuộc diện
    //     escalation, chúng chỉ là điều kiện để quét ra rồi đổi trạng thái.
    //   · Task đã chuyển `needs_revision` từ những ngày trước sẽ không bao giờ
    //     lọt vào lượt quét sau (vì lượt quét chỉ lấy pending/in_progress), nên
    //     nếu lấy `escalated` làm nội dung email thì admin chỉ thấy vài task mới
    //     rơi vào diện quá hạn, còn hàng chục task tồn đọng thì biến mất. Có ngày
    //     không task nào mới → không email, dù đang tồn đọng rất nhiều.
    // Đúng nghiệp vụ: email là DANH SÁCH VIỆC ADMIN CẦN XỬ LÝ, tức mọi task đang
    // "Cần xem lại" mà đã quá hạn.
    // Điều kiện `due_date < CURRENT_DATE` là BẮT BUỘC, không được bỏ:
    // trạng thái needs_revision còn nhận cả task do admin trả về làm lại, những
    // task đó hạn vẫn còn (thậm chí tạo hôm nay, hạn hôm nay). Đưa chúng vào
    // email "quá hạn" là báo sai. Chỉ task ĐÃ QUA hạn mới thuộc diện escalation.
    const { rows: canXuLy } = await query(
      `SELECT t.id, t.title, t.due_date,
              (CURRENT_DATE - t.due_date) AS days_overdue,
              u.name AS user_name,
              c.name AS company_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         LEFT JOIN companies c ON c.id = t.company_id
        WHERE t.status = 'needs_revision'
          AND t.due_date IS NOT NULL
          AND t.due_date::date < CURRENT_DATE
        ORDER BY t.due_date ASC`
    )

    if (canXuLy.length === 0) {
      logger.info('[OverdueEscalation] Không còn task nào ở trạng thái "Cần xem lại" — không gửi email')
      return { processed: escalated.length, emailsSent: 0 }
    }

    // Đánh dấu task VỪA bị đổi trạng thái hôm nay để admin thấy cái gì mới
    const idMoi = new Set(escalated.map((t) => t.id))

    const today = new Date().toLocaleDateString('vi-VN')
    const taskRowsHtml = canXuLy.map((t) => {
      // Task bị trả về mà hạn CÒN thì days_overdue âm → hiện "còn N ngày" thay vì
      // "quá hạn N ngày", tránh ghi sai trong email.
      const dueStr = t.due_date ? new Date(t.due_date).toLocaleDateString('vi-VN') : '—'
      const conHan = t.due_date == null || t.days_overdue <= 0
      const nhanHan = t.due_date == null
        ? '<span style="color:#94a3b8;font-weight:400">chưa đặt hạn</span>'
        : conHan
          ? `<span style="color:#94a3b8;font-weight:400">(còn ${Math.abs(t.days_overdue)} ngày)</span>`
          : `<span style="color:#94a3b8;font-weight:400">(quá ${t.days_overdue} ngày)</span>`
      const moi = idMoi.has(t.id)
        ? '<span style="background:#fef3c7;color:#92400e;font-size:11px;padding:1px 6px;border-radius:9999px;margin-left:6px">MỚI</span>'
        : ''
      return `<tr>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.title)}${moi}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.company_name) || '—'}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0">${escapeHtml(t.user_name) || '—'}</td>
        <td style="padding:8px 12px;border:1px solid #e2e8f0;white-space:nowrap;font-weight:600;color:${conHan ? '#64748b' : '#dc2626'}">${dueStr} ${nhanHan}</td>
      </tr>`
    }).join('')

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
        task_count:     canXuLy.length,
        task_rows_html: taskRowsHtml,
      })

      const ok = await sendMail({
        to: admin.email,
        subject: `[Escalation] ${canXuLy.length} công việc quá hạn — ${today}`,
        html,
        text: `Có ${canXuLy.length} công việc đang ở trạng thái "Cần xem lại"`
          + (escalated.length ? ` (trong đó ${escalated.length} mới chuyển hôm nay)` : '')
          + '. Vui lòng đăng nhập hệ thống để xử lý.',
      })
      if (ok) sent++
    }

    logger.info(`[OverdueEscalation] Đổi trạng thái ${escalated.length} task mới · email liệt kê ${canXuLy.length} task cần xử lý · gửi ${sent}/${sentTo.size} email`)
    return { processed: escalated.length, listed: canXuLy.length, emailsSent: sent }
  } catch (err) {
    logger.error('[OverdueEscalation] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runOverdueEscalation }
