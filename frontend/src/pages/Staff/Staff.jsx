import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MoreVertical, ChevronLeft, ChevronRight, Users, Loader2 } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as usersApi from '../../api/users'
import s from './Staff.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:   { label: 'Đang làm việc', cls: s.badgeActive },
  on_leave: { label: 'Nghỉ phép',     cls: s.badgeOnLeave },
  resigned: { label: 'Đã nghỉ việc',  cls: s.badgeResigned },
}

const ROLE_MAP = {
  admin: { label: 'Quản trị viên', cls: s.badgeAdmin },
  staff: { label: 'Nhân viên',     cls: s.badgeStaff },
}

function staffAvatarSrc(user) {
  if (user?.avatarUrl) return user.avatarUrl
  const encoded = encodeURIComponent(user?.name || '?')
  return `https://ui-avatars.com/api/?name=${encoded}&size=56&background=e2e8f0&color=64748b&bold=true&font-size=0.4`
}

const FALLBACK_AVATAR = `https://ui-avatars.com/api/?name=&size=56&background=e2e8f0&color=94a3b8`

// ── Main component ─────────────────────────────────────────────────────────────

export default function Staff() {
  const navigate    = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'

  const [users, setUsers]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser, setEditUser]               = useState(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page when filter changes
  useEffect(() => { setPage(1) }, [roleFilter, statusFilter])

  // Fetch users
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    usersApi
      .listUsers({
        page,
        limit: 20,
        role:   roleFilter   || undefined,
        status: statusFilter || undefined,
        search: search       || undefined,
      })
      .then(({ users: u, pagination: p }) => {
        if (!cancelled) { setUsers(u); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setError('Không thể tải danh sách nhân viên') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, roleFilter, statusFilter, search])

  async function handleStatusChange(userId, status) {
    try {
      const updated = await usersApi.updateUserStatus(userId, status)
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
      addToast('Đã cập nhật trạng thái', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật trạng thái', 'error')
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Xóa nhân viên "${user.name}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await usersApi.deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setPagination((p) => ({ ...p, total: p.total - 1 }))
      addToast(`Đã xóa nhân viên ${user.name}`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xóa nhân viên', 'error')
    }
  }

  return (
    <AppLayout title="Nhân viên">
      <div className={s.page}>

        {/* Header */}
        <div className={s.pageHeader}>
          <div>
            <h2 className={s.pageTitle}>Quản lý nhân viên</h2>
            <p className={s.pageSubtitle}>
              {loading ? '...' : `${pagination.total} nhân viên`}
            </p>
          </div>
          {isAdmin && (
            <button className={s.btnPrimary} onClick={() => setShowCreateModal(true)}>
              <Plus size={14} /> Thêm nhân viên
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className={s.filterBar}>
          <div className={s.searchWrap}>
            <Search size={14} className={s.searchIcon} />
            <input
              type="text"
              placeholder="Tìm theo tên, email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className={s.searchInput}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={s.filterSelect}
          >
            <option value="">Tất cả vai trò</option>
            <option value="admin">Quản trị viên</option>
            <option value="staff">Nhân viên</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={s.filterSelect}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang làm việc</option>
            <option value="on_leave">Nghỉ phép</option>
            <option value="resigned">Đã nghỉ việc</option>
          </select>
        </div>

        {/* Table */}
        <div className={s.card}>
          {error ? (
            <div className={`${s.loadingBox} ${s.loadingError}`}>{error}</div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th className={s.hideMd}>Chức danh</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th className={s.hideLg}>Đăng nhập gần nhất</th>
                    {isAdmin && <th className={s.actionHead} />}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonRow key={i} hasActions={isAdmin} />
                    ))
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5}>
                        <div className={s.emptyState}>
                          <Users size={32} className={s.emptyIcon} />
                          Không tìm thấy nhân viên nào
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <UserRow
                        key={user.id}
                        user={user}
                        isAdmin={isAdmin}
                        isSelf={user.id === currentUser?.id}
                        onRowClick={() => navigate(`/staff/${user.id}`)}
                        onEdit={() => setEditUser(user)}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className={s.paginationBar}>
              <span className={s.paginationInfo}>
                Trang {pagination.page}/{pagination.totalPages} — {pagination.total} nhân viên
              </span>
              <div className={s.paginationBtns}>
                <button
                  className={s.paginationBtn}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  className={s.paginationBtn}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        {showCreateModal && (
          <UserFormModal
            onClose={() => setShowCreateModal(false)}
            onSaved={(u) => {
              setShowCreateModal(false)
              setUsers((prev) => [u, ...prev])
              setPagination((p) => ({ ...p, total: p.total + 1 }))
              addToast(`Đã thêm nhân viên ${u.name}`, 'success')
            }}
          />
        )}
        {editUser && (
          <UserFormModal
            user={editUser}
            onClose={() => setEditUser(null)}
            onSaved={(u) => {
              setEditUser(null)
              setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)))
              addToast('Đã cập nhật thông tin nhân viên', 'success')
            }}
          />
        )}
      </div>
    </AppLayout>
  )
}

// ── UserRow ────────────────────────────────────────────────────────────────────

function UserRow({ user, isAdmin, isSelf, onRowClick, onEdit, onStatusChange, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const statusInfo = STATUS_MAP[user.status] ?? { label: user.status, cls: s.badgeResigned }
  const roleInfo   = ROLE_MAP[user.role]     ?? { label: user.role,   cls: s.badgeStaff }

  return (
    <tr className={s.tableRow} onClick={onRowClick}>
      <td>
        <div className={s.userCell}>
          <img
            src={staffAvatarSrc(user)}
            alt={user.name}
            className={s.avatar}
            onError={(e) => { e.currentTarget.src = FALLBACK_AVATAR }}
          />
          <div>
            <div className={s.userName}>{user.name}</div>
            <div className={s.userEmail}>{user.email}</div>
          </div>
        </div>
      </td>
      <td className={`${s.hideMd} ${s.textMuted}`}>
        {user.jobTitle ?? <span className={s.textSubtle}>—</span>}
      </td>
      <td>
        <span className={`${s.badge} ${roleInfo.cls}`}>{roleInfo.label}</span>
      </td>
      <td>
        <span className={`${s.badge} ${statusInfo.cls}`}>{statusInfo.label}</span>
      </td>
      <td className={`${s.hideLg} ${s.lastLoginCell}`}>
        {user.lastLoginAt
          ? new Date(user.lastLoginAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
          : '—'}
      </td>
      {isAdmin && (
        <td className={s.menuCell} ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <button
            className={s.menuBtn}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className={s.dropdown}>
              <button
                className={s.dropdownItem}
                onClick={() => { setMenuOpen(false); onEdit() }}
              >
                Chỉnh sửa thông tin
              </button>
              {user.status !== 'active' && (
                <button
                  className={`${s.dropdownItem} ${s.dropdownSuccess}`}
                  onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'active') }}
                >
                  Kích hoạt lại
                </button>
              )}
              {user.status !== 'on_leave' && (
                <button
                  className={`${s.dropdownItem} ${s.dropdownWarning}`}
                  onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'on_leave') }}
                >
                  Đặt trạng thái nghỉ phép
                </button>
              )}
              {user.status !== 'resigned' && (
                <button
                  className={`${s.dropdownItem} ${s.dropdownWarning}`}
                  onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'resigned') }}
                >
                  Đánh dấu nghỉ việc
                </button>
              )}
              {!isSelf && (
                <>
                  <div className={s.dropdownDivider} />
                  <button
                    className={`${s.dropdownItem} ${s.dropdownDanger}`}
                    onClick={() => { setMenuOpen(false); onDelete(user) }}
                  >
                    Xóa nhân viên
                  </button>
                </>
              )}
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow({ hasActions }) {
  return (
    <tr>
      <td>
        <div className={s.userCell}>
          <div className={`${s.skeleton} ${s.skeletonAvatar}`} />
          <div>
            <div className={`${s.skeleton} ${s.skeletonName}`} />
            <div className={`${s.skeleton} ${s.skeletonEmail}`} />
          </div>
        </div>
      </td>
      <td className={s.hideMd}><div className={`${s.skeleton} ${s.skeletonJob}`} /></td>
      <td><div className={`${s.skeleton} ${s.skeletonRole}`} /></td>
      <td><div className={`${s.skeleton} ${s.skeletonStatus}`} /></td>
      <td className={s.hideLg}><div className={`${s.skeleton} ${s.skeletonLogin}`} /></td>
      {hasActions && <td><div className={`${s.skeleton} ${s.skeletonAction}`} /></td>}
    </tr>
  )
}

