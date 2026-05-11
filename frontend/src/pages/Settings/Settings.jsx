import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Clock, Users, ListTodo, Bell, CalendarDays, ShieldAlert,
  Settings as SettingsIcon, Plus, Pencil, Save, KeyRound,
  Loader2, CheckCircle2, AlertCircle,
  Search, Eye, EyeOff, UserX, UserCheck, Camera, Tag,
  Play, RotateCcw, CheckCircle, XCircle,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { listConfigs, updateConfig } from '../../api/systemConfigs'
import { listUsers, createUser, updateUser, updateUserStatus, resetUserPassword } from '../../api/users'
import { getSchedulerStatus, runSchedulerNow } from '../../api/scheduler'
import TaskTypesSection from './TaskTypesSection'
import EnumManagementSection from './EnumManagementSection'
import s from './settings.module.css'

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AvatarUpload({ value, name, isAdmin, onChange }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const SIZE = 160
        const canvas = document.createElement('canvas')
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')
        const s = Math.min(img.width, img.height)
        const ox = (img.width - s) / 2
        const oy = (img.height - s) / 2
        ctx.drawImage(img, ox, oy, s, s, 0, 0, SIZE, SIZE)
        onChange(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={s.avatarUploadWrap}>
      <div className={s.avatarUploadCircle} onClick={() => inputRef.current?.click()} title="Nhấp để chọn ảnh">
        {value ? (
          <img src={value} alt={name} className={s.avatarUploadImg} />
        ) : (
          <div className={`${s.userInitials} ${isAdmin ? s.userInitialsGold : ''}`}
            style={{ width: '100%', height: '100%', borderRadius: '50%', fontSize: 20, border: 'none' }}>
            {getInitials(name)}
          </div>
        )}
        <div className={s.avatarUploadOverlay}><Camera size={16} /></div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <div className={s.avatarUploadActions}>
        <button type="button" className={s.avatarUploadBtn} onClick={() => inputRef.current?.click()}>
          <Camera size={11} /> Chọn ảnh
        </button>
        {value && (
          <button type="button" className={s.avatarRemoveBtn} onClick={() => onChange(null)}>
            Xoá
          </button>
        )}
      </div>
    </div>
  )
}

// ── Section list ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'timezone',        label: 'Múi giờ hệ thống',      icon: Clock,       dot: '#3b82f6', bg: '#eff6ff', iconColor: '#2563eb' },
  { key: 'users',           label: 'Quản lý người dùng',     icon: Users,       dot: '#059669', bg: '#f0fdf4', iconColor: '#059669' },
  { key: 'task-types',      label: 'Loại công việc',         icon: ListTodo,    dot: '#7c3aed', bg: '#f5f3ff', iconColor: '#7c3aed' },
  { key: 'enum-management', label: 'Danh mục hệ thống',      icon: Tag,         dot: '#0f766e', bg: '#f0fdfa', iconColor: '#0f766e' },
  { key: 'deadline',        label: 'Cảnh báo deadline',      icon: Bell,        dot: '#dc2626', bg: '#fef2f2', iconColor: '#dc2626' },
  { key: 'templates',       label: 'Bộ lập lịch tự động',   icon: CalendarDays,dot: '#0891b2', bg: '#ecfeff', iconColor: '#0891b2' },
  { key: 'escalation',      label: 'Quy tắc Escalation',     icon: ShieldAlert, dot: '#4f46e5', bg: '#eef2ff', iconColor: '#4f46e5' },
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

  const [searchParams] = useSearchParams()
  const initialSection = SECTIONS.some((sec) => sec.key === searchParams.get('section'))
    ? searchParams.get('section')
    : 'users'
  const [activeSection, setActiveSection] = useState(initialSection)

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

            {activeSection === 'timezone'        && <TimezoneSection />}
            {activeSection === 'users'           && <UsersSection />}
            {activeSection === 'task-types'      && <TaskTypesSection />}
            {activeSection === 'enum-management' && <EnumManagementSection />}
            {activeSection === 'deadline'        && <DeadlineSection />}
            {activeSection === 'templates'       && <TemplatesSection />}
            {activeSection === 'escalation'      && <EscalationSection />}
          </div>
        </div>

      </div>
    </AppLayout>
  )
}

// ── Section: Timezone ─────────────────────────────────────────────────────────

