import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Building2, ChevronRight,
  Loader2, RotateCcw, Trash2, AlertTriangle, Eye, Camera,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import { listUsers } from '../../api/users'
import s from './companies.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

export const BUSINESS_TYPE_LABELS = {
  TNHH:      'Công ty TNHH',
  CP:         'Công ty Cổ phần',
  HKD:        'Hộ kinh doanh',
  DN_TU_NHAN:'Doanh nghiệp tư nhân',
  KHAC:       'Khác',
}

const STATUS_LABELS = {
  active:     'Hoạt động',
  inactive:   'Tạm dừng',
  terminated: 'Đã kết thúc',
}

const COMPANY_STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
const BUSINESS_TYPE_OPTIONS = Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const PAGE_SIZE_OPTIONS = [20, 50, 100]

// ── Small helpers ──────────────────────────────────────────────────────────────

export function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function staffAvatarSrc(staff) {
  if (staff?.avatarUrl) return staff.avatarUrl
  const encoded = encodeURIComponent(staff?.name || '?')
  return `https://ui-avatars.com/api/?name=${encoded}&size=56&background=e2e8f0&color=64748b&bold=true&font-size=0.4`
}

const FALLBACK_AVATAR = `https://ui-avatars.com/api/?name=&size=56&background=e2e8f0&color=94a3b8`

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function AvatarUpload({ value, name, onChange }) {
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
        const sq = Math.min(img.width, img.height)
        const ox = (img.width - sq) / 2
        const oy = (img.height - sq) / 2
        ctx.drawImage(img, ox, oy, sq, sq, 0, 0, SIZE, SIZE)
        onChange(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className={s.avatarUploadWrap}>
      <div className={s.avatarUploadCircle} onClick={() => inputRef.current?.click()} title="Nhấp để chọn logo">
        {value
          ? <img src={value} alt={name} className={s.avatarUploadImg} />
          : <div className={s.avatarUploadInitials}>{getInitials(name)}</div>
        }
        <div className={s.avatarUploadOverlay}><Camera size={14} /></div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <div className={s.avatarUploadActions}>
        <button type="button" className={s.avatarUploadBtn} onClick={() => inputRef.current?.click()}>
          <Camera size={11} /> Chọn logo
        </button>
        {value && (
          <button type="button" className={s.avatarRemoveBtn} onClick={() => onChange(null)}>Xoá</button>
        )}
      </div>
    </div>
  )
}