// ── UserFormModal ──────────────────────────────────────────────────────────────

function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = !!user
  const [form, setForm] = useState({
    name:     user?.name     ?? '',
    email:    user?.email    ?? '',
    password: '',
    role:     user?.role     ?? 'staff',
    phone:    user?.phone    ?? '',
    jobTitle: user?.jobTitle ?? '',
  })
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [fieldErrors, setFE]      = useState({})
  const [showPassword, setShowPw] = useState(false)

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setFE({})
    setLoading(true)
    try {
      let saved
      if (isEdit) {
        const body = {}
        if (form.name !== user.name)                     body.name     = form.name
        if (form.role !== user.role)                     body.role     = form.role
        if (form.phone    !== (user.phone    ?? ''))     body.phone    = form.phone    || null
        if (form.jobTitle !== (user.jobTitle ?? ''))     body.jobTitle = form.jobTitle || null
        saved = await usersApi.updateUser(user.id, body)
      } else {
        saved = await usersApi.createUser({
          name:     form.name,
          email:    form.email,
          password: form.password,
          role:     form.role,
          phone:    form.phone    || null,
          jobTitle: form.jobTitle || null,
        })
      }
      onSaved(saved)
    } catch (err) {
      const errData = err.response?.data?.error
      if (err.response?.status === 422 && errData?.details) {
        const fe = {}
        for (const d of errData.details) fe[d.field] = d.message
        setFE(fe)
      } else {
        setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Họ và tên</label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            required
            className={`${s.formInput} ${fieldErrors.name ? s.inputError : ''}`}
            placeholder="Nguyễn Văn A"
          />
          {fieldErrors.name && <p className={s.fieldError}>{fieldErrors.name}</p>}
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            disabled={isEdit}
            className={`${s.formInput} ${fieldErrors.email ? s.inputError : ''}`}
            placeholder="nhanvien@email.com"
          />
          {fieldErrors.email && <p className={s.fieldError}>{fieldErrors.email}</p>}
        </div>

        {!isEdit && (
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Mật khẩu</label>
            <div className={s.pwWrap}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                required
                placeholder="Tối thiểu 8 ký tự"
                className={`${s.formInput} ${s.passwordInput} ${fieldErrors.password ? s.inputError : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className={s.pwToggle}
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {fieldErrors.password && <p className={s.fieldError}>{fieldErrors.password}</p>}
            <p className={s.fieldHint}>Cần chữ hoa, số, ký tự đặc biệt. Nhân viên bắt buộc đổi khi đăng nhập lần đầu.</p>
          </div>
        )}

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Vai trò</label>
            <select value={form.role} onChange={set('role')} className={s.formSelect}>
              <option value="staff">Nhân viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Chức danh</label>
            <input type="text" value={form.jobTitle} onChange={set('jobTitle')} className={s.formInput} placeholder="Kế toán viên" />
          </div>
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Số điện thoại</label>
          <input type="tel" value={form.phone} onChange={set('phone')} className={s.formInput} placeholder="0909 123 456" />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={loading}>Hủy</button>
          <button type="submit" className={s.btnPrimary} disabled={loading}>
            {loading && <Loader2 size={13} className={s.spin} />}
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm nhân viên'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