function TimezoneSection() {
  const addToast            = useToastStore((st) => st.toast)
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
      addToast('Đã lưu múi giờ hệ thống', 'success')
    } catch {
      setStatus('err')
      addToast('Không thể lưu múi giờ', 'error')
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
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [showCreate, setShowCreate]   = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [resetTarget, setResetTarget] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const result = await listUsers({ limit: 100 })
      setUsers(result.users)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleStatusToggle(u) {
    const newStatus = u.status === 'active' ? 'on_leave' : 'active'
    try {
      await updateUserStatus(u.id, newStatus)
      load()
      const label = newStatus === 'on_leave' ? 'Tạm dừng' : 'Kích hoạt'
      addToast(`${label} tài khoản "${u.name}" thành công`, newStatus === 'active' ? 'success' : 'warning')
    } catch {
      addToast('Không thể cập nhật trạng thái tài khoản', 'error')
    }
  }

  const filtered = !search.trim()
    ? users
    : users.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )

  return (
    <div>
      <div className={s.usersToolbar}>
        <div className={s.userSearchWrap}>
          <span className={s.userSearchIcon}><Search size={13} /></span>
          <input
            type="text"
            placeholder="Tìm theo tên, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={s.userSearchInput}
          />
        </div>
        <button className={s.btnAddSmall} onClick={() => setShowCreate(true)}>
          <Plus size={13} /> Tạo tài khoản
        </button>
      </div>

      <div className={s.userTableWrap}>
        {loading ? (
          <div className={s.skeletonStack} style={{ padding: 16 }}>
            {[1, 2, 3].map((i) => <div key={i} className={s.skeletonLine} />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className={s.emptyState}>Không tìm thấy người dùng.</p>
        ) : (
          <table className={s.settingsTable}>
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Điện thoại · Chức vụ</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Đăng nhập cuối</th>
                <th>Tạo lúc</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const isLocked = u.lockedUntil && new Date(u.lockedUntil) > new Date()
                const statusCls = u.status === 'active' ? s.statusActive
                  : u.status === 'on_leave' ? s.statusOnLeave : s.statusResigned
                const statusLabel = u.status === 'active' ? 'Hoạt động'
                  : u.status === 'on_leave' ? 'Tạm dừng' : 'Đã nghỉ'
                return (
                  <tr key={u.id}>
                    <td>
                      <div className={s.userNameCell}>
                        <div className={`${s.userInitials} ${u.avatarUrl ? s.userInitialsPhoto : u.role === 'admin' ? s.userInitialsGold : ''}`}>
                          {u.avatarUrl
                            ? <img src={u.avatarUrl} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
                            : getInitials(u.name)}
                        </div>
                        <div>
                          <div className={s.userNameText}>{u.name}</div>
                          <div className={s.userEmailText}>{u.email}</div>
                          {u.mustChangePw && <span className={s.pillWarn}>Chưa đổi MK</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className={s.userSubCell}>
                        <span>{u.phone || '—'}</span>
                        <span>{u.jobTitle || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={u.role === 'admin' ? s.roleAdmin : s.roleStaff}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div>
                        <span className={statusCls}>{statusLabel}</span>
                        {isLocked && <div><span className={s.pillLock}>Bị khoá</span></div>}
                      </div>
                    </td>
                    <td className={s.muted} style={{ fontSize: 12 }}>{fmtDate(u.lastLoginAt)}</td>
                    <td className={s.muted} style={{ fontSize: 12 }}>{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className={s.userActionsCell}>
                        <button
                          className={s.iconBtn}
                          title="Chỉnh sửa thông tin"
                          onClick={() => setEditTarget(u)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className={s.iconBtn}
                          title="Đặt lại mật khẩu"
                          onClick={() => setResetTarget(u)}
                        >
                          <KeyRound size={13} />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            className={`${s.iconBtn} ${u.status === 'active' ? s.iconBtnSuspend : s.iconBtnActivate}`}
                            title={u.status === 'active' ? 'Tạm dừng tài khoản' : 'Kích hoạt tài khoản'}
                            onClick={() => handleStatusToggle(u)}
                          >
                            {u.status === 'active' ? <UserX size={13} /> : <UserCheck size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          currentUserId={currentUser?.id}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load() }}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
          onSaved={() => { setResetTarget(null); load() }}
        />
      )}
    </div>
  )
}

function CreateUserModal({ onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [form, setForm] = useState({
    name:     '',
    email:    '',
    password: '',
    phone:    '',
    jobTitle: '',
    role:     'staff',
  })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim())  { setError('Vui lòng nhập họ tên');   return }
    if (!form.email.trim()) { setError('Vui lòng nhập email');     return }
    if (!form.password)     { setError('Vui lòng nhập mật khẩu'); return }
    setSaving(true); setError(null)
    try {
      await createUser({
        name:     form.name.trim(),
        email:    form.email.trim().toLowerCase(),
        password: form.password,
        phone:    form.phone.trim()    || null,
        jobTitle: form.jobTitle.trim() || null,
        role:     form.role,
      })
      addToast(`Tạo tài khoản "${form.name.trim()}" thành công`, 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đã xảy ra lỗi')
      setSaving(false)
    }
  }

  return (
    <Modal title="Tạo tài khoản nhân viên" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Họ và tên *</label>
            <input type="text" value={form.name} onChange={set('name')} placeholder="Nguyễn Văn A" className={s.settingsInput} autoFocus />
          </div>
          <div>
            <label className={s.settingsLabel}>Email *</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="email@ketoan-taman.vn" className={s.settingsInput} />
          </div>
          <div>
            <label className={s.settingsLabel}>Số điện thoại</label>
            <input type="text" value={form.phone} onChange={set('phone')} placeholder="0901 234 567" className={s.settingsInput} />
          </div>
          <div>
            <label className={s.settingsLabel}>Chức vụ</label>
            <input type="text" value={form.jobTitle} onChange={set('jobTitle')} placeholder="Kế toán viên" className={s.settingsInput} />
          </div>
        </div>

        <div className={s.formDivider} />

        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Mật khẩu tạm *</label>
            <div className={s.pwInputWrap}>
              <input
                type={showPw ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                placeholder="≥ 8 ký tự, 1 hoa, 1 số, 1 ký tự đặc biệt"
                className={`${s.settingsInput} ${s.pwInputField}`}
              />
              <button type="button" className={s.pwToggleBtn} onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className={s.settingsLabel}>Vai trò</label>
            <select value={form.role} onChange={set('role')} className={`${s.settingsInput} ${s.settingsSelect}`}>
              <option value="staff">Staff — Nhân viên</option>
              <option value="admin">Admin — Quản trị viên</option>
            </select>
          </div>
        </div>

        <div className={s.confirmWarn} style={{ fontSize: 11, padding: '8px 12px' }}>
          Người dùng sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên.
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnSave}>
            {saving ? <Loader2 size={13} /> : <Plus size={13} />}
            Tạo tài khoản
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditUserModal({ user, currentUserId, onClose, onSaved }) {
  const isCurrentUser = user.id === currentUserId
  const patchAuthUser = useAuthStore((st) => st.patchUser)
  const addToast      = useToastStore((st) => st.toast)
  const [form, setForm]   = useState({
    name:      user.name,
    phone:     user.phone    || '',
    jobTitle:  user.jobTitle || '',
    role:      user.role,
    status:    user.status,
    avatarUrl: user.avatarUrl || null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Tên không được để trống'); return }
    setSaving(true); setError(null)
    try {
      const updated = await updateUser(user.id, {
        name:      form.name.trim(),
        phone:     form.phone.trim()    || null,
        jobTitle:  form.jobTitle.trim() || null,
        role:      form.role,
        avatarUrl: form.avatarUrl,
      })
      if (!isCurrentUser && form.status !== user.status) {
        await updateUserStatus(user.id, form.status)
      }
      if (isCurrentUser) {
        patchAuthUser({ name: updated.name, avatarUrl: updated.avatarUrl, role: updated.role })
      }
      addToast(`Cập nhật thông tin "${user.name}" thành công`, 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đã xảy ra lỗi')
      setSaving(false)
    }
  }

  return (
    <Modal title="Chỉnh sửa người dùng" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>

        {/* Banner: avatar upload + thông tin */}
        <div className={s.modalUserBanner}>
          <AvatarUpload
            value={form.avatarUrl}
            name={form.name || user.name}
            isAdmin={form.role === 'admin'}
            onChange={(url) => setForm((p) => ({ ...p, avatarUrl: url }))}
          />
          <div className={s.modalUserBannerInfo}>
            <div className={s.modalUserBannerName}>{form.name || user.name}</div>
            <div className={s.modalUserBannerEmail}>{user.email}</div>
            <div className={s.modalUserBannerEmail}>Tạo: {fmtDate(user.createdAt)} · Đăng nhập: {fmtDate(user.lastLoginAt)}</div>
          </div>
        </div>

        {error && <div className={s.errorBox}>{error}</div>}

        {/* Thông tin cơ bản — 2 cột */}
        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Họ và tên *</label>
            <input type="text" value={form.name} onChange={set('name')} className={s.settingsInput} />
          </div>
          <div>
            <label className={s.settingsLabel}>Số điện thoại</label>
            <input type="text" value={form.phone} onChange={set('phone')} placeholder="VD: 0901 234 567" className={s.settingsInput} />
          </div>
          <div>
            <label className={s.settingsLabel}>Chức vụ</label>
            <input type="text" value={form.jobTitle} onChange={set('jobTitle')} placeholder="VD: Kế toán trưởng" className={s.settingsInput} />
          </div>
          <div>
            <label className={s.settingsLabel}>Email</label>
            <input type="text" value={user.email} disabled className={s.settingsInput} style={{ opacity: 0.5, cursor: 'not-allowed' }} />
          </div>
        </div>

        {!isCurrentUser && (
          <>
            <div className={s.formDivider} />
            <div className={s.formGrid2}>
              <div>
                <label className={s.settingsLabel}>Vai trò</label>
                <select value={form.role} onChange={set('role')} className={`${s.settingsInput} ${s.settingsSelect}`}>
                  <option value="staff">Staff — Nhân viên</option>
                  <option value="admin">Admin — Quản trị viên</option>
                </select>
              </div>
              <div>
                <label className={s.settingsLabel}>Trạng thái tài khoản</label>
                <select value={form.status} onChange={set('status')} className={`${s.settingsInput} ${s.settingsSelect}`}>
                  <option value="active">Hoạt động</option>
                  <option value="on_leave">Tạm dừng</option>
                  <option value="resigned">Đã nghỉ việc</option>
                </select>
              </div>
            </div>
          </>
        )}

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnSave}>
            {saving && <Loader2 size={13} />}
            Lưu thay đổi
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose, onSaved }) {
  const addToast        = useToastStore((st) => st.toast)
  const [form, setForm] = useState({ newPassword: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.newPassword) { setError('Vui lòng nhập mật khẩu mới'); return }
    if (form.newPassword !== form.confirm) { setError('Mật khẩu xác nhận không khớp'); return }
    setSaving(true); setError(null)
    try {
      await resetUserPassword(user.id, form.newPassword)
      addToast(`Đặt lại mật khẩu cho "${user.name}" thành công`, 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Đã xảy ra lỗi')
      setSaving(false)
    }
  }

  return (
    <Modal title={`Đặt lại mật khẩu — ${user.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        <div className={s.confirmWarn}>
          Người dùng sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập tiếp theo.
        </div>

        {error && <div className={s.errorBox}>{error}</div>}

        <div>
          <label className={s.settingsLabel}>Mật khẩu mới</label>
          <div className={s.pwInputWrap}>
            <input
              type={showPw ? 'text' : 'password'}
              value={form.newPassword}
              onChange={(e) => setForm((p) => ({ ...p, newPassword: e.target.value }))}
              placeholder="≥ 8 ký tự, 1 hoa, 1 số, 1 ký tự đặc biệt"
              className={`${s.settingsInput} ${s.pwInputField}`}
            />
            <button type="button" className={s.pwToggleBtn} onClick={() => setShowPw((v) => !v)}>
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div>
          <label className={s.settingsLabel}>Xác nhận mật khẩu</label>
          <input
            type={showPw ? 'text' : 'password'}
            value={form.confirm}
            onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
            className={s.settingsInput}
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnSave}>
            {saving && <Loader2 size={13} />}
            Đặt lại mật khẩu
          </button>
        </div>
      </form>
    </Modal>
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

// ── Section: Scheduler ────────────────────────────────────────────────────────

function TemplatesSection() {
  const addToast = useToastStore((st) => st.toast)
  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const s = await getSchedulerStatus()
      setStatus(s)
      if (s.lastRunResult) setLastResult(s.lastRunResult)
    } catch {
      addToast('Không thể tải trạng thái bộ lập lịch', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRunNow() {
    setRunning(true)
    try {
      const result = await runSchedulerNow()
      setLastResult(result)
      addToast(`Đã chạy: tạo ${result.generated} task, bỏ qua ${result.skipped}`, 'success')
      load()
    } catch (err) {
      const httpStatus = err.response?.status
      if (httpStatus === 409) {
        addToast('Bộ lập lịch đang chạy, vui lòng thử lại sau', 'warning')
      } else {
        addToast(err.response?.data?.error?.message ?? 'Không thể chạy bộ lập lịch', 'error')
      }
    } finally {
      setRunning(false)
    }
  }

  function fmtDt(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  return (
    <div>
      <p className={s.sectionText}>
        Bộ lập lịch tự động tạo công việc từ các lịch định kỳ mỗi ngày lúc 05:00 (giờ Việt Nam).
        Bạn có thể kích hoạt thủ công bên dưới.
      </p>

      {loading ? (
        <div className={s.skeletonStack} style={{ padding: '0 0 16px' }}>
          {[1, 2, 3].map((i) => <div key={i} className={s.skeletonLine} />)}
        </div>
      ) : status && (
        <>
          <div className={s.schedulerStatusGrid}>
            <div className={s.schedulerStatusCard}>
              <div className={s.schedulerStatusLabel}>Trạng thái cron</div>
              <div className={s.schedulerStatusVal}>
                {status.active
                  ? <><CheckCircle size={14} style={{ color: '#22c55e' }} /> Đang hoạt động</>
                  : <><XCircle size={14} style={{ color: '#ef4444' }} /> Chưa khởi động</>
                }
              </div>
            </div>

            <div className={s.schedulerStatusCard}>
              <div className={s.schedulerStatusLabel}>Lần chạy cuối</div>
              <div className={s.schedulerStatusVal}>{fmtDt(status.lastRunAt)}</div>
            </div>

            <div className={s.schedulerStatusCard}>
              <div className={s.schedulerStatusLabel}>Trạng thái hiện tại</div>
              <div className={s.schedulerStatusVal}>
                {status.isRunning
                  ? <><Loader2 size={13} className={s.spin} style={{ color: '#0891b2' }} /> Đang chạy...</>
                  : 'Rảnh'
                }
              </div>
            </div>
          </div>

          {lastResult && !lastResult.error && (
            <div className={s.schedulerResult}>
              <div className={s.schedulerResultTitle}>Kết quả lần chạy cuối</div>
              <div className={s.schedulerResultGrid}>
                <div className={s.schedulerResultItem}>
                  <span className={s.schedulerResultNum} style={{ color: '#22c55e' }}>{lastResult.generated ?? 0}</span>
                  <span className={s.schedulerResultLbl}>Task tạo mới</span>
                </div>
                <div className={s.schedulerResultItem}>
                  <span className={s.schedulerResultNum} style={{ color: '#94a3b8' }}>{lastResult.skipped ?? 0}</span>
                  <span className={s.schedulerResultLbl}>Bỏ qua</span>
                </div>
                <div className={s.schedulerResultItem}>
                  <span className={s.schedulerResultNum} style={{ color: lastResult.errors > 0 ? '#ef4444' : '#94a3b8' }}>{lastResult.errors ?? 0}</span>
                  <span className={s.schedulerResultLbl}>Lỗi</span>
                </div>
                <div className={s.schedulerResultItem}>
                  <span className={s.schedulerResultNum} style={{ color: '#64748b' }}>{lastResult.durationMs ?? 0}ms</span>
                  <span className={s.schedulerResultLbl}>Thời gian</span>
                </div>
              </div>
            </div>
          )}

          {lastResult?.error && (
            <div className={s.schedulerError}>
              <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
              <span>Lỗi lần chạy cuối: {lastResult.error}</span>
            </div>
          )}

          <div className={s.formActions} style={{ marginTop: 20 }}>
            <button
              className={s.btnSave}
              onClick={handleRunNow}
              disabled={running || status.isRunning}
            >
              {running || status.isRunning
                ? <><Loader2 size={13} className={s.spin} /> Đang chạy...</>
                : <><Play size={13} /> Chạy ngay</>
              }
            </button>
            <button className={s.btnOutline} onClick={load} disabled={loading} style={{ height: 36 }}>
              <RotateCcw size={13} /> Làm mới
            </button>
          </div>
        </>
      )}
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
  const addToast  = useToastStore((st) => st.toast)
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
      addToast('Đã lưu cấu hình thành công', 'success')
    } catch {
      setStatus('err')
      addToast('Không thể lưu cấu hình', 'error')
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
