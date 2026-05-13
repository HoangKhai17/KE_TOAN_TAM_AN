'use strict'
const { query } = require('../config/db')
const { sendMail } = require('../utils/mailer')
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
      query("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done','cancelled')"),
      query("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done','cancelled') AND due_date < CURRENT_DATE"),
      query("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done','cancelled') AND due_date = CURRENT_DATE"),
      query("SELECT COUNT(*) FROM tasks WHERE status = 'on_hold'"),
      query(
        `SELECT t.title, c.name AS company, u.name AS assignee
         FROM tasks t
         LEFT JOIN companies c ON c.id = t.company_id
         LEFT JOIN users u ON u.id = t.assigned_to
         WHERE t.due_date = CURRENT_DATE AND t.status NOT IN ('done','cancelled')
         ORDER BY t.created_at DESC LIMIT 10`
      ),
    ])

    const taskRows = dueTasks.map((t) =>
      `<tr>
        <td style="padding:5px 10px;border-bottom:1px solid #e5e7eb">${t.title}</td>
        <td style="padding:5px 10px;border-bottom:1px solid #e5e7eb">${t.company || '—'}</td>
        <td style="padding:5px 10px;border-bottom:1px solid #e5e7eb">${t.assignee || '—'}</td>
       </tr>`
    ).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e3a8a;border-bottom:2px solid #dbeafe;padding-bottom:8px">
          📋 Báo cáo sáng — ${today}
        </h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr>
            <td style="padding:8px 12px;color:#64748b">Tổng công việc đang xử lý</td>
            <td style="padding:8px 12px;font-weight:bold">${totalRow.count}</td>
          </tr>
          <tr style="background:#fef2f2">
            <td style="padding:8px 12px;color:#dc2626">Quá hạn</td>
            <td style="padding:8px 12px;font-weight:bold;color:#dc2626">${overdueRow.count}</td>
          </tr>
          <tr style="background:#fffbeb">
            <td style="padding:8px 12px;color:#d97706">Đến hạn hôm nay</td>
            <td style="padding:8px 12px;font-weight:bold;color:#d97706">${dueTodayRow.count}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#94a3b8">Tạm hoãn</td>
            <td style="padding:8px 12px;font-weight:bold">${onHoldRow.count}</td>
          </tr>
        </table>
        ${dueTasks.length > 0 ? `
        <h3 style="color:#1e3a8a">Công việc đến hạn hôm nay</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#eff6ff">
              <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #dbeafe">Công việc</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #dbeafe">Công ty</th>
              <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #dbeafe">Nhân viên</th>
            </tr>
          </thead>
          <tbody>${taskRows}</tbody>
        </table>` : '<p style="color:#94a3b8">Không có công việc đến hạn hôm nay.</p>'}
        <br>
        <p style="color:#94a3b8;font-size:12px">— Hệ thống Kế Toán Tâm An</p>
      </div>
    `

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
