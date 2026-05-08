import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, Users, ListTodo, Building2, Bell, CalendarDays, ShieldAlert,
  Settings as SettingsIcon, Plus, Pencil, Save, ArrowRight,
  ChevronDown, ChevronRight, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { listConfigs, updateConfig } from '../../api/systemConfigs'
import { listTaskTypes, createTaskType, updateTaskType, toggleTaskType } from '../../api/taskTypes'
import { BUSINESS_TYPE_LABELS } from '../Companies/Companies'
import s from './settings.module.css'

// ── Section list ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'timezone',       label: 'Múi giờ hệ thống',      icon: Clock,       dot: '#3b82f6', bg: '#eff6ff', iconColor: '#2563eb' },
  { key: 'users',          label: 'Quản lý người dùng',     icon: Users,       dot: '#059669', bg: '#f0fdf4', iconColor: '#059669' },
  { key: 'task-types',     label: 'Loại công việc',         icon: ListTodo,    dot: '#7c3aed', bg: '#f5f3ff', iconColor: '#7c3aed' },
  { key: 'business-types', label: 'Loại hình doanh nghiệp', icon: Building2,   dot: '#d97706', bg: '#fffbeb', iconColor: '#d97706' },
  { key: 'deadline',       label: 'Cảnh báo deadline',      icon: Bell,        dot: '#dc2626', bg: '#fef2f2', iconColor: '#dc2626' },
  { key: 'templates',      label: 'Template định kỳ',       icon: CalendarDays,dot: '#0891b2', bg: '#ecfeff', iconColor: '#0891b2' },
  { key: 'escalation',     label: 'Quy tắc Escalation',     icon: ShieldAlert, dot: '#4f46e5', bg: '#eef2ff', iconColor: '#4f46e5' },
]

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (UTC+7) — Việt Nam' },
  { value: 'Asia/Bangkok',     label: 'Asia/Bangkok (UTC+7) — Thái Lan' },
  { value: 'Asia/Singapore',   label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Tokyo',       label: 'Asia/Tokyo (UTC+9)' },
  { value: 'UTC',              label: 'UTC (UTC+0)' },
  { value: 'Europe/London',    label: 'Europe/London' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
]

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'

// ── Save feedback ─────────────────────────────────────────────────────────────

function SaveFeedback({ status }) {
  if (status === 'saving') return <span className={s.feedbackSaving}><Loader2 size={13} className={s.spin} /> Đang lưu…</span>
  if (status === 'ok')     return <span className={s.feedbackOk}><CheckCircle2 size={13} /> Đã lưu</span>
  if (status === 'err')    return <span className={s.feedbackErr}><AlertCircle size={13} /> Lỗi</span>
  return null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const user    = useAuthStore((st) => st.user)
  const isAdmin = user?.role === 'admin'

  const [activeSection, setActiveSection] = useState('users')

  if (!isAdmin) {
    return (
      <AppLayout>
        <div className={s.noAccess}>
          Bạn không có quyền truy cập trang này.
        </div>
      </AppLayout>
    )
  }

  const activeDef = SECTIONS.find((s) => s.key === activeSection)

  return (
    <AppLayout>
      <div className={s.settingsShell}>

        {/* ── Left sub-nav ── */}
        <aside className={s.settingsNav}>
          <div className={s.settingsNavHeader}>
            <SettingsIcon size={15} className={s.settingsNavIcon} />
            <span className={s.settingsNavTitle}>Cấu hình hệ thống</span>
          </div>
          <nav className={s.settingsNavList}>
            {SECTIONS.map(({ key, label, dot }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`${s.settingsNavItem} ${activeSection === key ? s.settingsNavItemActive : ''}`}
              >
                <span
                  className={s.settingsNavDot}
                  style={{ background: activeSection === key ? dot : '#d1d5db' }}
                />
                <span className={s.settingsNavLabel}>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* ── Right content ── */}
        <div className={s.settingsContent}>
          <div className={s.settingsContentInner}>
            {activeDef && (
              <div className={s.sectionHead}>
                <div
                  className={s.sectionIconWrap}
                  style={{ background: activeDef.bg }}
                >
                  <activeDef.icon size={18} style={{ color: activeDef.iconColor }} />
                </div>
                <h2 className={s.sectionTitle}>{activeDef.label}</h2>
              </div>
            )}

            {activeSection === 'timezone'       && <TimezoneSection />}
            {activeSection === 'users'          && <UsersSection />}
            {activeSection === 'task-types'     && <TaskTypesSection />}
            {activeSection === 'business-types' && <BusinessTypesSection />}
            {activeSection === 'deadline'       && <DeadlineSection />}
            {activeSection === 'templates'      && <TemplatesSection />}
            {activeSection === 'escalation'     && <EscalationSection />}
          </div>
        </div>

      </div>
    </AppLayout>
  )
}

// ── Section: Timezone ─────────────────────────────────────────────────────────

function TimezoneSection() {
  const [value, setValue]   = useState(DEFAULT_TIMEZONE)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    listConfigs().then((configs) => {
      if (cancelled) return
      const tz = configs.find((c) => c.key === 'system_timezone')
      setValue(tz ? tz.value : DEFAULT_TIMEZONE)
      setLoaded(true)
    }).catch(() => { setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    setStatus('saving')
    try {
      await updateConfig('system_timezone', value)
      setStatus('ok')
      setTimeout(() => setStatus(null), 2500)
    } catch {
      setStatus('err')
    }
  }

  return (
    <div>
      <p className={s.sectionText}>
        Múi giờ này ảnh hưởng đến hiển thị ngày giờ, gửi email tự động và các tác vụ định kỳ.
      </p>
      <div className={s.narrowForm}>
        <div>
          <label className={s.settingsLabel}>Múi giờ</label>
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`${s.settingsInput} ${s.settingsSelect}`}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
          <p className={s.settingsHint}>Yêu cầu khởi động lại server để áp dụng cho process.</p>
        </div>
        <div className={s.formActions}>
          <button
            className={s.btnSave}
            onClick={handleSave}
            disabled={!loaded || status === 'saving'}
          >
            {status === 'saving' ? <Loader2 size={13} /> : <Save size={13} />}
            Lưu thay đổi
          </button>
          <SaveFeedback status={status} />
        </div>
      </div>
    </div>
  )
}

// ── Section: Users ────────────────────────────────────────────────────────────

function UsersSection() {
  return (
    <div>
      <p className={s.sectionText}>
        Tạo, chỉnh sửa, phân quyền và quản lý trạng thái nhân viên tại trang quản lý riêng.
      </p>
      <Link to="/staff" className={s.linkReset}>
        <button className={s.btnSave}>
          Đi đến trang Nhân viên
          <ArrowRight size={14} />
        </button>
      </Link>

      <div className={s.roleGrid}>
        {[
          { role: 'admin',   color: '#7c3aed', bg: '#f5f3ff', desc: 'Toàn quyền hệ thống, quản lý cấu hình và nhân viên' },
          { role: 'manager', color: '#2563eb', bg: '#eff6ff', desc: 'Xem báo cáo, phân công và theo dõi công việc' },
          { role: 'staff',   color: '#059669', bg: '#f0fdf4', desc: 'Thực hiện và cập nhật trạng thái công việc được giao' },
        ].map(({ role, color, bg, desc }) => (
          <div key={role} className={s.roleCard}>
            <span className={s.roleBadge} style={{ background: bg, color }}>
              {role}
            </span>
            <p className={s.roleDesc}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Section: Task Types ───────────────────────────────────────────────────────

function TaskTypesSection() {
  const [grouped, setGrouped]     = useState({})
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [expanded, setExpanded]   = useState({})

  const load = async () => {
    setLoading(true)
    try {
      const result = await listTaskTypes()
      setGrouped(result.grouped || {})
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(id) {
    try { await toggleTaskType(id); load() } catch { /* ignore */ }
  }

  function toggleGroup(group) {
    setExpanded((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  return (
    <div>
      <div className={s.taskTypeHeader}>
        <p className={s.taskTypeDescription}>
          Định nghĩa loại công việc, nhóm, SLA mặc định.
        </p>
        <button className={s.btnAddSmall} onClick={() => { setEditing(null); setShowModal(true) }}>
          <Plus size={13} /> Thêm loại
        </button>
      </div>

      {loading ? (
        <div className={s.skeletonStack}>
          {[1,2,3].map((i) => <div key={i} className={s.skeletonLine} />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className={s.emptyState}>Chưa có loại công việc nào.</p>
      ) : (
        <div className={s.groupList}>
          {Object.entries(grouped).map(([group, types]) => (
            <div key={group} className={s.taskGroup}>
              <button
                onClick={() => toggleGroup(group)}
                className={s.taskGroupButton}
              >
                <span>{group || 'Chưa phân nhóm'}</span>
                <span className={s.taskGroupMeta}>
                  <span className={s.taskGroupCount}>{types.length} loại</span>
                  {(expanded[group] ?? true) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>
              {(expanded[group] ?? true) && (
                <table className={s.settingsTable}>
                  <thead>
                    <tr>
                      <th>Tên</th>
                      <th className={s.hiddenColumn}>Mô tả</th>
                      <th className={s.centerCell}>SLA</th>
                      <th className={s.centerCell}>Trạng thái</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((tt) => (
                      <tr key={tt.id}>
                        <td className={s.taskTypeName}>{tt.name}</td>
                        <td className={s.centerCell}>{tt.defaultSlaDays}d</td>
                        <td className={s.centerCell}>
                          <button
                            onClick={() => handleToggle(tt.id)}
                            className={tt.isActive ? s.badgeActive : s.badgeInactive}
                          >
                            <span className={s.badgeDot} />
                            {tt.isActive ? 'Hoạt động' : 'Tắt'}
                          </button>
                        </td>
                        <td className={s.actionsCell}>
                          <button
                            onClick={() => { setEditing(tt); setShowModal(true) }}
                            className={s.iconButton}
                            title="Chỉnh sửa"
                          >
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <TaskTypeModal
          taskType={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function TaskTypeModal({ taskType, onClose, onSaved }) {
  const isEdit = !!taskType
  const [form, setForm] = useState({
    name:           taskType?.name           ?? '',
    groupName:      taskType?.groupName      ?? '',
    description:    taskType?.description    ?? '',
    defaultSlaDays: taskType?.defaultSlaDays ?? 7,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Tên loại công việc không được để trống'); return }
    setSaving(true); setError(null)
    try {
      const body = {
        name:           form.name.trim(),
        groupName:      form.groupName.trim() || null,
        description:    form.description.trim() || null,
        defaultSlaDays: Number(form.defaultSlaDays) || 7,
      }
      if (isEdit) await updateTaskType(taskType.id, body)
      else        await createTaskType(body)
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đã xảy ra lỗi')
      setSaving(false)
    }
  }

  function set(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }

  return (
    <Modal
      title={isEdit ? 'Chỉnh sửa loại công việc' : 'Thêm loại công việc'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && (
          <div className={s.errorBox}>
            {error}
          </div>
        )}
        {[
          { key: 'name',        label: 'Tên loại công việc *', placeholder: 'VD: Khai thuế GTGT', type: 'text' },
          { key: 'groupName',   label: 'Nhóm',                 placeholder: 'VD: Khai thuế',       type: 'text' },
          { key: 'description', label: 'Mô tả',                placeholder: '',                     type: 'text' },
        ].map(({ key, label, placeholder, type }) => (
          <div key={key}>
            <label className={s.settingsLabel}>{label}</label>
            <input
              type={type}
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              className={s.settingsInput}
            />
          </div>
        ))}
        <div>
          <label className={s.settingsLabel}>SLA mặc định (ngày)</label>
          <input
            type="number" min={1}
            value={form.defaultSlaDays}
            onChange={set('defaultSlaDays')}
            className={`${s.settingsInput} ${s.slaInput}`}
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnSave}>
            {saving && <Loader2 size={13} />}
            {isEdit ? 'Lưu thay đổi' : 'Tạo mới'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Section: Business Types ───────────────────────────────────────────────────

function BusinessTypesSection() {
  return (
    <div>
      <p className={s.sectionText}>
        Danh sách loại hình doanh nghiệp được cố định ở cấp cơ sở dữ liệu và không thể thay đổi qua giao diện.
      </p>
      <div className={s.businessTableWrap}>
        <table className={s.settingsTable}>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên hiển thị</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(BUSINESS_TYPE_LABELS).map(([code, label]) => (
              <tr key={code}>
                <td>
                  <code className={s.codePill}>
                    {code}
                  </code>
                </td>
                <td className={s.semiBold}>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Section: Deadline warnings ────────────────────────────────────────────────

function DeadlineSection() {
  return (
    <ConfigFormSection
      description="Cấu hình ngưỡng cảnh báo khi công việc gần đến hoặc đã quá hạn."
      fields={[
        { key: 'deadline_warning_days',   label: 'Cảnh báo trước deadline', suffix: 'ngày', type: 'number', min: 1, max: 30 },
        { key: 'escalation_overdue_days', label: 'Escalate khi quá hạn',    suffix: 'ngày', type: 'number', min: 1, max: 30 },
      ]}
    />
  )
}

// ── Section: Templates ────────────────────────────────────────────────────────

function TemplatesSection() {
  return (
    <div className={s.comingSoon}>
      <CalendarDays size={44} className={s.comingSoonIcon} />
      <p className={s.comingSoonTitle}>Tính năng đang phát triển</p>
      <p className={s.comingSoonText}>Template công việc định kỳ sẽ có ở Phase 8.</p>
    </div>
  )
}

// ── Section: Escalation ───────────────────────────────────────────────────────

function EscalationSection() {
  return (
    <ConfigFormSection
      description="Cấu hình thời gian tạm hoãn, lịch email và giới hạn đăng nhập."
      fields={[
        { key: 'escalation_on_hold_days', label: 'Nhắc nhở khi tạm hoãn',      suffix: 'ngày',  type: 'number', min: 1 },
        { key: 'morning_email_time',      label: 'Giờ gửi email sáng',          suffix: 'HH:MM', type: 'time' },
        { key: 'max_login_attempts',      label: 'Số lần đăng nhập sai tối đa', suffix: 'lần',   type: 'number', min: 1, max: 20 },
        { key: 'lock_duration_minutes',   label: 'Thời gian khoá tài khoản',    suffix: 'phút',  type: 'number', min: 1 },
      ]}
    />
  )
}

// ── Shared: config form ───────────────────────────────────────────────────────

function ConfigFormSection({ description, fields }) {
  const [values, setValues] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    listConfigs().then((configs) => {
      if (cancelled) return
      const map = {}
      configs.forEach((c) => { map[c.key] = c.value })
      const init = {}
      fields.forEach((f) => { init[f.key] = map[f.key] ?? '' })
      setValues(init)
      setLoaded(true)
    }).catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(e) {
    e.preventDefault()
    setStatus('saving')
    try {
      await Promise.all(fields.map((f) => updateConfig(f.key, values[f.key])))
      setStatus('ok')
      setTimeout(() => setStatus(null), 2500)
    } catch {
      setStatus('err')
    }
  }

  return (
    <div>
      <p className={s.sectionText}>{description}</p>
      {!loaded ? (
        <div className={s.configSkeleton}>
          {fields.map((f) => <div key={f.key} className={s.skeletonLine} />)}
        </div>
      ) : (
        <form onSubmit={handleSave} className={s.configForm}>
          {fields.map(({ key, label, suffix, type, min, max }) => (
            <div key={key}>
              <label className={s.settingsLabel}>{label}</label>
              <div className={s.fieldRow}>
                <input
                  type={type}
                  min={min}
                  max={max}
                  value={values[key] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`${s.settingsInput} ${s.fluidInput}`}
                />
                {suffix && (
                  <span className={s.suffix}>{suffix}</span>
                )}
              </div>
            </div>
          ))}
          <div className={s.formActions}>
            <button type="submit" className={s.btnSave}>
              <Save size={13} />
              Lưu thay đổi
            </button>
            <SaveFeedback status={status} />
          </div>
        </form>
      )}
    </div>
  )
}
