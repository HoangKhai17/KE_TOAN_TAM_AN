import { useState, useEffect, useRef } from 'react'
import { Plus, Search, MoreVertical, ChevronLeft, ChevronRight } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import * as usersApi from '../../api/users'

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_MAP = {
  active:   { label: 'Đang làm việc', cls: 'bg-green-100 text-green-700' },
  on_leave: { label: 'Nghỉ phép',     cls: 'bg-yellow-100 text-yellow-700' },
  resigned: { label: 'Đã nghỉ việc',  cls: 'bg-gray-100 text-gray-500' },
}

const ROLE_MAP = {
  admin: { label: 'Quản trị viên', cls: 'bg-blue-100 text-blue-700' },
  staff: { label: 'Nhân viên',     cls: 'bg-purple-100 text-purple-700' },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Staff() {
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.role === 'admin'

  const [users, setUsers]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  const [searchInput, setSearchInput]       = useState('')
  const [search, setSearch]                 = useState('')
  const [roleFilter, setRoleFilter]         = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [page, setPage]                     = useState(1)

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
    } catch (err) {
      alert(err.response?.data?.error?.message ?? 'Không thể cập nhật trạng thái')
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Xóa nhân viên "${user.name}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await usersApi.deleteUser(user.id)
      setUsers((prev) => prev.filter((u) => u.id !== user.id))
      setPagination((p) => ({ ...p, total: p.total - 1 }))
    } catch (err) {
      alert(err.response?.data?.error?.message ?? 'Không thể xóa nhân viên')
    }
  }

  return (
    <AppLayout title="Nhân viên">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Quản lý nhân viên</h2>
          <p className="text-sm text-gray-500">
            {loading ? '...' : `${pagination.total} nhân viên`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0f345e] text-white rounded-lg text-sm font-medium hover:bg-[#0a2544] transition-colors"
          >
            <Plus size={16} />
            Thêm nhân viên
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm theo tên, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] bg-white"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e]"
        >
          <option value="">Tất cả vai trò</option>
          <option value="admin">Quản trị viên</option>
          <option value="staff">Nhân viên</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e]"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="active">Đang làm việc</option>
          <option value="on_leave">Nghỉ phép</option>
          <option value="resigned">Đã nghỉ việc</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        {error ? (
          <p className="p-8 text-center text-sm text-red-500">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nhân viên</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Chức danh</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Vai trò</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Đăng nhập gần nhất</th>
                  {isAdmin && <th className="w-12 px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} hasActions={isAdmin} />)
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-5 py-10 text-center text-sm text-gray-400">
                      Không tìm thấy nhân viên nào
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isAdmin={isAdmin}
                      isSelf={user.id === currentUser?.id}
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
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">
            Trang {pagination.page}/{pagination.totalPages} — {pagination.total} nhân viên
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <UserFormModal
          onClose={() => setShowCreateModal(false)}
          onSaved={(u) => {
            setShowCreateModal(false)
            setUsers((prev) => [u, ...prev])
            setPagination((p) => ({ ...p, total: p.total + 1 }))
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
          }}
        />
      )}
    </AppLayout>
  )
}

// ── UserRow ────────────────────────────────────────────────────────────────────

