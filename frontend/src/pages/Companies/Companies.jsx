import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Building2,
  Loader2, RotateCcw, Trash2, AlertTriangle, Eye, Camera, X,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import { listUserOptions } from '../../api/users'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import s from './companies.module.css'

// ── Constants (fallbacks while enum API loads) ─────────────────────────────────

export const BUSINESS_TYPE_LABELS = {
  TNHH:       'Công ty TNHH',
  CP:          'Công ty Cổ phần',
  HKD:         'Hộ kinh doanh',
  DN_TU_NHAN: 'Doanh nghiệp tư nhân',
  KHAC:        'Khác',
}

const STATUS_LABELS = {
  active:     'Hoạt động',
  inactive:   'Tạm dừng',
  terminated: 'Đã kết thúc',
}

const COMPANY_STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
const BUSINESS_TYPE_OPTIONS = Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => ({ value, label }))

const PAGE_SIZE_OPTIONS = [20, 50, 100]

const FILTER_KEY = 'companies_filters'
function readSaved() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') } catch { return {} }
}

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
      <input ref={inputRef} type="file" accept="image/*" className={s.hiddenInput} onChange={handleFile} />
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

// ── MultiSelectFilter ──────────────────────────────────────────────────────────

function MultiSelectFilter({ options, value, onChange, placeholder = 'Tất cả' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = new Set(value)

  function toggle(v) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange([...next])
  }

  const displayText = value.length === 0
    ? placeholder
    : value.length === 1
      ? (options.find((o) => o.value === value[0])?.label ?? value[0])
      : `${value.length} đã chọn`

  return (
    <div className={s.msWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${s.msBtn} ${value.length > 0 ? s.msBtnActive : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={s.msBtnText}>{displayText}</span>
        <span className={s.msBtnChevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={s.msDropdown}>
          {options.map(({ value: v, label }) => (
            <label key={v} className={`${s.msOption} ${selected.has(v) ? s.msOptionChecked : ''}`}>
              <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Companies() {
  const navigate  = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin   = currentUser?.role === 'admin'
  const addToast  = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  const [companies, setCompanies]   = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [staffList, setStaffList]   = useState([])

  const [searchInput, setSearchInput]   = useState(() => readSaved().search ?? '')
  const [search, setSearch]             = useState(() => readSaved().search ?? '')
  const ensureArr = (v) => Array.isArray(v) ? v : []
  const [statusFilter, setStatusFilter] = useState(() => ensureArr(readSaved().statusFilter))
  const [btFilter, setBtFilter]         = useState(() => ensureArr(readSaved().btFilter))
  const [staffFilter, setStaffFilter]   = useState(() => ensureArr(readSaved().staffFilter))
  const [page, setPage]                 = useState(() => readSaved().page ?? 1)
  const [limit, setLimit]               = useState(() => readSaved().limit ?? 20)

  const [syncKey, setSyncKey]         = useState(0)
  const [showCreate, setShowCreate]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)  // company to delete
  const [deleting, setDeleting]       = useState(false)

  const hasActiveFilters = search || statusFilter.length > 0 || btFilter.length > 0 || staffFilter.length > 0
  const activeFilterCount = [search, statusFilter.length > 0, btFilter.length > 0, staffFilter.length > 0].filter(Boolean).length
  const pageOpenTotal      = companies.reduce((sum, c) => sum + (Number(c.taskOpenCount) || 0), 0)
  const pageOverdueTotal   = companies.reduce((sum, c) => sum + (Number(c.taskOverdueCount) || 0), 0)
  const pageActiveTotal    = companies.filter((c) => c.status === 'active').length
  const pageInactiveTotal  = companies.filter((c) => c.status === 'inactive').length
  const pageTerminatedTotal = companies.filter((c) => c.status === 'terminated').length
  const paginationFrom = pagination.total === 0 ? 0 : (page - 1) * limit + 1
  const paginationTo = Math.min(page * limit, pagination.total)

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      search, statusFilter, btFilter, staffFilter, page, limit,
    }))
  }, [search, statusFilter, btFilter, staffFilter, page, limit])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter/limit change
  useEffect(() => { setPage(1) }, [statusFilter, btFilter, staffFilter, limit])

  // Load staff for filter + enums
  useEffect(() => {
    listUserOptions({ status: 'active' })
      .then(({ users }) => setStaffList(users))
      .catch(() => {})
    loadEnums()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live sync: reload when any user creates / updates / deletes a company
  useDataSync('data:company', () => setSyncKey((k) => k + 1), [])

  // Fetch companies
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    companiesApi
      .listCompanies({
        page,
        limit,
        status:          statusFilter.length > 0 ? statusFilter.join(',') : undefined,
        businessType:    btFilter.length     > 0 ? btFilter.join(',')     : undefined,
        search:          search || undefined,
        // Staff always scoped to their own companies; admin can filter by any staff
        assignedStaffId: isAdmin ? (staffFilter.length > 0 ? staffFilter.join(',') : undefined) : currentUser?.id,
      })
      .then(({ companies: c, pagination: p }) => {
        if (!cancelled) { setCompanies(c); setPagination(p) }
      })
      .catch(() => { if (!cancelled) setError('Không thể tải danh sách khách hàng') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, limit, statusFilter, btFilter, staffFilter, search, syncKey])

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter([])
    setBtFilter([])
    setStaffFilter([])
    setPage(1)
    sessionStorage.removeItem(FILTER_KEY)
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
              {loading ? '...' : isAdmin
                ? `${pagination.total} doanh nghiệp đang quản lý`
                : `${pagination.total} công ty tôi phụ trách`}
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
            {isAdmin && staffList.length > 0 && (
              <div className={s.filterField}>
                <label className={s.filterFieldLabel}>Phụ trách</label>
                <MultiSelectFilter
                  options={staffList.map((u) => ({ value: u.id, label: u.name }))}
                  value={staffFilter}
                  onChange={setStaffFilter}
                  placeholder="Tất cả"
                />
              </div>
            )}

            <div className={s.filterField}>
              <label className={s.filterFieldLabel}>Trạng thái HĐ</label>
              <MultiSelectFilter
                options={getOptions('company_status').length > 0
                  ? getOptions('company_status').map((o) => ({ value: o.key, label: o.label }))
                  : COMPANY_STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
                placeholder="Tất cả"
              />
            </div>

            <div className={s.filterField}>
              <label className={s.filterFieldLabel}>Loại hình</label>
              <MultiSelectFilter
                options={getOptions('business_type').length > 0
                  ? getOptions('business_type').map((o) => ({ value: o.key, label: o.label }))
                  : BUSINESS_TYPE_OPTIONS}
                value={btFilter}
                onChange={setBtFilter}
                placeholder="Tất cả"
              />
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
                {statusFilter.map((v) => (
                  <span key={v} className={s.filterChip}>
                    {getLabel('company_status', v, STATUS_LABELS[v])}
                    <button className={s.filterChipRemove} onClick={() => setStatusFilter((p) => p.filter((x) => x !== v))}>×</button>
                  </span>
                ))}
                {btFilter.map((v) => (
                  <span key={v} className={s.filterChip}>
                    {getLabel('business_type', v, BUSINESS_TYPE_LABELS[v])}
                    <button className={s.filterChipRemove} onClick={() => setBtFilter((p) => p.filter((x) => x !== v))}>×</button>
                  </span>
                ))}
                {isAdmin && staffFilter.map((id) => (
                  <span key={id} className={s.filterChip}>
                    {staffList.find((u) => u.id === id)?.name ?? '?'}
                    <button className={s.filterChipRemove} onClick={() => setStaffFilter((p) => p.filter((x) => x !== id))}>×</button>
                  </span>
                ))}
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
                  <span className={s.filterSummaryLabel}>Tổng KH</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={`${s.filterSummaryValue} ${s.filterSummarySuccess}`}>{pageActiveTotal}</span>
                  <span className={s.filterSummaryLabel}>Hợp tác</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={`${s.filterSummaryValue} ${pageInactiveTotal > 0 ? s.filterSummaryWarn : ''}`}>{pageInactiveTotal}</span>
                  <span className={s.filterSummaryLabel}>Tạm ngưng</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={s.filterSummaryValue}>{pageTerminatedTotal}</span>
                  <span className={s.filterSummaryLabel}>Chấm dứt</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={s.filterSummaryValue}>{pageOpenTotal}</span>
                  <span className={s.filterSummaryLabel}>Việc mở</span>
                </span>
                <span className={s.filterSummaryItem}>
                  <span className={`${s.filterSummaryValue} ${pageOverdueTotal > 0 ? s.filterSummaryDanger : ''}`}>{pageOverdueTotal}</span>
                  <span className={s.filterSummaryLabel}>Quá hạn</span>
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
                    <th className={s.tableCellVisible}>MST</th>
                    <th className={s.tableContactHead}>Người liên hệ</th>
                    <th className={s.tableCellVisible}>Phụ trách</th>
                    <th className={s.tableMetricOpenHead}>Việc mở</th>
                    <th className={s.tableMetricOverdueHead}>Quá hạn</th>
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
  const staff    = company.assignedStaff
  const getLabel = useEnumsStore((st) => st.getLabel)

  return (
    <tr onClick={onClick}>
      <td>
        <div className={s.companyCell}>
          {company.avatarUrl ? (
            <img
              src={company.avatarUrl}
              alt=""
              className={s.companyAvatar}
              onError={(e) => {
                e.currentTarget.classList.add(s.isHidden)
                e.currentTarget.nextSibling?.classList.remove(s.isHidden)
              }}
            />
          ) : null}
          <div className={`${s.companyInitials} ${company.avatarUrl ? s.isHidden : ''}`}>
            {getInitials(company.name)}
          </div>
          <div>
            <div className={s.companyName}>{company.name}</div>
            {(company.industry || company.businessType) && (
              <div className={s.companyMeta}>
                {company.industry || getLabel('business_type', company.businessType, BUSINESS_TYPE_LABELS[company.businessType])}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className={s.tableCellVisible}>
        <span className={s.muted}>{company.taxCode || '—'}</span>
      </td>
      <td className={s.tableCellVisible}>
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
      <td className={s.tableMetricCell}>
        {company.taskOpenCount > 0 ? (
          <span className={s.metricOpen}>{company.taskOpenCount}</span>
        ) : (
          <span className={s.metricZero}>0</span>
        )}
      </td>
      <td className={s.tableMetricCell}>
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
        <div className={s.companyNameSkeletonRow}>
          <div className={`${s.skeletonSquare} ${s.skeletonSquareCompany}`} />
          <div>
            <div className={`${s.skeletonBlock} ${s.skeletonCompanyName}`} />
            <div className={`${s.skeletonBlock} ${s.skeletonCompanyMeta}`} />
          </div>
        </div>
      </td>
      <td><div className={`${s.skeletonBlock} ${s.skeletonTax}`} /></td>
      <td><div className={`${s.skeletonBlock} ${s.skeletonContact}`} /></td>
      <td>
        <div className={s.companyStaffSkeletonRow}>
          <div className={`${s.skeletonCircle} ${s.skeletonStaffAvatar}`} />
          <div className={`${s.skeletonBlock} ${s.skeletonStaffName}`} />
        </div>
      </td>
      <td className={s.tableMetricCell}><div className={`${s.skeletonBlock} ${s.skeletonMetric}`} /></td>
      <td className={s.tableMetricCell}><div className={`${s.skeletonBlock} ${s.skeletonMetric}`} /></td>
      <td><div className={`${s.skeletonBlock} ${s.skeletonStatus}`} /></td>
      <td />
    </tr>
  )
}

// ── DeleteCompanyModal ─────────────────────────────────────────────────────────

function DeleteCompanyModal({ company, deleting, onClose, onConfirm }) {
  const hasActivities = company.taskOpenCount > 0 || company.taskOverdueCount > 0

  return (
    <Modal title="Xoá công ty" onClose={onClose}>
      <div className={s.modalStack}>
        {hasActivities ? (
          <div className={s.terminateWarn}>
            <AlertTriangle size={18} className={s.warnIconInline} />
            <span>
              <strong>{company.name}</strong> đang có <strong>{company.taskOpenCount + company.taskOverdueCount} công việc</strong> chưa hoàn thành.
              Không thể xoá công ty đã có hoạt động — hãy dùng chức năng <strong>&ldquo;Kết thúc HĐ&rdquo;</strong> trên trang chi tiết để lưu giữ dữ liệu.
            </span>
          </div>
        ) : (
          <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
            <AlertTriangle size={18} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
            <span>
              Bạn sắp <strong>xoá vĩnh viễn</strong> công ty <strong>&ldquo;{company.name}&rdquo;</strong>.
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
    customFields:     Array.isArray(company?.customFields) ? company.customFields : [],
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
    const phoneRe = /^0\d{9}$/
    const errs = {}
    if (!form.name.trim()) errs.name = 'Tên công ty không được để trống'
    if (form.taxCode.trim() && !/^\d{10}(-\d{3})?$/.test(form.taxCode.trim()))
      errs.taxCode = 'Mã số thuế phải gồm 10 chữ số (VD: 0123456789)'
    const rawLP = form.legalRepPhone.replace(/[\s.-]/g, '')
    if (rawLP && !phoneRe.test(rawLP))
      errs.legalRepPhone = 'Số điện thoại không đúng định dạng (VD: 0901 234 567)'
    const rawCP = form.contactPhone.replace(/[\s.-]/g, '')
    if (rawCP && !phoneRe.test(rawCP))
      errs.contactPhone = 'Số điện thoại không đúng định dạng (VD: 0901 234 567)'
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()))
      errs.contactEmail = 'Email không đúng định dạng'
    if (Object.keys(errs).length > 0) { setFE(errs); return }
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
        customFields:     form.customFields.filter((f) => f.name.trim()),
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
          <div className={`${s.formGrid2} ${s.formGridSpaced}`}>
            <div className={s.formFullRow}>
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
          <div className={s.formFieldTop}>
            <label className={s.formLabel}>Địa chỉ</label>
            <input type="text" value={form.address} onChange={set('address')} className={s.formInput} placeholder="123 Đường ABC, Quận XYZ, TP.HCM" />
          </div>
          <div className={s.formFieldTop}>
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
          <div className={`${s.formGrid2} ${s.formGridSpaced}`}>
            <div>
              <label className={s.formLabel}>Họ tên đại diện pháp lý</label>
              <input type="text" value={form.legalRepName} onChange={set('legalRepName')} className={s.formInput} placeholder="Họ và tên" />
            </div>
            <div>
              <label className={s.formLabel}>ĐT đại diện</label>
              <input type="tel" value={form.legalRepPhone} onChange={set('legalRepPhone')} className={inputCls('legalRepPhone')} placeholder="0901 234 567" />
              {fe.legalRepPhone && <p className={s.formError}>{fe.legalRepPhone}</p>}
            </div>
          </div>
          <div className={s.formGrid3}>
            <div>
              <label className={s.formLabel}>Họ tên liên hệ</label>
              <input type="text" value={form.contactName} onChange={set('contactName')} className={s.formInput} placeholder="Người liên hệ" />
            </div>
            <div>
              <label className={s.formLabel}>ĐT liên hệ</label>
              <input type="tel" value={form.contactPhone} onChange={set('contactPhone')} className={inputCls('contactPhone')} placeholder="0901 234 567" />
              {fe.contactPhone && <p className={s.formError}>{fe.contactPhone}</p>}
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

        {/* Thông tin bổ sung */}
        <div>
          <div className={s.formGroupLabel}>Thông tin bổ sung</div>
          <div className={s.customFieldsList}>
            {form.customFields.map((field, i) => (
              <div key={i} className={s.customFieldRow}>
                <input
                  type="text"
                  className={s.formInput}
                  placeholder="Tên trường"
                  value={field.name}
                  onChange={(e) => {
                    const next = [...form.customFields]
                    next[i] = { ...next[i], name: e.target.value }
                    setForm((p) => ({ ...p, customFields: next }))
                  }}
                />
                <input
                  type="text"
                  className={s.formInput}
                  placeholder="Nội dung"
                  value={field.value}
                  onChange={(e) => {
                    const next = [...form.customFields]
                    next[i] = { ...next[i], value: e.target.value }
                    setForm((p) => ({ ...p, customFields: next }))
                  }}
                />
                <button
                  type="button"
                  className={s.customFieldRemoveBtn}
                  onClick={() => setForm((p) => ({ ...p, customFields: p.customFields.filter((_, j) => j !== i) }))}
                  title="Xoá trường"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className={s.customFieldAddBtn}
              onClick={() => setForm((p) => ({ ...p, customFields: [...p.customFields, { name: '', value: '' }] }))}
            >
              <Plus size={12} /> Thêm trường
            </button>
          </div>
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
