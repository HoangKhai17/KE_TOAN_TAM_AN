'use strict'
const { query } = require('../config/db')

const WRAPPER = (body) => `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1e293b">
  <div style="background:#1e3a8a;padding:18px 28px;border-radius:8px 8px 0 0">
    <span style="color:#fff;font-size:16px;font-weight:bold">Kế Toán Tâm An</span>
  </div>
  <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    ${body}
  </div>
  <p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:12px">
    Email tự động từ hệ thống Kế Toán Tâm An — vui lòng không trả lời email này.
  </p>
</div>`

const DEFAULTS = {
  email_tpl_reminder: WRAPPER(`
<h2 style="color:#d97706;margin-top:0">⚠️ Nhắc nhở: Công việc sắp đến hạn</h2>
<p>Xin chào <strong>{{user_name}}</strong>,</p>
<p>Công việc <strong style="color:#1e3a8a">"{{task_title}}"</strong> thuộc khách hàng <strong>{{company_name}}</strong> sẽ đến hạn vào ngày <strong style="color:#dc2626">{{due_date}}</strong>.</p>
<p>Vui lòng hoàn thành đúng hạn hoặc liên hệ quản lý nếu gặp khó khăn.</p>`),

  email_tpl_morning: WRAPPER(`
<h2 style="color:#1e3a8a;margin-top:0;border-bottom:2px solid #dbeafe;padding-bottom:10px">📋 Báo cáo sáng — {{date}}</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:14px">
  <tr><td style="padding:9px 14px;color:#475569;border:1px solid #e2e8f0">Tổng công việc đang xử lý</td><td style="padding:9px 14px;font-weight:700;text-align:right;border:1px solid #e2e8f0">{{total_tasks}}</td></tr>
  <tr style="background:#fef2f2"><td style="padding:9px 14px;color:#dc2626;border:1px solid #e2e8f0">🔴 Quá hạn</td><td style="padding:9px 14px;font-weight:700;color:#dc2626;text-align:right;border:1px solid #e2e8f0">{{overdue_count}}</td></tr>
  <tr style="background:#fffbeb"><td style="padding:9px 14px;color:#d97706;border:1px solid #e2e8f0">🟡 Đến hạn hôm nay</td><td style="padding:9px 14px;font-weight:700;color:#d97706;text-align:right;border:1px solid #e2e8f0">{{due_today_count}}</td></tr>
  <tr><td style="padding:9px 14px;color:#94a3b8;border:1px solid #e2e8f0">⏸ Tạm hoãn</td><td style="padding:9px 14px;font-weight:700;text-align:right;border:1px solid #e2e8f0">{{on_hold_count}}</td></tr>
</table>
{{task_list_html}}`),

  email_tpl_escalation: WRAPPER(`
<h2 style="color:#dc2626;margin-top:0">🚨 Escalation: Công việc quá hạn</h2>
<p>Xin chào <strong>{{admin_name}}</strong>,</p>
<p>Công việc <strong style="color:#1e3a8a">"{{task_title}}"</strong> được giao cho <strong>{{assignee_name}}</strong> ({{company_name}}) đã <strong style="color:#dc2626">quá hạn từ ngày {{due_date}}</strong>.</p>
<p>Trạng thái đã tự động chuyển sang <strong style="background:#fef2f2;padding:2px 8px;border-radius:4px;color:#dc2626">"Cần xem lại"</strong>.</p>
<p style="color:#64748b;font-size:13px">Vui lòng kiểm tra và xử lý kịp thời.</p>`),
}

