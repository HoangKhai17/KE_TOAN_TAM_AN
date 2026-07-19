'use strict'
const { query } = require('../config/db')
const { sendMail } = require('../utils/mailer')
const { getTemplate, renderTemplate } = require('../utils/emailTemplates')
const logger = require('../config/logger')

async function runMorningSummary() {
  logger.info('[MorningSummary] Starting job')
  try {
    const { rows: admins } = await query(
      "SELECT id, name, email FROM users WHERE role = 'admin' AND status = 'active'"
    )

    if (admins.length === 0) {
      logger.info('[MorningSummary] No admin users — skipping')
      return { sent: 0 }
    }

    const today = new Date().toLocaleDateString('vi-VN')

    const [
      { rows: [totalRow] },
      { rows: [overdueRow] },
      { rows: [dueTodayRow] },
      { rows: [onHoldRow] },
      { rows: dueTasks },
    ] = await Promise.all([
      // Trạng thái hợp lệ của task_status: pending, in_progress, on_hold,
      // pending_review, needs_revision, completed. Trước đây lọc theo
      // 'done'/'cancelled' — vốn là giá trị của enum assignment_status (Phân công
      // nội bộ) — nên Postgres ném lỗi và CẢ JOB CHẾT, không email nào được gửi.
      query("SELECT COUNT(*) FROM tasks WHERE status <> 'completed'"),
      query("SELECT COUNT(*) FROM tasks WHERE status <> 'completed' AND due_date < CURRENT_DATE"),
      query("SELECT COUNT(*) FROM tasks WHERE status <> 'completed' AND due_date = CURRENT_DATE"),
      query("SELECT COUNT(*) FROM tasks WHERE status = 'on_hold'"),
      query(
        `SELECT t.title, c.name AS company, u.name AS assignee
         FROM tasks t
         LEFT JOIN companies c ON c.id = t.company_id
         LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.due_date = CURRENT_DATE AND t.status <> 'completed'
         ORDER BY t.created_at DESC LIMIT 10`
      ),
    ])

    const taskRows = dueTasks.map((t) =>
      `<tr>
        <td style="padding:7px 10px;border:1px solid #e2e8f0">${t.title}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0">${t.company || '—'}</td>
        <td style="padding:7px 10px;border:1px solid #e2e8f0">${t.assignee || '—'}</td>
       </tr>`
    ).join('')

    // Bảng chỉ hiện tối đa 10 dòng. Nếu còn nữa thì PHẢI ghi rõ số còn lại —
    // không thì admin nhìn 10 dòng lại tưởng cả ngày chỉ có bấy nhiêu việc.
    const tongDenHan = parseInt(dueTodayRow.count, 10)
    const conLai = tongDenHan - dueTasks.length
    const ghiChuConLai = conLai > 0
      ? `<p style="margin:8px 0 0;font-size:13px;color:#b45309">
           Đang hiển thị ${dueTasks.length}/${tongDenHan} công việc — còn <b>${conLai}</b> công việc nữa,
           xem đầy đủ trong phần mềm.
         </p>`
      : ''

    const taskListHtml = dueTasks.length > 0
      ? `<h3 style="color:#1e3a8a">Công việc đến hạn hôm nay (${tongDenHan})</h3>
         <table style="width:100%;border-collapse:collapse;font-size:13px">
           <thead><tr style="background:#eff6ff">
             <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Công việc</th>
             <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Công ty</th>
             <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Nhân viên</th>
           </tr></thead>
           <tbody>${taskRows}</tbody>
         </table>${ghiChuConLai}`
      : '<p style="color:#94a3b8">Không có công việc đến hạn hôm nay.</p>'

    const tpl = await getTemplate('email_tpl_morning')
    const html = renderTemplate(tpl, {
      date: today,
      total_tasks: totalRow.count,
      overdue_count: overdueRow.count,
      due_today_count: dueTodayRow.count,
      on_hold_count: onHoldRow.count,
      task_list_html: taskListHtml,
    })

    let sent = 0
    for (const admin of admins) {
      if (!admin.email) continue
      const ok = await sendMail({
        to: admin.email,
        subject: `[Tổng kết sáng ${today}] Kế Toán Tâm An`,
        html,
        text: `Báo cáo sáng ${today}: ${totalRow.count} đang xử lý, ${overdueRow.count} quá hạn, ${dueTodayRow.count} đến hạn hôm nay.`,
      })
      if (ok) sent++
    }

    logger.info(`[MorningSummary] Sent ${sent}/${admins.length} emails`)
    return { sent }
  } catch (err) {
    logger.error('[MorningSummary] Job failed', { error: err.message })
    throw err
  }
}

module.exports = { runMorningSummary }