export function StatusPill({ status }) {
  if (status === 'active')
    return (
      <span className={`${s.statusPill} ${s.statusActive}`}>
        <span className={s.statusDot} /> Hoạt động
      </span>
    )
  if (status === 'inactive')
    return (
      <span className={`${s.statusPill} ${s.statusInactive}`}>
        <span className={s.statusDot} /> Tạm dừng
      </span>
    )
  return (
    <span className={`${s.statusPill} ${s.statusTerminated}`}>
      <span className={s.statusDot} /> Đã kết thúc
    </span>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Companies() {
  const navigate  = useNavigate()
  const isAdmin   = useAuthStore((s) => s.user?.role === 'admin')
  const addToast  = useToastStore((st) => st.toast)

  const [companies, setCompanies]   = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [staffList, setStaffList]   = useState([])

  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [btFilter, setBtFilter]         = useState('')
  const [staffFilter, setStaffFilter]   = useState('')
  const [page, setPage]                 = useState(1)
  const [limit, setLimit]               = useState(20)

  const [showCreate, setShowCreate]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)  // company to delete
  const [deleting, setDeleting]       = useState(false)

  const hasActiveFilters = search || statusFilter || btFilter || staffFilter
  const activeFilterCount = [search, statusFilter, btFilter, staffFilter].filter(Boolean).length
  const pageOpenTotal = companies.reduce((sum, c) => sum + (Number(c.taskOpenCount) || 0), 0)
  const pageOverdueTotal = companies.reduce((sum, c) => sum + (Number(c.taskOverdueCount) || 0), 0)
  const pageActiveTotal = companies.filter((c) => c.status === 'active').length
  const paginationFrom = pagination.total === 0 ? 0 : (page - 1) * limit + 1
  const paginationTo = Math.min(page * limit, pagination.total)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter/limit change
  useEffect(() => { setPage(1) }, [statusFilter, btFilter, staffFilter, limit])

  // Load staff for filter
  useEffect(() => {
    listUsers({ role: 'staff', status: 'active', limit: 100 })
      .then(({ users }) => setStaffList(users))
      .catch(() => {})
  }, [])

  // Fetch companies
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    companiesApi
      .listCompanies({
        page,
        limit,
        status:          statusFilter || undefined,
        businessType:    btFilter     || undefined,
        search:          search       || undefined,
        assignedStaffId: staffFilter  || undefined,
      })
      .then(({ companies: c, pagination: p }) => {
        if (!cancelled) { setCompanies(c); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setError('Không thể tải danh sách khách hàng') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, limit, statusFilter, btFilter, staffFilter, search])

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter('')
    setBtFilter('')
    setStaffFilter('')
    setPage(1)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await companiesApi.deleteCompany(deleteTarget.id)
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
      addToast(`Đã xoá "${deleteTarget.name}"`, 'success')
      setDeleteTarget(null)
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? 'Không thể xoá công ty'
      addToast(msg, 'error')
      // If has-activities error, close dialog so user can use terminate instead
      if (err.response?.status === 409) setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  // Pagination window
  const totalPages = pagination.totalPages
  function pageWindow() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', totalPages]
    if (page >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
  }

  return (
    <AppLayout>
      <div className={s.page}>

        {/* Header */}
        <div className={s.pageHeader}>
          <div className={s.pageTitleGroup}>
            <h1 className={s.pageTitle}>Khách hàng</h1>
            <p className={s.pageSubtitle}>
              {loading ? '...' : `${pagination.total} doanh nghiệp đang quản lý`}
            </p>
          </div>
          {isAdmin && (
            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Thêm khách hàng
            </button>
          )}
        </div>

        {/* Filter panel */}
        <div className={s.filterPanel}>
          {/* Header */}
          <div className={s.filterPanelHeader}>
            <div className={s.filterPanelTitle}>
              <span className={s.filterPanelLabel}>Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className={s.filterPanelBadge}>{activeFilterCount} đang bật</span>
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className={s.filterGrid}>
            {staffList.length > 0 && (
              <div className={s.filterField}>
                <label className={s.filterFieldLabel}>Phụ trách</label>
                <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {staffList.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={s.filterField}>
              <label className={s.filterFieldLabel}>Trạng thái HĐ</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={s.filterSelect}>
                <option value="">Tất cả</option>
                {COMPANY_STATUS_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className={s.filterField}>
              <label className={s.filterFieldLabel}>Loại hình</label>
              <select value={btFilter} onChange={(e) => setBtFilter(e.target.value)} className={s.filterSelect}>
                <option value="">Tất cả</option>
                {BUSINESS_TYPE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className={`${s.filterField} ${s.filterFieldSearch}`}>
              <label className={s.filterFieldLabel}>Từ khoá</label>
              <div className={s.searchWrap}>
                <span className={s.searchIcon}><Search size={13} /></span>
                <input
                  type="text"
                  placeholder="Tên công ty, MST..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={s.searchInput}
                />
              </div>
            </div>
          </div>

          {/* Footer: active chips + result summary */}
          <div className={s.filterFooter}>
            <div className={s.filterFooterLeft}>
              <button
                className={`${s.btnFilterReset} ${hasActiveFilters ? s.btnFilterResetActive : ''}`}
                onClick={resetFilters}
              >
                <RotateCcw size={13} /> Đặt lại
              </button>
              <div className={s.filterChips}>
                {statusFilter && (
                  <span className={s.filterChip}>
                    Trạng thái: {STATUS_LABELS[statusFilter]}
                    <button className={s.filterChipRemove} onClick={() => setStatusFilter('')}>×</button>
                  </span>
                )}
                {btFilter && (
                  <span className={s.filterChip}>
                    Loại hình: {BUSINESS_TYPE_LABELS[btFilter]}
                    <button className={s.filterChipRemove} onClick={() => setBtFilter('')}>×</button>
                  </span>
                )}
                {staffFilter && (
                  <span className={s.filterChip}>
                    Phụ trách: {staffList.find((u) => u.id === staffFilter)?.name ?? '?'}
                    <button className={s.filterChipRemove} onClick={() => setStaffFilter('')}>×</button>
                  </span>
                )}
                {search && (
                  <span className={s.filterChip}>
                    &ldquo;{search}&rdquo;
                    <button className={s.filterChipRemove} onClick={() => { setSearchInput(''); setSearch('') }}>×</button>
                  </span>
                )}
              </div>
            </div>
            {!loading && (
              <div className={s.filterSummary}>
                <span className={s.filterSummaryItem}>
                  <span className={s.filterSummaryValue}>{pagination.total}</span>
                  <span className={s.filterSummaryLabel}>Kết quả</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={s.filterSummaryValue}>{pageOpenTotal}</span>
                  <span className={s.filterSummaryLabel}>Việc mở</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={`${s.filterSummaryValue} ${pageOverdueTotal > 0 ? s.filterSummaryDanger : ''}`}>{pageOverdueTotal}</span>
                  <span className={s.filterSummaryLabel}>Quá hạn</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={`${s.filterSummaryValue} ${s.filterSummarySuccess}`}>{pageActiveTotal}</span>
                  <span className={s.filterSummaryLabel}>Hoạt động</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className={s.tableWrap}>
          {error ? (
            <div className={s.errorState}>
              <Building2 size={28} />
              <span>{error}</span>
            </div>
          ) : (
            <div className={s.tableScroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Tên công ty</th>
                    <th style={{ display: 'table-cell' }}>MST</th>
                    <th style={{ display: 'table-cell', minWidth: 140 }}>Người liên hệ</th>
                    <th style={{ display: 'table-cell' }}>Phụ trách</th>
                    <th style={{ textAlign: 'center', minWidth: 64 }}>Việc mở</th>
                    <th style={{ textAlign: 'center', minWidth: 72 }}>Quá hạn</th>
                    <th>Hợp đồng</th>
                    <th className={s.actionsHead}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} isAdmin={isAdmin} />)
                  ) : companies.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div className={s.emptyState}>
                          <div className={s.emptyIcon}><Building2 size={26} /></div>
                          <p className={s.emptyTitle}>Không tìm thấy doanh nghiệp</p>
                          <p className={s.emptyDesc}>
                            {hasActiveFilters
                              ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'
                              : 'Chưa có khách hàng nào. Nhấn "+ Thêm khách hàng" để bắt đầu.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    companies.map((c) => (
                      <CompanyRow
                        key={c.id}
                        company={c}
                        isAdmin={isAdmin}
                        onClick={() => navigate(`/companies/${c.id}`)}
                        onDelete={(e) => { e.stopPropagation(); setDeleteTarget(c) }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination — gộp trong table card */}
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>
              {loading ? '...' : `Hiển thị ${paginationFrom}-${paginationTo} / ${pagination.total} record`}
            </span>

            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
              <button className={s.paginationBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
              {pageWindow().map((n, i) =>
                n === '…' ? (
                  <span key={`sep-${i}`} className={s.paginationEllipsis}>…</span>
                ) : (
                  <button
                    key={n}
                    className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )
              )}
              <button className={s.paginationBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
              <button className={s.paginationBtn} onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>

            <div className={s.pageSizeWrap}>
              <span className={s.pageSizeLabel}>Hiển thị:</span>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <button
                  key={n}
                  className={`${s.pageSizeBtn} ${limit === n ? s.pageSizeBtnActive : ''}`}
                  onClick={() => setLimit(n)}
                >
                  {n}
                </button>
              ))}
              <span className={s.pageSizeLabel}>/ trang</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CompanyFormModal
          onClose={() => setShowCreate(false)}
          onSaved={(c) => {
            setShowCreate(false)
            setCompanies((prev) => [c, ...prev])
            setPagination((p) => ({ ...p, total: p.total + 1 }))
            addToast(`Đã thêm khách hàng "${c.name}"`, 'success')
          }}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteCompanyModal
          company={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </AppLayout>
  )
}

// ── CompanyRow ─────────────────────────────────────────────────────────────────

function CompanyRow({ company, isAdmin, onClick, onDelete }) {
  const staff = company.assignedStaff

  return (
    <tr onClick={onClick}>
      <td>
        <div className={s.companyCell}>
          {company.avatarUrl ? (
            <img
              src={company.avatarUrl}
              alt=""
              className={s.companyAvatar}
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
            />
          ) : null}
          <div className={s.companyInitials} style={company.avatarUrl ? { display: 'none' } : {}}>
            {getInitials(company.name)}
          </div>
          <div>
            <div className={s.companyName}>{company.name}</div>
            {(company.industry || company.businessType) && (
              <div className={s.companyMeta}>
                {company.industry || BUSINESS_TYPE_LABELS[company.businessType]}
              </div>
            )}
          </div>
        </div>
      </td>
      <td style={{ display: 'table-cell' }}>
        <span className={s.muted}>{company.taxCode || '—'}</span>
      </td>
      <td style={{ display: 'table-cell' }}>
        {company.contactName ? (
          <div>
            <div className={s.contactName}>{company.contactName}</div>
            {company.contactPhone && <div className={s.contactPhone}>{company.contactPhone}</div>}
          </div>
        ) : (
          <span className={s.muted}>—</span>
        )}
      </td>
      <td>
        {staff ? (
          <div className={s.staffCell}>
            <img
              src={staffAvatarSrc(staff)}
              alt={staff.name}
              className={s.staffAvatar}
              onError={(e) => { e.target.src = FALLBACK_AVATAR }}
            />
            <span className={s.staffName}>{staff.name}</span>
          </div>
        ) : (
          <span className={s.unassigned}>Chưa phân công</span>
        )}
      </td>
      <td style={{ textAlign: 'center' }}>
        {company.taskOpenCount > 0 ? (
          <span className={s.metricOpen}>{company.taskOpenCount}</span>
        ) : (
          <span className={s.metricZero}>0</span>
        )}
      </td>
      <td style={{ textAlign: 'center' }}>
        {company.taskOverdueCount > 0 ? (
          <span className={s.pillOverdue}>{company.taskOverdueCount}</span>
        ) : (
          <span className={s.metricZero}>0</span>
        )}
      </td>
      <td><StatusPill status={company.status} /></td>
      <td>
        <div className={s.rowActions}>
          {isAdmin && (
            <button
              className={`${s.rowActionBtn} ${s.rowActionDanger}`}
              onClick={onDelete}
              title="Xoá công ty"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className={`${s.rowActionBtn} ${s.rowActionView}`}
            onClick={(e) => { e.stopPropagation(); onClick() }}
            title="Xem chi tiết"
          >
            <Eye size={14} />
          </button>
          <ChevronRight size={14} className={s.rowChevronIcon} />
        </div>
      </td>
    </tr>
  )
}

// ── SkeletonRow ────────────────────────────────────────────────────────────────

function SkeletonRow({ isAdmin }) {
  return (
    <tr className={`${s.skeletonRow} ${s.skeletonPulse}`}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div className={s.skeletonSquare} style={{ width: 36, height: 36, flexShrink: 0 }} />
          <div>
            <div className={s.skeletonBlock} style={{ width: 160, height: 12, marginBottom: 5 }} />
            <div className={s.skeletonBlock} style={{ width: 100, height: 10 }} />
          </div>
        </div>
      </td>
      <td><div className={s.skeletonBlock} style={{ width: 80, height: 11 }} /></td>
      <td><div className={s.skeletonBlock} style={{ width: 100, height: 11 }} /></td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={s.skeletonCircle} style={{ width: 28, height: 28, flexShrink: 0 }} />
          <div className={s.skeletonBlock} style={{ width: 90, height: 11 }} />
        </div>
      </td>
      <td style={{ textAlign: 'center' }}><div className={s.skeletonBlock} style={{ width: 24, height: 14, margin: '0 auto' }} /></td>
      <td style={{ textAlign: 'center' }}><div className={s.skeletonBlock} style={{ width: 24, height: 14, margin: '0 auto' }} /></td>
      <td><div className={s.skeletonBlock} style={{ width: 80, height: 20, borderRadius: 999 }} /></td>
      <td />
    </tr>
  )
}

// ── DeleteCompanyModal ─────────────────────────────────────────────────────────

function DeleteCompanyModal({ company, deleting, onClose, onConfirm }) {
  const hasActivities = company.taskOpenCount > 0 || company.taskOverdueCount > 0

  return (
    <Modal title="Xoá công ty" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {hasActivities ? (
          <div className={s.terminateWarn}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>{company.name}</strong> đang có <strong>{company.taskOpenCount + company.taskOverdueCount} công việc</strong> chưa hoàn thành.
              Không thể xoá công ty đã có hoạt động — hãy dùng chức năng <strong>"Kết thúc HĐ"</strong> trên trang chi tiết để lưu giữ dữ liệu.
            </span>
          </div>
        ) : (
          <div className={s.terminateWarn} style={{ background: '#fef2f2', borderColor: '#fca5a5' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1, color: '#dc2626' }} />
            <span>
              Bạn sắp <strong>xoá vĩnh viễn</strong> công ty <strong>"{company.name}"</strong>.
              Hành động này không thể hoàn tác. Chỉ xoá được nếu công ty chưa có công việc hoặc lịch sử phân công.
            </span>
          </div>
        )}
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline}>
            {hasActivities ? 'Đóng' : 'Huỷ bỏ'}
          </button>
          {!hasActivities && (
            <button onClick={onConfirm} disabled={deleting} className={s.btnDanger}>
              {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
              {deleting ? 'Đang xoá...' : 'Xoá vĩnh viễn'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── CompanyFormModal ───────────────────────────────────────────────────────────

export function CompanyFormModal({ company, onClose, onSaved }) {
  const isEdit = !!company
  const [form, setForm] = useState({
    name:             company?.name             ?? '',
    taxCode:          company?.taxCode          ?? '',
    businessType:     company?.businessType     ?? 'TNHH',
    address:          company?.address          ?? '',
    industry:         company?.industry         ?? '',
    legalRepName:     company?.legalRepName     ?? '',
    legalRepPhone:    company?.legalRepPhone    ?? '',
    contactName:      company?.contactName      ?? '',
    contactPhone:     company?.contactPhone     ?? '',
    contactEmail:     company?.contactEmail     ?? '',
    bankAccount:      company?.bankAccount      ?? '',
    bankName:         company?.bankName         ?? '',
    serviceStartDate: company?.serviceStartDate ? company.serviceStartDate.slice(0, 10) : '',
    notes:            company?.notes            ?? '',
    avatarUrl:        company?.avatarUrl        ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [fe, setFE]           = useState({})

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  function inputCls(field) {
    return fe[field] ? `${s.formInput} ${s.formInputError}` : s.formInput
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setFE({ name: 'Tên công ty không được để trống' }); return }
    setError(null); setFE({})
    setLoading(true)
    try {
      const body = {
        name:             form.name.trim(),
        taxCode:          form.taxCode.trim()          || null,
        businessType:     form.businessType,
        address:          form.address.trim()          || null,
        industry:         form.industry.trim()         || null,
        legalRepName:     form.legalRepName.trim()     || null,
        legalRepPhone:    form.legalRepPhone.trim()    || null,
        contactName:      form.contactName.trim()      || null,
        contactPhone:     form.contactPhone.trim()     || null,
        contactEmail:     form.contactEmail.trim()     || null,
        bankAccount:      form.bankAccount.trim()      || null,
        bankName:         form.bankName.trim()         || null,
        serviceStartDate: form.serviceStartDate        || null,
        notes:            form.notes.trim()            || null,
        avatarUrl:        form.avatarUrl                || null,
      }
      const saved = isEdit
        ? await companiesApi.updateCompany(company.id, body)
        : await companiesApi.createCompany(body)
      onSaved(saved)
    } catch (err) {
      const errData = err.response?.data?.error
      if (err.response?.status === 422 && errData?.details) {
        const errs = {}
        for (const d of errData.details) errs[d.field] = d.message
        setFE(errs)
      } else {
        setError(errData?.message ?? 'Đã xảy ra lỗi, vui lòng thử lại')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={isEdit ? 'Chỉnh sửa thông tin công ty' : 'Thêm khách hàng mới'}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        {/* Thông tin doanh nghiệp */}
        <div>
          <div className={s.formGroupLabel}>Thông tin doanh nghiệp</div>
          <div className={s.formGrid2} style={{ marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên công ty</label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                className={inputCls('name')}
                placeholder="Công ty TNHH ABC..."
                autoFocus
              />
              {fe.name && <p className={s.formError}>{fe.name}</p>}
            </div>
          </div>
          <div className={s.formGrid3}>
            <div>
              <label className={s.formLabel}>Mã số thuế</label>
              <input type="text" value={form.taxCode} onChange={set('taxCode')} className={inputCls('taxCode')} placeholder="0123456789" />
              {fe.taxCode && <p className={s.formError}>{fe.taxCode}</p>}
            </div>
            <div>
              <label className={s.formLabel}>Loại hình</label>
              <select value={form.businessType} onChange={set('businessType')} className={s.formSelect}>
                {Object.entries(BUSINESS_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={s.formLabel}>Ngành nghề</label>
              <input type="text" value={form.industry} onChange={set('industry')} className={s.formInput} placeholder="Thương mại, sản xuất..." />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label className={s.formLabel}>Địa chỉ</label>
            <input type="text" value={form.address} onChange={set('address')} className={s.formInput} placeholder="123 Đường ABC, Quận XYZ, TP.HCM" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label className={s.formLabel}>Logo / Ảnh đại diện</label>
            <AvatarUpload
              value={form.avatarUrl || null}
              name={form.name || (company?.name ?? '')}
              onChange={(url) => setForm((p) => ({ ...p, avatarUrl: url }))}
            />
            <p className={s.formHint}>Chọn file từ máy tính — JPEG, PNG, GIF, WebP (tối đa ~1MB sau nén)</p>
          </div>
        </div>

        {/* Đại diện pháp lý & liên hệ */}
        <div>
          <div className={s.formGroupLabel}>Đại diện pháp lý & người liên hệ</div>
          <div className={s.formGrid2} style={{ marginBottom: 12 }}>
            <div>
              <label className={s.formLabel}>Họ tên đại diện pháp lý</label>
              <input type="text" value={form.legalRepName} onChange={set('legalRepName')} className={s.formInput} placeholder="Họ và tên" />
            </div>
            <div>
              <label className={s.formLabel}>ĐT đại diện</label>
              <input type="tel" value={form.legalRepPhone} onChange={set('legalRepPhone')} className={s.formInput} placeholder="0901 234 567" />
            </div>
          </div>
          <div className={s.formGrid3}>
            <div>
              <label className={s.formLabel}>Họ tên liên hệ</label>
              <input type="text" value={form.contactName} onChange={set('contactName')} className={s.formInput} placeholder="Người liên hệ" />
            </div>
            <div>
              <label className={s.formLabel}>ĐT liên hệ</label>
              <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={s.formInput} placeholder="0901 234 567" />
            </div>
            <div>
              <label className={s.formLabel}>Email liên hệ</label>
              <input type="email" value={form.contactEmail} onChange={set('contactEmail')} className={inputCls('contactEmail')} placeholder="email@congty.vn" />
              {fe.contactEmail && <p className={s.formError}>{fe.contactEmail}</p>}
            </div>
          </div>
        </div>

        {/* Hợp đồng & ngân hàng */}
        <div>
          <div className={s.formGroupLabel}>Hợp đồng & ngân hàng</div>
          <div className={s.formGrid3}>
            <div>
              <label className={s.formLabel}>Ngày bắt đầu dịch vụ</label>
              <input type="date" value={form.serviceStartDate} onChange={set('serviceStartDate')} className={s.formInput} />
            </div>
            <div>
              <label className={s.formLabel}>Số tài khoản NH</label>
              <input type="text" value={form.bankAccount} onChange={set('bankAccount')} className={s.formInput} placeholder="1234 5678 9012" />
            </div>
            <div>
              <label className={s.formLabel}>Tên ngân hàng</label>
              <input type="text" value={form.bankName} onChange={set('bankName')} className={s.formInput} placeholder="Vietcombank, ACB..." />
            </div>
          </div>
        </div>

        {/* Ghi chú */}
        <div>
          <div className={s.formGroupLabel}>Ghi chú</div>
          <textarea
            value={form.notes}
            onChange={set('notes')}
            className={s.formTextarea}
            placeholder="Ghi chú đặc thù nghiệp vụ, yêu cầu đặc biệt..."
            rows={3}
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline}>Huỷ</button>
          <button type="submit" disabled={loading} className={s.btnPrimary}>
            {loading ? <Loader2 size={13} className={s.spin} /> : null}
            {loading ? 'Đang lưu...' : isEdit ? 'Lưu thay đổi' : 'Thêm khách hàng'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