DEFAULTS.email_tpl_company_assignment = WRAPPER(`
<h2 style="color:#1e3a8a;margin-top:0">🏢 Phân công phụ trách khách hàng</h2>
<p>Xin chào <strong>{{assignee_name}}</strong>,</p>
<p>Bạn vừa được phân công phụ trách khách hàng mới. Vui lòng liên hệ và theo dõi các công việc liên quan trong hệ thống.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
  <tr>
    <td style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px 18px;border-radius:0 8px 8px 0" colspan="2">
      <div style="font-size:11px;font-weight:bold;color:#2563eb;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Khách hàng phụ trách</div>
      <div style="font-size:17px;font-weight:bold;color:#1e3a8a">🏢 {{company_name}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;font-size:13.5px">
  <tr>
    <td style="width:160px;padding:9px 14px;background:#f8fafc;color:#64748b;font-weight:600;border:1px solid #e2e8f0">Nhân viên phụ trách</td>
    <td style="padding:9px 14px;color:#1e293b;font-weight:600;border:1px solid #e2e8f0">{{assignee_name}}</td>
  </tr>
  <tr>
    <td style="padding:9px 14px;background:#f8fafc;color:#64748b;font-weight:600;border:1px solid #e2e8f0">Phân công bởi</td>
    <td style="padding:9px 14px;color:#1e293b;border:1px solid #e2e8f0">{{assigner_name}}</td>
  </tr>
  <tr>
    <td style="padding:9px 14px;background:#f8fafc;color:#64748b;font-weight:600;border:1px solid #e2e8f0">Ngày hiệu lực</td>
    <td style="padding:9px 14px;color:#1e293b;border:1px solid #e2e8f0">{{start_date}}</td>
  </tr>
</table>
<div style="margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
  <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
    <strong>Lưu ý:</strong> Bạn chịu trách nhiệm theo dõi toàn bộ công việc và đảm bảo tiến độ cho khách hàng này. Vui lòng đăng nhập hệ thống để xem danh sách công việc hiện có.
  </p>
</div>`)

DEFAULTS.email_tpl_company_unassignment = WRAPPER(`
<h2 style="color:#64748b;margin-top:0">🔄 Thay đổi phân công phụ trách</h2>
<p>Xin chào <strong>{{assignee_name}}</strong>,</p>
<p>Bạn đã được ghi nhận <strong style="color:#dc2626">không còn phụ trách</strong> khách hàng dưới đây kể từ ngày <strong>{{start_date}}</strong>.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
  <tr>
    <td style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 18px;border-radius:0 8px 8px 0" colspan="2">
      <div style="font-size:11px;font-weight:bold;color:#dc2626;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Khách hàng thôi phụ trách</div>
      <div style="font-size:17px;font-weight:bold;color:#1e3a8a">🏢 {{company_name}}</div>
    </td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;font-size:13.5px">
  <tr>
    <td style="width:160px;padding:9px 14px;background:#f8fafc;color:#64748b;font-weight:600;border:1px solid #e2e8f0">Thay đổi bởi</td>
    <td style="padding:9px 14px;color:#1e293b;border:1px solid #e2e8f0">{{assigner_name}}</td>
  </tr>
  <tr>
    <td style="padding:9px 14px;background:#f8fafc;color:#64748b;font-weight:600;border:1px solid #e2e8f0">Ngày hiệu lực</td>
    <td style="padding:9px 14px;color:#1e293b;border:1px solid #e2e8f0">{{start_date}}</td>
  </tr>
</table>
<p style="margin-top:16px;font-size:13px;color:#64748b;line-height:1.6">Nếu có thắc mắc, vui lòng liên hệ quản lý trực tiếp.</p>`)

DEFAULTS.email_tpl_attendance_confirmation = WRAPPER(`
<h2 style="color:#1e3a8a;margin-top:0;border-bottom:2px solid #dbeafe;padding-bottom:10px">
  📋 Bảng chấm công tháng {{month_year}}
</h2>
<p>Xin chào <strong>{{user_name}}</strong>,</p>
<p>Bộ phận kế toán gửi bảng chấm công của bạn trong tháng <strong>{{month_year}}</strong> để bạn xem lại và xác nhận.</p>

<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13.5px">
  <thead>
    <tr style="background:#1e3a8a;color:#fff">
      <th style="padding:10px 14px;font-weight:700;text-align:left;border:1px solid #1e40af">Chỉ tiêu</th>
      <th style="padding:10px 14px;font-weight:700;text-align:right;border:1px solid #1e40af">Số liệu</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569">Ngày công thực tế (TT)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600">{{work_days}} ngày</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#4338ca">Nghỉ có lương (NP/WFH/Lễ)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#4338ca">{{leave_days}} ngày</td>
    </tr>
    <tr style="background:#f0fdf4">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#166534;font-weight:700">Tổng công</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#166534">{{total_work}} ngày</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#dc2626">Vắng mặt</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#dc2626">{{absent_days}} ngày</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#d97706">Đi muộn</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#d97706">{{late_count}} lần</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#c2410c">Về sớm</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">{{early_count}} lần</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#7c3aed">Tăng ca (OT đã duyệt)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#7c3aed">{{ot_hours}}h</td>
    </tr>
  </tbody>
</table>

<h3 style="color:#1e3a8a;font-size:14px;margin-bottom:8px">Chi tiết từng ngày</h3>
{{attendance_table}}

<div style="margin-top:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px">
  <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6">
    <strong>Lưu ý:</strong> Nếu bạn phát hiện sai sót trong bảng chấm công, vui lòng phản hồi lại cho bộ phận kế toán trong vòng <strong>3 ngày làm việc</strong> kể từ ngày nhận email này.
  </p>
</div>`)

