import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Briefcase, Calendar, Shield, Loader2,
  AlertTriangle, Edit2, Camera,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as usersApi from '../../api/users'
import s from './StaffDetail.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:   { label: 'Đang làm việc', cls: s.badgeActive },
  on_leave: { label: 'Nghỉ phép',     cls: s.badgeOnLeave },
  resigned: { label: 'Đã nghỉ việc',  cls: s.badgeResigned },
}

const ROLE_MAP = {
  admin: { label: 'Quản trị viên', cls: s.badgeAdmin },
  staff: { label: 'Nhân viên',     cls: s.badgeStaff },
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
}

function staffAvatarSrc(user) {
  if (user?.avatarUrl) return user.avatarUrl
  const encoded = encodeURIComponent(user?.name || '?')
  return `https://ui-avatars.com/api/?name=${encoded}&size=144&background=e2e8f0&color=64748b&bold=true&font-size=0.4`
}

const FALLBACK_AVATAR = `https://ui-avatars.com/api/?name=&size=144&background=e2e8f0&color=94a3b8`

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── StaffDetail ───────────────────────────────────────────────────────────────

export default function StaffDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const self      = useAuthStore((st) => st.user)
  const patchUser = useAuthStore((st) => st.patchUser)
  const addToast  = useToastStore((st) => st.toast)
  const isAdmin   = self?.role === 'admin'

  const [user, setUser]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    usersApi.getUser(id)
      .then((u) => { if (!cancelled) setUser(u) })
      .catch(() => { if (!cancelled) setError('Không tìm thấy nhân viên') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  async function handleStatusChange(status) {
    try {
      const updated = await usersApi.updateUserStatus(id, status)
      setUser(updated)
      addToast('Đã cập nhật trạng thái', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật', 'error')
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className={s.page}>
          <div className={s.centered}>
            <Loader2 size={24} className={s.spin} />
            Đang tải...
          </div>
        </div>
      </AppLayout>
    )
  }

  if (error || !user) {
    return (
      <AppLayout>
        <div className={s.page}>
          <div className={s.centered}>
            <AlertTriangle size={36} className={s.errorIcon} />
            <p>{error ?? 'Không tìm thấy nhân viên'}</p>
            <button className={s.btnSecondary} onClick={() => navigate('/staff')}>
              <ArrowLeft size={13} /> Quay lại
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  const statusInfo  = STATUS_MAP[user.status] ?? { label: user.status, cls: s.badgeResigned }
  const roleInfo    = ROLE_MAP[user.role]     ?? { label: user.role,   cls: s.badgeStaff }
  const isSelf      = self?.id === user.id
  // Cho phép chỉnh sửa nếu là admin hoặc đang xem profile chính mình
  const canEdit     = isAdmin || isSelf

  return (
    <AppLayout>
      <div className={s.page}>

        {/* Back */}
        <button className={s.backBtn} onClick={() => navigate(isAdmin ? '/staff' : '/dashboard')}>
          <ArrowLeft size={14} /> {isAdmin ? 'Danh sách nhân viên' : 'Trang chủ'}
        </button>

        {/* Profile card */}
        <div className={s.profileCard}>
          <img
            src={staffAvatarSrc(user)}
            alt={user.name}
            className={s.avatar}
            onError={(e) => { e.currentTarget.src = FALLBACK_AVATAR }}
          />

          <div className={s.profileInfo}>
            <h1 className={s.profileName}>{user.name}</h1>
            <p className={s.profileEmail}>{user.email}</p>

            <div className={s.profileBadges}>
              <span className={`${s.badge} ${roleInfo.cls}`}>{roleInfo.label}</span>
              <span className={`${s.badge} ${statusInfo.cls}`}>{statusInfo.label}</span>
            </div>

            <div className={s.profileMeta}>
              {user.jobTitle && (
                <span className={s.profileMetaItem}>
                  <Briefcase size={13} />
                  {user.jobTitle}
                </span>
              )}
              {user.phone && (
                <span className={s.profileMetaItem}>
                  <Phone size={13} />
                  {user.phone}
                </span>
              )}
              <span className={s.profileMetaItem}>
                <Calendar size={13} />
                Tạo ngày {fmtDate(user.createdAt)}
              </span>
              {user.lastLoginAt && (
                <span className={s.profileMetaItem}>
                  <Shield size={13} />
                  Đăng nhập lần cuối:{' '}
                  {new Date(user.lastLoginAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          {canEdit && (
            <div className={s.profileActions}>
              <button className={s.btnSecondary} onClick={() => setEditOpen(true)}>
                <Edit2 size={13} /> Chỉnh sửa
              </button>
              {isAdmin && user.status !== 'active' && (
                <button className={s.btnPrimary} onClick={() => handleStatusChange('active')}>
                  Kích hoạt lại
                </button>
              )}
              {isAdmin && user.status === 'active' && !isSelf && (
                <button
                  className={`${s.btnSecondary} ${s.btnWarning}`}
                  onClick={() => handleStatusChange('on_leave')}
                >
                  Đặt nghỉ phép
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info panels */}
        <div className={s.infoGrid}>
          <InfoSection
            title="Thông tin tài khoản"
            icon={<Shield size={15} />}
            rows={[
              ['Email', user.email],
              ['Vai trò', roleInfo.label],
              ['Trạng thái', statusInfo.label],
              ['Chức danh', user.jobTitle ?? '—'],
              ['Số điện thoại', user.phone ?? '—'],
              ['Ngày tạo', fmtDate(user.createdAt)],
              ['Cập nhật lần cuối', fmtDate(user.updatedAt)],
            ]}
          />
          <InfoSection
            title="Thông tin cá nhân"
            icon={<Shield size={15} />}
            rows={[
              ['Ngày sinh', fmtDate(user.dob)],
              ['Ngày vào làm', fmtDate(user.hireDate)],
              ['CMND / CCCD', user.idCard ?? '—'],
              ['Địa chỉ', user.address ?? '—'],
            ]}
          />
          <InfoSection
            title="Bảo mật"
            icon={<Shield size={15} />}
            rows={[
              ['Phải đổi mật khẩu', user.mustChangePw ? 'Có' : 'Không'],
              ['Đăng nhập lần cuối', user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString('vi-VN', { dateStyle: 'long', timeStyle: 'short' })
                : '—'],
              ['Khóa tài khoản đến', user.lockedUntil ? fmtDate(user.lockedUntil) : 'Không bị khóa'],
            ]}
          />
        </div>

        {/* CV sections */}
        {(user.education || user.experience) && (
          <div className={s.cvGrid}>
            {user.education && (
              <div className={s.cvSection}>
                <div className={s.cvSectionHead}>Bằng cấp / Chứng chỉ</div>
                <p className={s.cvText}>{user.education}</p>
              </div>
            )}
            {user.experience && (
              <div className={s.cvSection}>
                <div className={s.cvSectionHead}>Kinh nghiệm làm việc</div>
                <p className={s.cvText}>{user.experience}</p>
              </div>
            )}
          </div>
        )}

        {/* Edit modal */}
        {editOpen && (
          <EditUserModal
            user={user}
            isAdmin={isAdmin}
            onClose={() => setEditOpen(false)}
            onSaved={(u) => {
              setUser(u)
              if (self?.id === u.id) {
                patchUser({ name: u.name, avatarUrl: u.avatarUrl, role: u.role })
              }
              setEditOpen(false)
              addToast('Đã cập nhật thông tin', 'success')
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}

// ── InfoSection ───────────────────────────────────────────────────────────────

function AvatarUpload({ value, name, onChange }) {
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const size = 160
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        const cropSize = Math.min(img.width, img.height)
        const offsetX = (img.width - cropSize) / 2
        const offsetY = (img.height - cropSize) / 2

        ctx.drawImage(img, offsetX, offsetY, cropSize, cropSize, 0, 0, size, size)
        onChange(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className={s.avatarEditRow}>
      <button
        type="button"
        className={s.avatarUploadCircle}
        onClick={() => inputRef.current?.click()}
        title="Chọn ảnh đại diện"
      >
        {value ? (
          <img src={value} alt={name} className={s.avatarUploadImg} />
        ) : (
          <span className={s.avatarUploadInitials}>{getInitials(name)}</span>
        )}
        <span className={s.avatarUploadOverlay}><Camera size={16} /></span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={s.hiddenInput}
        onChange={handleFile}
      />

      <div className={s.avatarUploadMeta}>
        <div className={s.avatarUploadActions}>
          <button type="button" className={s.avatarUploadBtn} onClick={() => inputRef.current?.click()}>
            <Camera size={12} /> Chọn ảnh
          </button>
          {value && (
            <button type="button" className={s.avatarRemoveBtn} onClick={() => onChange(null)}>
              Xoá ảnh
            </button>
          )}
        </div>
        <p className={s.avatarHelp}>Ảnh sẽ được cắt vuông và lưu cùng hồ sơ nhân viên.</p>
      </div>
    </div>
  )
}

function InfoSection({ title, icon, rows }) {
  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        {icon}
        <h3 className={s.sectionTitle}>{title}</h3>
      </div>
      <table className={s.table}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className={s.tableLabelCell}>{label}</td>
              <td>{value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── EditUserModal ─────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose, onSaved, isAdmin }) {
  const [form, setForm] = useState({
    name:       user.name       ?? '',
    role:       user.role       ?? 'staff',
    phone:      user.phone      ?? '',
    jobTitle:   user.jobTitle   ?? '',
    dob:        user.dob        ? user.dob.slice(0, 10) : '',
    hireDate:   user.hireDate   ? user.hireDate.slice(0, 10) : '',
    idCard:     user.idCard     ?? '',
    address:    user.address    ?? '',
    education:  user.education  ?? '',
    experience: user.experience ?? '',
    avatarUrl:  user.avatarUrl  ?? null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body = {}
      const strFields = ['name', 'role', 'phone', 'jobTitle', 'idCard', 'address', 'education', 'experience']
      const dateFields = ['dob', 'hireDate']
      strFields.forEach((f) => {
        if (form[f] !== (user[f] ?? '')) body[f] = form[f] || null
      })
      dateFields.forEach((f) => {
        const cur = user[f] ? user[f].slice(0, 10) : ''
        if (form[f] !== cur) body[f] = form[f] || null
      })
      if ((form.avatarUrl ?? null) !== (user.avatarUrl ?? null)) {
        body.avatarUrl = form.avatarUrl || null
      }
      const saved = await usersApi.updateUser(user.id, body)
      onSaved(saved)
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Chỉnh sửa thông tin nhân viên" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formSectionLabel}>Thông tin cơ bản</div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ảnh đại diện</label>
          <AvatarUpload
            value={form.avatarUrl}
            name={form.name || user.name}
            onChange={(url) => setForm((p) => ({ ...p, avatarUrl: url }))}
          />
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Họ và tên</label>
          <input type="text" value={form.name} onChange={set('name')} required className={s.formInput} />
        </div>
        <div className={s.formGrid}>
          {isAdmin && (
            <div className={s.formGroup}>
              <label className={s.formLabel}>Vai trò</label>
              <select value={form.role} onChange={set('role')} className={s.formSelect}>
                <option value="staff">Nhân viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>
          )}
          <div className={s.formGroup}>
            <label className={s.formLabel}>Chức danh</label>
            <input type="text" value={form.jobTitle} onChange={set('jobTitle')}
              placeholder="Kế toán viên" className={s.formInput} />
          </div>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Số điện thoại</label>
          <input type="tel" value={form.phone} onChange={set('phone')}
            placeholder="0909 123 456" className={s.formInput} />
        </div>

        <div className={s.formSectionLabel}>Thông tin cá nhân</div>

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ngày sinh</label>
            <input type="date" value={form.dob} onChange={set('dob')} className={s.formInput} />
          </div>
          {isAdmin && (
            <div className={s.formGroup}>
              <label className={s.formLabel}>Ngày vào làm</label>
              <input type="date" value={form.hireDate} onChange={set('hireDate')} className={s.formInput} />
            </div>
          )}
        </div>
        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>CMND / CCCD</label>
            <input type="text" value={form.idCard} onChange={set('idCard')}
              placeholder="012345678901" maxLength={20} className={s.formInput} />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Địa chỉ</label>
            <input type="text" value={form.address} onChange={set('address')}
              placeholder="123 Nguyễn Văn Cừ, Q.5, TP.HCM" className={s.formInput} />
          </div>
        </div>

        <div className={s.formSectionLabel}>Hồ sơ & Kinh nghiệm</div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Bằng cấp / Chứng chỉ</label>
          <textarea value={form.education} onChange={set('education')} className={s.formTextarea}
            placeholder="VD: Cử nhân Kế toán - ĐH Kinh tế TP.HCM (2018), CPA (2021)..."
            rows={3} />
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Kinh nghiệm làm việc</label>
          <textarea value={form.experience} onChange={set('experience')} className={s.formTextarea}
            placeholder="VD: 3 năm kế toán tổng hợp tại Công ty ABC..."
            rows={3} />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} disabled={loading} className={s.btnSecondary}>Hủy</button>
          <button type="submit" disabled={loading} className={s.btnPrimary}>
            {loading ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
