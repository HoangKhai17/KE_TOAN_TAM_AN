import { useState, useEffect } from 'react'
import { Save, Eye, Code, RotateCcw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { listConfigs, updateConfig } from '../../api/systemConfigs'
import { useToastStore } from '../../stores/toastStore'
import s from './settings.module.css'

const TEMPLATES = [
  {
    key: 'email_tpl_company_assignment',
    label: 'Phân công KH',
    icon: '🏢',
    desc: 'Gửi cho nhân viên khi được phân công phụ trách khách hàng mới',
    vars: [
      { name: '{{assignee_name}}', desc: 'Tên nhân viên được giao' },
      { name: '{{company_name}}',  desc: 'Tên khách hàng' },
      { name: '{{assigner_name}}', desc: 'Người thực hiện phân công' },
      { name: '{{start_date}}',    desc: 'Ngày hiệu lực' },
    ],
  },
  {
    key: 'email_tpl_company_unassignment',
    label: 'Thôi phụ trách',
    icon: '🔄',
    desc: 'Gửi cho nhân viên khi bị thay thế / không còn phụ trách khách hàng',
    vars: [
      { name: '{{assignee_name}}', desc: 'Tên nhân viên' },
      { name: '{{company_name}}',  desc: 'Tên khách hàng' },
      { name: '{{assigner_name}}', desc: 'Người thực hiện thay đổi' },
      { name: '{{start_date}}',    desc: 'Ngày hiệu lực thay đổi' },
    ],
  },
  {
    key: 'email_tpl_reminder',
    label: 'Nhắc nhở deadline',
    icon: '⚠️',
    desc: 'Gửi cho nhân viên khi công việc sắp đến hạn',
    vars: [
      { name: '{{user_name}}',    desc: 'Tên nhân viên' },
      { name: '{{task_title}}',   desc: 'Tiêu đề công việc' },
      { name: '{{company_name}}', desc: 'Tên khách hàng' },
      { name: '{{due_date}}',     desc: 'Ngày hết hạn' },
    ],
  },
  {
    key: 'email_tpl_morning',
    label: 'Báo cáo sáng',
    icon: '🌅',
    desc: 'Gửi cho admin mỗi sáng tổng hợp tình trạng công việc',
    vars: [
      { name: '{{date}}',           desc: 'Ngày báo cáo' },
      { name: '{{total_tasks}}',    desc: 'Tổng số công việc đang xử lý' },
      { name: '{{overdue_count}}',  desc: 'Số công việc quá hạn' },
      { name: '{{due_today_count}}', desc: 'Số công việc đến hạn hôm nay' },
      { name: '{{on_hold_count}}',  desc: 'Số công việc tạm hoãn' },
      { name: '{{task_list_html}}', desc: 'Bảng công việc đến hạn hôm nay (HTML tự động)' },
    ],
  },
  {
    key: 'email_tpl_escalation',
    label: 'Escalation',
    icon: '🚨',
    desc: 'Gửi cho admin khi có công việc quá hạn và tự động escalate',
    vars: [
      { name: '{{admin_name}}',     desc: 'Tên quản trị viên' },
      { name: '{{task_title}}',     desc: 'Tiêu đề công việc' },
      { name: '{{assignee_name}}',  desc: 'Tên nhân viên được giao' },
      { name: '{{company_name}}',   desc: 'Tên khách hàng' },
      { name: '{{due_date}}',       desc: 'Ngày hết hạn' },
    ],
  },
  {
    key: 'email_tpl_payroll_slip',
    label: 'Bảng lương',
    icon: '💰',
    desc: 'Gửi cho nhân viên khi admin gửi bảng lương hàng tháng từ trang Payroll Detail',
    vars: [
      { name: '{{user_name}}',         desc: 'Tên nhân viên' },
      { name: '{{month_year}}',        desc: 'Tháng/năm (VD: Tháng 05/2026)' },
      { name: '{{base_salary}}',       desc: 'Lương cơ bản (đã format VND)' },
      { name: '{{allowances}}',        desc: 'Phụ cấp (đã format VND)' },
      { name: '{{bonus}}',             desc: 'Thưởng (đã format VND)' },
      { name: '{{gross_income}}',      desc: 'Thu nhập gộp (đã format VND)' },
      { name: '{{bhxh_employee}}',     desc: 'BHXH nhân viên (đã format VND)' },
      { name: '{{bhyt_employee}}',     desc: 'BHYT nhân viên (đã format VND)' },
      { name: '{{bhtn_employee}}',     desc: 'BHTN nhân viên (đã format VND)' },
      { name: '{{pit_deduction}}',     desc: 'Thuế TNCN (đã format VND)' },
      { name: '{{other_deductions}}',  desc: 'Khấu trừ khác (đã format VND)' },
      { name: '{{net_salary}}',        desc: 'Thực nhận (đã format VND)' },
      { name: '{{notes}}',             desc: 'Ghi chú bảng lương (nếu có)' },
    ],
  },
  {
    key: 'email_tpl_attendance_confirmation',
    label: 'Xác nhận chấm công',
    icon: '📋',
    desc: 'Gửi cho nhân viên khi admin xác nhận bảng chấm công tháng',
    vars: [
      { name: '{{user_name}}',         desc: 'Tên nhân viên' },
      { name: '{{month_year}}',        desc: 'Tháng/năm (VD: Tháng 05/2026)' },
      { name: '{{work_days}}',         desc: 'Ngày công thực tế (TT)' },
      { name: '{{leave_days}}',        desc: 'Nghỉ có lương (NP/WFH/Lễ)' },
      { name: '{{total_work}}',        desc: 'Tổng công = TT + Nghỉ lương' },
      { name: '{{absent_days}}',       desc: 'Số ngày vắng mặt' },
      { name: '{{late_count}}',        desc: 'Số lần đi muộn' },
      { name: '{{early_count}}',       desc: 'Số lần về sớm' },
      { name: '{{ot_hours}}',          desc: 'Giờ OT đã duyệt (từ overtime_requests)' },
      { name: '{{attendance_table}}',  desc: 'Bảng chi tiết ngày công (HTML tự động)' },
    ],
  },
]

// Sample values shown in Preview mode
const PREVIEW_VARS = {
  assignee_name:     'Nguyễn Văn A',
  company_name:      'Công ty TNHH Tâm An',
  assigner_name:     'Trần Thị B (Admin)',
  start_date:        new Date().toLocaleDateString('vi-VN'),
  task_title:        'Lập báo cáo thuế quý 2',
  priority:          'Cao',
  due_date:          '31/12/2026',
  description_block: '<p><strong>Mô tả:</strong> Lập báo cáo thuế GTGT và TNDN quý 2 năm 2026.</p>',
  user_name:         'Lê Văn C',
  date:              new Date().toLocaleDateString('vi-VN'),
  total_tasks:       '12',
  overdue_count:     '2',
  due_today_count:   '3',
  on_hold_count:     '1',
  task_list_html:    `<h3 style="color:#1e3a8a">Công việc đến hạn hôm nay</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#eff6ff">
        <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Công việc</th>
        <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Công ty</th>
        <th style="padding:7px 10px;text-align:left;border:1px solid #dbeafe">Nhân viên</th>
      </tr></thead>
      <tbody>
        <tr><td style="padding:7px 10px;border:1px solid #e2e8f0">Lập báo cáo thuế</td><td style="padding:7px 10px;border:1px solid #e2e8f0">Tâm An</td><td style="padding:7px 10px;border:1px solid #e2e8f0">Nguyễn Văn A</td></tr>
      </tbody>
    </table>`,
  admin_name: 'Admin Tâm An',
  base_salary:      '10,000,000 ₫',
  allowances:       '500,000 ₫',
  bonus:            '1,000,000 ₫',
  gross_income:     '11,500,000 ₫',
  bhxh_employee:    '800,000 ₫',
  bhyt_employee:    '150,000 ₫',
  bhtn_employee:    '100,000 ₫',
  pit_deduction:    '0 ₫',
  other_deductions: '0 ₫',
  net_salary:       '10,450,000 ₫',
  notes:            '',
  month_year: 'Tháng 05/2026',
  work_days: '22.0',
  leave_days: '1.0',
  total_work: '23.0',
  absent_days: '0',
  late_count: '2',
  early_count: '1',
  ot_hours: '4.5',
  attendance_table: `<table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#1e3a8a;color:#fff">
      <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Ngày</th>
      <th style="padding:8px 12px;border:1px solid #1e40af">Trạng thái</th>
      <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Giờ vào</th>
      <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Giờ ra</th>
      <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Muộn</th>
      <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Sớm</th>
    </tr></thead>
    <tbody>
      <tr><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">1 <span style="font-size:11px;color:#94a3b8">(T5)</span></td><td style="padding:7px 12px;border:1px solid #e2e8f0;font-weight:600;color:#047857">Có mặt</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">08:00</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">17:30</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center"></td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center"></td></tr>
      <tr style="background:#f8fafc"><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">2 <span style="font-size:11px;color:#94a3b8">(T6)</span></td><td style="padding:7px 12px;border:1px solid #e2e8f0;font-weight:600;color:#b45309">Đi muộn</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">08:22</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">17:30</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#d97706">+22p</td><td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center"></td></tr>
    </tbody>
  </table>`,
}

function renderPreview(html) {
  return Object.entries(PREVIEW_VARS).reduce((acc, [k, v]) => {
    return acc.split(`{{${k}}}`).join(v)
  }, html)
}

export default function EmailTemplatesSection() {
  const addToast = useToastStore((st) => st.toast)
  const [activeTab, setActiveTab] = useState(TEMPLATES[0].key)
  const [mode, setMode] = useState('source') // default to 'source' so HTML pastes correctly
  const [contents, setContents] = useState({})
  const [originals, setOriginals] = useState({})
  const [saving, setSaving] = useState({})
  const [saveStatus, setSaveStatus] = useState({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    listConfigs().then((configs) => {
      const map = {}
      configs.forEach((c) => { map[c.key] = c.value })
      const initial = {}
      TEMPLATES.forEach(({ key }) => { initial[key] = map[key] || '' })
      setContents(initial)
      setOriginals(initial)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const current = TEMPLATES.find((t) => t.key === activeTab)
  const isDirty  = contents[activeTab] !== originals[activeTab]

  async function handleSave() {
    setSaving((p) => ({ ...p, [activeTab]: true }))
    setSaveStatus((p) => ({ ...p, [activeTab]: null }))
    try {
      await updateConfig(activeTab, contents[activeTab])
      setOriginals((p) => ({ ...p, [activeTab]: contents[activeTab] }))
      setSaveStatus((p) => ({ ...p, [activeTab]: 'ok' }))
      setTimeout(() => setSaveStatus((p) => ({ ...p, [activeTab]: null })), 2500)
      addToast('Đã lưu template email', 'success')
    } catch {
      setSaveStatus((p) => ({ ...p, [activeTab]: 'err' }))
      addToast('Không thể lưu template', 'error')
    } finally {
      setSaving((p) => ({ ...p, [activeTab]: false }))
    }
  }

  function handleReset() {
    setContents((p) => ({ ...p, [activeTab]: originals[activeTab] || '' }))
  }

  return (
    <div style={{ marginTop: 36, borderTop: '2px solid #e2e8f0', paddingTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1e3a8a' }}>
          Template nội dung email
        </h3>
        {isDirty && (
          <span style={{ fontSize: 11, color: '#d97706', background: '#fffbeb', padding: '2px 8px', borderRadius: 99, border: '1px solid #fcd34d', fontWeight: 600 }}>
            Chưa lưu
          </span>
        )}
      </div>
      <p className={s.sectionText} style={{ marginBottom: 14 }}>
        Tùy chỉnh nội dung HTML cho từng loại email. Các biến&nbsp;
        <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>{'{{tên_biến}}'}</code>
        &nbsp;sẽ được thay thế tự động khi hệ thống gửi.
      </p>

      {/* Template tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TEMPLATES.map((tpl) => (
          <button
            key={tpl.key}
            onClick={() => { setActiveTab(tpl.key); setMode('source') }}
            style={{
              padding: '8px 14px',
              border: 'none',
              background: activeTab === tpl.key ? '#fff' : 'transparent',
              borderBottom: activeTab === tpl.key ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
              color: activeTab === tpl.key ? '#2563eb' : '#64748b',
              fontWeight: activeTab === tpl.key ? 700 : 500,
              fontSize: 12.5,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ marginRight: 4 }}>{tpl.icon}</span>
            {tpl.label}
            {contents[tpl.key] !== originals[tpl.key] && (
              <span style={{ marginLeft: 5, width: 6, height: 6, borderRadius: '50%', background: '#d97706', display: 'inline-block', verticalAlign: 'middle' }} />
            )}
          </button>
        ))}
      </div>

      {/* Editor card */}
      <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 10px 10px', background: '#fff' }}>

        {/* Tab description */}
        {current?.desc && (
          <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#64748b' }}>
            {current.icon}&nbsp;{current.desc}
          </div>
        )}

        {/* Mode + action toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'source',  icon: <Code size={12} />,  label: 'HTML' },
              { id: 'preview', icon: <Eye size={12} />,   label: 'Xem trước' },
            ].map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                  border: '1px solid', borderColor: mode === id ? '#2563eb' : '#e2e8f0',
                  borderRadius: 6,
                  background: mode === id ? '#eff6ff' : '#fff',
                  color: mode === id ? '#2563eb' : '#64748b',
                  fontWeight: mode === id ? 700 : 500,
                  fontSize: 12, cursor: 'pointer',
                }}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isDirty && (
              <button
                onClick={handleReset}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', color: '#64748b', fontSize: 12, cursor: 'pointer', fontWeight: 500 }}
              >
                <RotateCcw size={12} />Hoàn tác
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving[activeTab] || !isDirty}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 16px', border: 'none', borderRadius: 6,
                background: isDirty ? '#2563eb' : '#e2e8f0',
                color: isDirty ? '#fff' : '#94a3b8',
                fontSize: 12, fontWeight: 700, cursor: isDirty ? 'pointer' : 'default',
              }}
            >
              {saving[activeTab]
                ? <Loader2 size={12} className={s.spin} />
                : saveStatus[activeTab] === 'ok'
                  ? <CheckCircle2 size={12} />
                  : <Save size={12} />}
              Lưu template
            </button>
          </div>
        </div>

        {/* HTML source warning */}
        {mode === 'source' && (
          <div style={{ display: 'flex', gap: 8, padding: '7px 14px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', fontSize: 11, color: '#92400e' }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Paste HTML đầy đủ vào đây. Mọi thay đổi được lưu nguyên bản — không qua trình soạn thảo nào. Nhấn <strong>Xem trước</strong> để kiểm tra với dữ liệu mẫu.</span>
          </div>
        )}

        {!loaded ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: 14, background: '#f1f5f9', borderRadius: 6, marginBottom: 10 }} />
            ))}
          </div>
        ) : (
          <div>
            {mode === 'source' && (
              <textarea
                key={activeTab}
                value={contents[activeTab] || ''}
                onChange={(e) => setContents((p) => ({ ...p, [activeTab]: e.target.value }))}
                spellCheck={false}
                placeholder={`<!-- Paste HTML template tại đây -->\n<!-- Dùng {{tên_biến}} để chèn dữ liệu động -->`}
                style={{
                  width: '100%', minHeight: 420, padding: '14px 16px',
                  fontFamily: '"Cascadia Code","Consolas","Courier New",monospace',
                  fontSize: 12.5, lineHeight: 1.65,
                  border: 'none', resize: 'vertical', outline: 'none',
                  background: '#0f172a', color: '#e2e8f0',
                  boxSizing: 'border-box', display: 'block',
                }}
              />
            )}

            {mode === 'preview' && (
              <div>
                <div style={{ padding: '7px 14px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontSize: 11, color: '#0c4a6e', fontStyle: 'italic' }}>
                  Xem trước với dữ liệu mẫu — nội dung thực tế sẽ được điền tự động khi hệ thống gửi email.
                </div>
                {(contents[activeTab] || '').trim() ? (
                  <iframe
                    key={activeTab + (contents[activeTab] || '').slice(0, 50)}
                    srcDoc={renderPreview(contents[activeTab] || '')}
                    style={{ width: '100%', minHeight: 500, border: 'none', display: 'block' }}
                    sandbox="allow-same-origin"
                    title="Email preview"
                  />
                ) : (
                  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Chưa có nội dung — hãy paste HTML template vào chế độ HTML.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Variables legend */}
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px', background: '#f8fafc', borderRadius: '0 0 10px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Biến dùng được trong template này
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 14px' }}>
            {current?.vars.map(({ name, desc }) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <code
                  title="Click để copy"
                  onClick={() => navigator.clipboard?.writeText(name)}
                  style={{ background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: 4, fontWeight: 700, cursor: 'pointer', userSelect: 'all' }}
                >
                  {name}
                </code>
                <span style={{ color: '#64748b' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