DEFAULTS.email_tpl_payroll_slip = WRAPPER(`
<h2 style="color:#1e3a8a;margin-top:0;border-bottom:2px solid #dbeafe;padding-bottom:10px">
  💰 Bảng lương tháng {{month_year}}
</h2>
<p>Xin chào <strong>{{user_name}}</strong>,</p>
<p>Bộ phận kế toán gửi bảng lương của bạn trong tháng <strong>{{month_year}}</strong> để bạn xem lại và xác nhận.</p>

<table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13.5px">
  <thead>
    <tr style="background:#1e3a8a;color:#fff">
      <th style="padding:10px 14px;font-weight:700;text-align:left;border:1px solid #1e40af">Khoản mục</th>
      <th style="padding:10px 14px;font-weight:700;text-align:right;border:1px solid #1e40af">Số tiền</th>
    </tr>
  </thead>
  <tbody>
    <tr style="background:#f0fdf4">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#166534;font-weight:700">Thu nhập gộp</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:700;color:#166534">{{gross_income}}</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">Lương cơ bản</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600">{{base_salary}}</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">Phụ cấp</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600">{{allowances}}</td>
    </tr>
    {{allowance_items_html}}
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">Thưởng</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600">{{bonus}}</td>
    </tr>
    {{bonus_items_html}}
    <tr style="background:#fff7ed">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#c2410c;font-weight:600">Khấu trừ</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right"></td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">BHXH (8%)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">- {{bhxh_employee}}</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">BHYT (1.5%)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">- {{bhyt_employee}}</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">BHTN (1%)</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">- {{bhtn_employee}}</td>
    </tr>
    <tr>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">Thuế TNCN</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">- {{pit_deduction}}</td>
    </tr>
    <tr style="background:#f8fafc">
      <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#475569;padding-left:24px">Khấu trừ khác</td>
      <td style="padding:9px 14px;border:1px solid #e2e8f0;text-align:right;font-weight:600;color:#c2410c">- {{other_deductions}}</td>
    </tr>
    <tr style="background:#1e3a8a;color:#fff">
      <td style="padding:12px 14px;font-weight:700;font-size:15px;border:1px solid #1e40af">THỰC NHẬN</td>
      <td style="padding:12px 14px;text-align:right;font-weight:800;font-size:16px;border:1px solid #1e40af">{{net_salary}}</td>
    </tr>
  </tbody>
</table>

{{notes_section}}

<div style="margin-top:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 18px">
  <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.6">
    <strong>Lưu ý:</strong> Nếu bạn có thắc mắc về bảng lương, vui lòng liên hệ bộ phận kế toán trong vòng <strong>3 ngày làm việc</strong> kể từ ngày nhận email này.
  </p>
</div>`)

async function getTemplate(key) {
  try {
    const { rows: [row] } = await query(
      'SELECT value FROM system_configs WHERE key = $1',
      [key]
    )
    const val = row?.value?.trim()
    return val || DEFAULTS[key] || ''
  } catch {
    return DEFAULTS[key] || ''
  }
}

function renderTemplate(html, vars) {
  return Object.entries(vars).reduce((acc, [k, v]) => {
    return acc.split(`{{${k}}}`).join(v ?? '')
  }, html)
}

module.exports = { getTemplate, renderTemplate, DEFAULTS }
