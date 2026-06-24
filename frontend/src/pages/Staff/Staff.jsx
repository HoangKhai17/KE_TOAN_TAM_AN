import { useState, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { invalidateRefStaff } from '../../hooks/useReferenceData'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, ChevronLeft, ChevronRight, Users, Loader2,
  Edit2, Trash2, UserCheck, UserMinus, UserX, FileDown,
} from 'lucide-react'
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
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = currentUser?.role === 'admin'

  // Danh sách nhân viên — local mirror, sync từ React Query (giữ optimistic update)
  const [users, setUsers]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editUser, setEditUser]               = useState(null)
  const [showExport, setShowExport]           = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page when filter changes
  useEffect(() => { setPage(1) }, [roleFilter, statusFilter])

  // ── Staff list — React Query (cache theo trang/bộ lọc + dedup + giữ data cũ khi đổi trang) ──
  const listParams = useMemo(() => ({
    page,
    limit: 20,
    role:   roleFilter   || undefined,
    status: statusFilter || undefined,
    search: search       || undefined,
  }), [page, roleFilter, statusFilter, search])

  const listQuery = useQuery({
    queryKey: ['staff', 'list', listParams],
    queryFn: () => usersApi.listUsers(listParams),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const loading = listQuery.isFetching
  const error = listQuery.isError ? 'Không thể tải danh sách nhân viên' : null

  // Sync kết quả query → local state (để optimistic update qua setUsers vẫn hoạt động)
  useEffect(() => {
    if (!listQuery.data) return
    setUsers(listQuery.data.users)
    setPagination(listQuery.data.pagination)
  }, [listQuery.data])

  async function handleStatusChange(userId, status) {
    try {
      const updated = await usersApi.updateUserStatus(userId, status)
      invalidateRefStaff(queryClient)   // đổi active/inactive → refresh dropdown nhân viên
      queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
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
      invalidateRefStaff(queryClient)
      queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={s.btnSecondary} onClick={() => setShowExport(true)}>
                <FileDown size={14} /> Xuất Excel
              </button>
              <button className={s.btnPrimary} onClick={() => setShowCreateModal(true)}>
                <Plus size={14} /> Thêm nhân viên
              </button>
            </div>
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
                    {isAdmin && <th className={s.actionHead}>Hành động</th>}
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

        {/* Export modal */}
        {showExport && (
          <StaffExportModal
            filters={{ role: roleFilter || undefined, status: statusFilter || undefined, search: search || undefined }}
            total={pagination.total}
            onClose={() => setShowExport(false)}
          />
        )}

        {/* Modals */}
        {showCreateModal && (
          <UserFormModal
            onClose={() => setShowCreateModal(false)}
            onSaved={(u) => {
              setShowCreateModal(false)
              invalidateRefStaff(queryClient)   // nhân viên mới hiển thị ngay ở dropdown
              queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
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
              invalidateRefStaff(queryClient)   // tên/role đổi → refresh dropdown
              queryClient.invalidateQueries({ queryKey: ['staff', 'list'] })
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
        <td className={s.actionCell} onClick={(e) => e.stopPropagation()}>
          <div className={s.actionBtns}>
            {/* Chỉnh sửa – luôn hiển thị */}
            <button
              className={`${s.actionBtn} ${s.actionBtnEdit}`}
              title="Chỉnh sửa thông tin"
              onClick={onEdit}
            >
              <Edit2 size={14} />
            </button>

            {/* Kích hoạt lại – chỉ khi không active */}
            {user.status !== 'active' && (
              <button
                className={`${s.actionBtn} ${s.actionBtnSuccess}`}
                title="Kích hoạt lại"
                onClick={() => onStatusChange(user.id, 'active')}
              >
                <UserCheck size={14} />
              </button>
            )}


            {/* Đánh dấu nghỉ việc – khi chưa resigned */}
            {user.status !== 'resigned' && (
              <button
                className={`${s.actionBtn} ${s.actionBtnOrange}`}
                title="Đánh dấu nghỉ việc"
                onClick={() => onStatusChange(user.id, 'resigned')}
              >
                <UserX size={14} />
              </button>
            )}

            {/* Xóa – chỉ khi không phải chính mình */}
            {!isSelf && (
              <button
                className={`${s.actionBtn} ${s.actionBtnDanger}`}
                title="Xóa nhân viên"
                onClick={() => onDelete(user)}
              >
                <Trash2 size={14} />
              </button>
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
      {hasActions && <td className={s.actionCell}><div className={`${s.skeleton} ${s.skeletonAction}`} /></td>}
    </tr>
  )
}

// ── StaffExportModal ───────────────────────────────────────────────────────────

const EXPORT_GROUPS = [
  {
    key: 'basic',
    label: 'Thông tin cơ bản',
    fields: [
      { key: 'name',     label: 'Họ và tên' },
      { key: 'email',    label: 'Email' },
      { key: 'role',     label: 'Vai trò' },
      { key: 'status',   label: 'Trạng thái' },
      { key: 'phone',    label: 'Số điện thoại' },
      { key: 'jobTitle', label: 'Chức danh' },
    ],
  },
  {
    key: 'personal',
    label: 'Thông tin cá nhân',
    fields: [
      { key: 'dob',      label: 'Ngày sinh' },
      { key: 'hireDate', label: 'Ngày vào làm' },
      { key: 'idCard',   label: 'CMND/CCCD' },
      { key: 'address',  label: 'Địa chỉ' },
    ],
  },
  {
    key: 'profile',
    label: 'Hồ sơ & Kinh nghiệm',
    fields: [
      { key: 'education',  label: 'Bằng cấp/Chứng chỉ' },
      { key: 'experience', label: 'Kinh nghiệm' },
    ],
  },
  {
    key: 'system',
    label: 'Hệ thống',
    fields: [
      { key: 'lastLoginAt', label: 'Đăng nhập gần nhất' },
      { key: 'createdAt',   label: 'Ngày tạo' },
    ],
  },
]

const ALL_FIELD_KEYS = EXPORT_GROUPS.flatMap((g) => g.fields.map((f) => f.key))

function StaffExportModal({ filters, total, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const [selected, setSelected] = useState(new Set(ALL_FIELD_KEYS))
  const [preview, setPreview]   = useState([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    usersApi
      .listUsers({ ...filters, page: 1, limit: 8 })
      .then(({ users }) => setPreview(users))
      .catch(() => {})
  }, [])

  function isGroupAll(group) {
    return group.fields.every((f) => selected.has(f.key))
  }
  function toggleGroup(group) {
    const allOn = isGroupAll(group)
    setSelected((prev) => {
      const next = new Set(prev)
      group.fields.forEach((f) => (allOn ? next.delete(f.key) : next.add(f.key)))
      return next
    })
  }
  function toggleField(key) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  async function handleExport() {
    if (selected.size === 0) { addToast('Vui lòng chọn ít nhất một trường', 'error'); return }
    setExporting(true)
    try {
      const blob = await usersApi.exportStaffExcel({
        ...filters,
        fields: [...selected].join(','),
      })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `nhan-vien-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch {
      addToast('Xuất Excel thất bại', 'error')
    } finally {
      setExporting(false)
    }
  }

  const previewFields = EXPORT_GROUPS.flatMap((g) => g.fields).filter((f) => selected.has(f.key))

  return (
    <Modal title="Xuất Excel — Nhân viên" onClose={onClose} wide>
      <div className={s.exportModalBody}>
        {/* Sidebar: field selection */}
        <div className={s.exportSidebar}>
          <div className={s.exportSidebarTitle}>Chọn trường xuất</div>
          {EXPORT_GROUPS.map((group) => (
            <div key={group.key} className={s.exportGroup}>
              <label className={s.exportGroupLabel}>
                <input
                  type="checkbox"
                  checked={isGroupAll(group)}
                  onChange={() => toggleGroup(group)}
                />
                <span>{group.label}</span>
              </label>
              {group.fields.map((f) => (
                <label key={f.key} className={s.exportFieldItem}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.key)}
                    onChange={() => toggleField(f.key)}
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        {/* Preview pane */}
        <div className={s.exportPreviewPane}>
          <div className={s.exportPreviewTitle}>Xem trước ({Math.min(8, total)} / {total} nhân viên)</div>
          <div className={s.exportPreviewWrap}>
            {previewFields.length === 0 ? (
              <div className={s.exportPreviewEmpty}>Chưa chọn trường nào</div>
            ) : (
              <table className={s.exportPreviewTable}>
                <thead>
                  <tr>
                    {previewFields.map((f) => <th key={f.key}>{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((user) => (
                    <tr key={user.id}>
                      {previewFields.map((f) => (
                        <td key={f.key}>{formatPreviewCell(user, f.key)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={s.exportFooter}>
        <span className={s.exportCount}>
          {selected.size} trường · {total} nhân viên
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnSecondary} onClick={onClose} disabled={exporting}>Hủy</button>
          <button className={s.btnPrimary} onClick={handleExport} disabled={exporting || selected.size === 0}>
            {exporting ? <><Loader2 size={13} className={s.spin} /> Đang xuất...</> : <><FileDown size={13} /> Xuất Excel</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function formatPreviewCell(user, key) {
  switch (key) {
    case 'role':        return user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'
    case 'status':      return user.status === 'active' ? 'Đang làm việc' : user.status === 'resigned' ? 'Đã nghỉ việc' : user.status
    case 'dob':
    case 'hireDate':    return user[key] ? new Date(user[key]).toLocaleDateString('vi-VN') : '—'
    case 'lastLoginAt':
    case 'createdAt':   return user[key] ? new Date(user[key]).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'
    default:            return user[key] ?? '—'
  }
}

// ── UserFormModal ──────────────────────────────────────────────────────────────

function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = !!user
  const [form, setForm] = useState({
    name:       user?.name       ?? '',
    email:      user?.email      ?? '',
    password:   '',
    role:       user?.role       ?? 'staff',
    phone:      user?.phone      ?? '',
    jobTitle:   user?.jobTitle   ?? '',
    dob:        user?.dob        ? user.dob.slice(0, 10) : '',
    hireDate:   user?.hireDate   ? user.hireDate.slice(0, 10) : '',
    idCard:     user?.idCard     ?? '',
    address:    user?.address    ?? '',
    education:  user?.education  ?? '',
    experience: user?.experience ?? '',
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
        const strFields = ['name', 'role', 'phone', 'jobTitle', 'idCard', 'address', 'education', 'experience']
        const dateFields = ['dob', 'hireDate']
        strFields.forEach((f) => {
          if (form[f] !== (user[f] ?? '')) body[f] = form[f] || null
        })
        dateFields.forEach((f) => {
          const cur = user[f] ? user[f].slice(0, 10) : ''
          if (form[f] !== cur) body[f] = form[f] || null
        })
        saved = await usersApi.updateUser(user.id, body)
      } else {
        saved = await usersApi.createUser({
          name:       form.name,
          email:      form.email,
          password:   form.password,
          role:       form.role,
          phone:      form.phone      || null,
          jobTitle:   form.jobTitle   || null,
          dob:        form.dob        || null,
          hireDate:   form.hireDate   || null,
          idCard:     form.idCard     || null,
          address:    form.address    || null,
          education:  form.education  || null,
          experience: form.experience || null,
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
    <Modal title={isEdit ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        {/* ── Thông tin cơ bản ── */}
        <div className={s.formSectionLabel}>Thông tin cơ bản</div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Họ và tên</label>
          <input type="text" value={form.name} onChange={set('name')} required
            className={`${s.formInput} ${fieldErrors.name ? s.inputError : ''}`}
            placeholder="Nguyễn Văn A" />
          {fieldErrors.name && <p className={s.fieldError}>{fieldErrors.name}</p>}
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Email</label>
          <input type="email" value={form.email} onChange={set('email')} required disabled={isEdit}
            className={`${s.formInput} ${fieldErrors.email ? s.inputError : ''}`}
            placeholder="nhanvien@email.com" />
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
              <button type="button" onClick={() => setShowPw((v) => !v)} className={s.pwToggle} tabIndex={-1}>
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

        {/* ── Thông tin cá nhân ── */}
        <div className={s.formSectionLabel}>Thông tin cá nhân</div>

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ngày sinh</label>
            <input type="date" value={form.dob} onChange={set('dob')} className={s.formInput} />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Ngày vào làm</label>
            <input type="date" value={form.hireDate} onChange={set('hireDate')} className={s.formInput} />
          </div>
        </div>

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={s.formLabel}>CMND / CCCD</label>
            <input type="text" value={form.idCard} onChange={set('idCard')} className={s.formInput} placeholder="012345678901" maxLength={20} />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Địa chỉ</label>
            <input type="text" value={form.address} onChange={set('address')} className={s.formInput} placeholder="123 Nguyễn Văn Cừ, Q.5, TP.HCM" />
          </div>
        </div>

        {/* ── Hồ sơ & Kinh nghiệm ── */}
        <div className={s.formSectionLabel}>Hồ sơ & Kinh nghiệm</div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Bằng cấp / Chứng chỉ</label>
          <textarea value={form.education} onChange={set('education')} className={s.formTextarea}
            placeholder="VD: Cử nhân Kế toán - ĐH Kinh tế TP.HCM (2018), Chứng chỉ CPA (2021)..."
            rows={3} />
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Kinh nghiệm làm việc</label>
          <textarea value={form.experience} onChange={set('experience')} className={s.formTextarea}
            placeholder="VD: 3 năm kế toán tổng hợp tại Công ty ABC, phụ trách báo cáo thuế và quyết toán..."
            rows={3} />
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