function UserRow({ user, isAdmin, isSelf, onEdit, onStatusChange, onDelete }) {
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

  const initials = user.name
    ? user.name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
    : '?'

  const statusInfo = STATUS_MAP[user.status] ?? { label: user.status, cls: 'bg-gray-100 text-gray-500' }
  const roleInfo   = ROLE_MAP[user.role]     ?? { label: user.role,   cls: 'bg-gray-100 text-gray-500' }

  return (
    <tr className="hover:bg-gray-50/70 transition-colors">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#0f345e]/10 text-[#0f345e] flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-800 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 text-gray-500 text-sm hidden md:table-cell">
        {user.jobTitle ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleInfo.cls}`}>
          {roleInfo.label}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
          {statusInfo.label}
        </span>
      </td>
      <td className="px-5 py-3.5 text-gray-400 text-xs hidden lg:table-cell">
        {user.lastLoginAt
          ? new Date(user.lastLoginAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
          : '—'}
      </td>
      {isAdmin && (
        <td className="px-3 py-3.5" ref={menuRef}>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-10">
                <button
                  onClick={() => { setMenuOpen(false); onEdit() }}
                  className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Chỉnh sửa thông tin
                </button>
                {user.status !== 'active' && (
                  <button
                    onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'active') }}
                    className="flex w-full items-center px-4 py-2 text-sm text-green-600 hover:bg-green-50"
                  >
                    Kích hoạt lại
                  </button>
                )}
                {user.status !== 'on_leave' && (
                  <button
                    onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'on_leave') }}
                    className="flex w-full items-center px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
                  >
                    Đặt trạng thái nghỉ phép
                  </button>
                )}
                {user.status !== 'resigned' && (
                  <button
                    onClick={() => { setMenuOpen(false); onStatusChange(user.id, 'resigned') }}
                    className="flex w-full items-center px-4 py-2 text-sm text-orange-600 hover:bg-orange-50"
                  >
                    Đánh dấu nghỉ việc
                  </button>
                )}
                {!isSelf && (
                  <>
                    <div className="my-1 border-t border-gray-100" />
                    <button
                      onClick={() => { setMenuOpen(false); onDelete(user) }}
                      className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Xóa nhân viên
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow({ hasActions }) {
  return (
    <tr className="animate-pulse">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-32 bg-gray-200 rounded" />
            <div className="h-2.5 w-24 bg-gray-100 rounded" />
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5 hidden md:table-cell"><div className="h-3 w-24 bg-gray-200 rounded" /></td>
      <td className="px-5 py-3.5"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
      <td className="px-5 py-3.5"><div className="h-5 w-20 bg-gray-200 rounded-full" /></td>
      <td className="px-5 py-3.5 hidden lg:table-cell"><div className="h-3 w-28 bg-gray-100 rounded" /></td>
      {hasActions && <td className="px-3 py-3.5"><div className="w-6 h-6 bg-gray-100 rounded" /></td>}
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

  const inputCls = (field) =>
    `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] ${fieldErrors[field] ? 'border-red-400' : 'border-gray-200'}`

  return (
    <Modal title={isEdit ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{error}</div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Họ và tên <span className="text-red-500">*</span>
          </label>
          <input type="text" value={form.name} onChange={set('name')} required className={inputCls('name')} placeholder="Nguyễn Văn A" />
          {fieldErrors.name && <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            disabled={isEdit}
            className={`${inputCls('email')} ${isEdit ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
            placeholder="nhanvien@email.com"
          />
          {fieldErrors.email && <p className="mt-1 text-xs text-red-500">{fieldErrors.email}</p>}
        </div>

        {!isEdit && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Mật khẩu <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={set('password')}
                required
                className={`${inputCls('password')} pr-10`}
                placeholder="Tối thiểu 8 ký tự"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {fieldErrors.password && <p className="mt-1 text-xs text-red-500">{fieldErrors.password}</p>}
            <p className="mt-1 text-xs text-gray-400">Cần có chữ hoa, số, ký tự đặc biệt. Nhân viên bắt buộc đổi khi đăng nhập lần đầu.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Vai trò</label>
            <select
              value={form.role}
              onChange={set('role')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0f345e]/20 focus:border-[#0f345e] bg-white"
            >
              <option value="staff">Nhân viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Chức danh</label>
            <input type="text" value={form.jobTitle} onChange={set('jobTitle')} className={inputCls('jobTitle')} placeholder="Kế toán viên" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Số điện thoại</label>
          <input type="tel" value={form.phone} onChange={set('phone')} className={inputCls('phone')} placeholder="0909 123 456" />
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 text-sm font-semibold bg-[#0f345e] text-white rounded-lg hover:bg-[#0a2544] disabled:opacity-60 transition-colors"
          >
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm nhân viên'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
