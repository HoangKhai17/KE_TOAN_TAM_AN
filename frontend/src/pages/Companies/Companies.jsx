import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { invalidateRefCompanies, useStaffOptions } from '../../hooks/useReferenceData'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Building2,
  Loader2, RotateCcw, Trash2, AlertTriangle, Eye, Camera, X, Filter, Download,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import CompanyExportModal from './CompanyExportModal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as companiesApi from '../../api/companies'
import * as companyTablesApi from '../../api/companyTables'
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
// colFilters của cột enum là Set (không JSON hoá được) → chuyển Set↔Array khi lưu/khôi phục.
function serializeColFilters(cf) {
  const out = {}
  for (const [k, v] of Object.entries(cf || {})) out[k] = v instanceof Set ? [...v] : v
  return out
}
function deserializeColFilters(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = (getCompanyColumnFilterType(k) === 'enum' && Array.isArray(v)) ? new Set(v) : v
  }
  return out
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

// ── Column-header filter machinery (per docs/018) ─────────────────────────────

function getCompanyColumnFilterType(colKey) {
  if (colKey === 'assignedStaffName' || colKey === 'status') return 'enum'
  if (colKey === 'taskOpenCount' || colKey === 'taskOverdueCount') return 'numberRange'
  return 'text'
}

function getCompanyDisplayLabel(row, colKey) {
  switch (colKey) {
    case 'name':             return row.name ?? '(Trống)'
    case 'taxCode':          return row.taxCode || '(Trống)'
    case 'contactName':      return row.contactName || '(Trống)'
    case 'assignedStaffName': return row.assignedStaff?.name || '(Chưa giao)'
    case 'status':           return STATUS_LABELS[row.status] ?? row.status
    case 'taskOpenCount':    return String(row.taskOpenCount ?? 0)
    case 'taskOverdueCount': return String(row.taskOverdueCount ?? 0)
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}

function getCompanySortKey(row, colKey) {
  switch (colKey) {
    case 'taskOpenCount':    return Number(row.taskOpenCount ?? 0)
    case 'taskOverdueCount': return Number(row.taskOverdueCount ?? 0)
    case 'assignedStaffName': return (row.assignedStaff?.name ?? '').toLowerCase()
    case 'status':           return STATUS_LABELS[row.status] ?? ''
    default:                 return String(row[colKey] ?? '').toLowerCase()
  }
}

function CoEnumFilterSection({ colKey, allRows, currentFilter, onFilterChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set()
    const vals = []
    for (const row of allRows) {
      const lbl = getCompanyDisplayLabel(row, colKey)
      if (!seen.has(lbl)) { seen.add(lbl); vals.push(lbl) }
    }
    return vals.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [allRows, colKey])

  const selected = useMemo(
    () => (!currentFilter ? new Set(allValues) : currentFilter),
    [currentFilter, allValues]
  )

  function toggleValue(val) {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onFilterChange(colKey, next.size === allValues.length ? null : next)
  }
  function toggleAll() {
    onFilterChange(colKey, selected.size === allValues.length ? new Set() : null)
  }

  const allChecked  = selected.size === allValues.length
  const noneChecked = selected.size === 0

  return (
    <>
      <label className={s.hdldDdSelectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={toggleAll} />
        Chọn tất cả ({allValues.length})
      </label>
      <div className={s.hdldDdValueList}>
        {allValues.map((val) => (
          <label key={val} className={s.hdldDdValueItem}>
            <input type="checkbox" checked={selected.has(val)} onChange={() => toggleValue(val)} />
            <span className={s.hdldDdValueText}>{val}</span>
          </label>
        ))}
      </div>
      <div className={s.hdldDdFooter}>
        <button className={s.hdldDdClearBtn} onClick={() => { onFilterChange(colKey, null); onClose() }}>
          Xoá bộ lọc
        </button>
      </div>
    </>
  )
}

function CoTextFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [query, setQuery] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <div className={s.hdldDdFilterSection}>
      <input ref={inputRef} type="text" className={s.hdldDdInput} placeholder="Tìm kiếm..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); onFilterChange(colKey, e.target.value.trim() || null) }} />
      {query && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn} onClick={() => { setQuery(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function CoNumberRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [minVal, setMinVal] = useState(currentFilter?.min ?? '')
  const [maxVal, setMaxVal] = useState(currentFilter?.max ?? '')
  function apply(mn, mx) { onFilterChange(colKey, mn !== '' || mx !== '' ? { min: mn, max: mx } : null) }
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối thiểu</span>
          <input type="number" className={s.hdldDdInput} placeholder="0" value={minVal}
            onChange={(e) => { setMinVal(e.target.value); apply(e.target.value, maxVal) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input type="number" className={s.hdldDdInput} placeholder="∞" value={maxVal}
            onChange={(e) => { setMaxVal(e.target.value); apply(minVal, e.target.value) }} />
        </div>
      </div>
      {(minVal !== '' || maxVal !== '') && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setMinVal(''); setMaxVal(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function CoColumnFilterDropdown({ colKey, allRows, currentFilter, sortState, onSort, onFilterChange, onClose, style }) {
  const dropRef    = useRef(null)
  const filterType = getCompanyColumnFilterType(colKey)

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        if (!e.target.closest('[data-hdld-filter-btn]')) onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const activeAsc  = sortState.col === colKey && sortState.dir === 'asc'
  const activeDesc = sortState.col === colKey && sortState.dir === 'desc'

  return (
    <div ref={dropRef} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${activeAsc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${activeDesc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {filterType === 'enum' && (
        <CoEnumFilterSection colKey={colKey} allRows={allRows} currentFilter={currentFilter}
          onFilterChange={onFilterChange} onClose={onClose} />
      )}
      {filterType === 'text' && (
        <CoTextFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'numberRange' && (
        <CoNumberRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
    </div>
  )
}

export default function Companies() {
  const navigate  = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin   = currentUser?.role === 'admin'
  const addToast  = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  // Danh sách công ty — local mirror, sync từ React Query (giữ optimistic create/delete)
  const [companies, setCompanies]   = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const { data: staffList = [] } = useStaffOptions()   // React Query — cache dùng chung

  const [searchInput, setSearchInput]   = useState(() => readSaved().search ?? '')
  const [search, setSearch]             = useState(() => readSaved().search ?? '')
  const ensureArr = (v) => Array.isArray(v) ? v : []
  const [statusFilter, setStatusFilter] = useState(() => ensureArr(readSaved().statusFilter))
  const [btFilter, setBtFilter]         = useState(() => ensureArr(readSaved().btFilter))
  const [staffFilter, setStaffFilter]   = useState(() => ensureArr(readSaved().staffFilter))
  const [page, setPage]                 = useState(() => readSaved().page ?? 1)
  const [limit, setLimit]               = useState(() => readSaved().limit ?? 20)

  // Column-header filter / sort (client-side, per docs/018)
  const [colFilters, setColFilters]   = useState(() => deserializeColFilters(readSaved().colFilters))
  const [sortState, setSortState]     = useState(() => readSaved().sortState ?? { col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  const [showCreate, setShowCreate]   = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)  // company to delete
  const [deleting, setDeleting]       = useState(false)

  // Bulk export (admin-only)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [showExport, setShowExport]   = useState(false)
  const [customDefs, setCustomDefs]   = useState([])

  const hasActiveFilters = search || statusFilter.length > 0 || btFilter.length > 0 || staffFilter.length > 0
  const activeFilterCount = [search, statusFilter.length > 0, btFilter.length > 0, staffFilter.length > 0].filter(Boolean).length
  const pageOpenTotal      = companies.reduce((sum, c) => sum + (Number(c.taskOpenCount) || 0), 0)
  const pageOverdueTotal   = companies.reduce((sum, c) => sum + (Number(c.taskOverdueCount) || 0), 0)
  const pageActiveTotal    = companies.filter((c) => c.status === 'active').length
  const pageInactiveTotal  = companies.filter((c) => c.status === 'inactive').length
  const pageTerminatedTotal = companies.filter((c) => c.status === 'terminated').length

  // Persist filters to sessionStorage (gồm cả bộ lọc header cột: colFilters + sortState)
  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      search, statusFilter, btFilter, staffFilter, page, limit,
      colFilters: serializeColFilters(colFilters), sortState,
    }))
  }, [search, statusFilter, btFilter, staffFilter, page, limit, colFilters, sortState])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter/limit change
  useEffect(() => { setPage(1) }, [statusFilter, btFilter, staffFilter, limit, colFilters, sortState])

  // Load enums + custom table defs (staff list đã chuyển sang React Query hook)
  useEffect(() => {
    loadEnums()
    // Nạp cho cả admin lẫn staff — bảng tuỳ chỉnh cũng là dữ liệu công ty (rows đã scope theo công ty khi xuất)
    companyTablesApi.listDefs({ activeOnly: true }).then(setCustomDefs).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Live sync: làm mới cache khi bất kỳ ai tạo/sửa/xoá công ty
  useDataSync('data:company', () => queryClient.invalidateQueries({ queryKey: ['companies', 'list'] }), [])

  // ── Companies list — React Query (cache theo bộ lọc + dedup + giữ data cũ khi đổi filter) ──
  // Tải toàn bộ theo bộ lọc thô, rồi column-filter + phân trang phía client (docs/018).
  const listParams = useMemo(() => ({
    page: 1,
    limit: 1000,
    status:          statusFilter.length > 0 ? statusFilter.join(',') : undefined,
    businessType:    btFilter.length     > 0 ? btFilter.join(',')     : undefined,
    search:          search || undefined,
    assignedStaffId: isAdmin ? (staffFilter.length > 0 ? staffFilter.join(',') : undefined) : currentUser?.id,
  }), [statusFilter, btFilter, staffFilter, search, isAdmin, currentUser?.id])

  const listQuery = useQuery({
    queryKey: ['companies', 'list', listParams],
    queryFn: () => companiesApi.listCompanies(listParams),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const loading = listQuery.isFetching
  const error = listQuery.isError ? 'Không thể tải danh sách khách hàng' : null

  // Sync kết quả query → local state (để optimistic create/delete vẫn hoạt động)
  useEffect(() => {
    if (!listQuery.data) return
    setCompanies(listQuery.data.companies)
    setPagination(listQuery.data.pagination)
  }, [listQuery.data])

  function resetFilters() {
    setSearchInput('')
    setSearch('')
    setStatusFilter([])
    setBtFilter([])
    setStaffFilter([])
    setColFilters({})
    setSortState({ col: null, dir: 'asc' })
    setPage(1)
    sessionStorage.removeItem(FILTER_KEY)
  }

  // ── Bulk selection (admin export) ─────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function selectAllOnPage(checked) {
    setSelectedIds(checked ? new Set(pageRows.map((c) => c.id)) : new Set())
  }

  // ── Client-side column-header filter + sort + pagination (docs/018) ───────────
  const displayed = useMemo(() => {
    let result = [...companies]
    for (const [colKey, filterVal] of Object.entries(colFilters)) {
      const ft = getCompanyColumnFilterType(colKey)
      if (ft === 'enum') {
        if (filterVal instanceof Set && filterVal.size > 0) {
          result = result.filter((row) => filterVal.has(getCompanyDisplayLabel(row, colKey)))
        }
      } else if (ft === 'text') {
        if (typeof filterVal === 'string' && filterVal.trim()) {
          const q = filterVal.toLowerCase()
          result = result.filter((row) => getCompanyDisplayLabel(row, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'numberRange') {
        if (filterVal && (filterVal.min !== '' || filterVal.max !== '')) {
          result = result.filter((row) => {
            const num = Number(row[colKey] ?? 0)
            if (isNaN(num)) return false
            if (filterVal.min !== '' && num < parseFloat(filterVal.min)) return false
            if (filterVal.max !== '' && num > parseFloat(filterVal.max)) return false
            return true
          })
        }
      }
    }
    if (sortState.col) {
      result.sort((a, b) => {
        const ak = getCompanySortKey(a, sortState.col)
        const bk = getCompanySortKey(b, sortState.col)
        if (typeof ak === 'number' && typeof bk === 'number') {
          return sortState.dir === 'asc' ? ak - bk : bk - ak
        }
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [companies, colFilters, sortState])

  const clientTotal      = displayed.length
  const clientTotalPages = Math.max(1, Math.ceil(clientTotal / limit))
  const safePage         = Math.min(page, clientTotalPages)
  const pageRows         = displayed.slice((safePage - 1) * limit, safePage * limit)

  const allPageSelected  = pageRows.length > 0 && pageRows.every((c) => selectedIds.has(c.id))
  const selectedCompanies = companies.filter((c) => selectedIds.has(c.id))
  // Header button: nếu đã tick → xuất các công ty đã chọn; nếu chưa → xuất toàn bộ đang lọc
  const exportTargets = selectedCompanies.length > 0 ? selectedCompanies : companies

  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) setFilterPopup(null)
    else {
      const rect = e.currentTarget.getBoundingClientRect()
      setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
    }
  }
  function handleColFilterChange(colKey, val) {
    setColFilters((prev) => {
      const next = { ...prev }
      if (val === null) delete next[colKey]
      else next[colKey] = val
      return next
    })
  }
  function handleColSort(col, dir) { setSortState({ col, dir }) }
  function hasColFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = getCompanyColumnFilterType(colKey)
    if (t === 'enum')        return f instanceof Set && f.size > 0
    if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length
  const hasColSortActive = sortState.col !== null

  function FilterTh({ colKey, className, children }) {
    const active = hasColFilter(colKey) || sortState.col === colKey
    return (
      <th className={className}>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-hdld-filter-btn
            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
            onClick={(e) => openFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await companiesApi.deleteCompany(deleteTarget.id)
      invalidateRefCompanies(queryClient)   // refresh dropdown công ty ở các trang khác
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

  // Pagination window (client-side)
  const paginationFrom = clientTotal === 0 ? 0 : (safePage - 1) * limit + 1
  const paginationTo   = Math.min(safePage * limit, clientTotal)
  const totalPages     = clientTotalPages
  function pageWindow() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (safePage <= 4) return [1, 2, 3, 4, 5, '…', totalPages]
    if (safePage >= totalPages - 3) return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '…', safePage - 1, safePage, safePage + 1, '…', totalPages]
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
          <div className={s.pageHeaderActions}>
            {/* Staff cũng được xuất — chỉ gồm công ty mình phụ trách (backend đã chốt quyền) */}
            <button className={s.btnOutline} onClick={() => setShowExport(true)} disabled={companies.length === 0}>
              <Download size={14} /> Xuất Excel
            </button>
            {isAdmin && (
              <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Thêm khách hàng
              </button>
            )}
          </div>
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

        {/* Bulk export bar (admin) */}
        {isAdmin && selectedIds.size > 0 && (
          <div className={s.coBulkBar}>
            <span className={s.coBulkCount}>{selectedIds.size} công ty đã chọn</span>
            <span className={s.coBulkSpacer} />
            <button className={s.btnPrimary} onClick={() => setShowExport(true)}>
              <Download size={14} /> Xuất tổng hợp
            </button>
            <button className={s.btnOutline} onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>
          </div>
        )}

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
                    {isAdmin && (
                      <th className={s.coCheckTh}>
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={(e) => selectAllOnPage(e.target.checked)}
                          title="Chọn tất cả trên trang"
                        />
                      </th>
                    )}
                    <FilterTh colKey="name">Tên công ty</FilterTh>
                    <FilterTh colKey="shortName" className={s.tableCellVisible}>Tên viết tắt</FilterTh>
                    <FilterTh colKey="taxCode" className={s.tableCellVisible}>MST</FilterTh>
                    <FilterTh colKey="contactName" className={s.tableContactHead}>Người liên hệ</FilterTh>
                    <FilterTh colKey="assignedStaffName" className={s.tableCellVisible}>Phụ trách</FilterTh>
                    <FilterTh colKey="taskOpenCount" className={s.tableMetricOpenHead}>Việc mở</FilterTh>
                    <FilterTh colKey="taskOverdueCount" className={s.tableMetricOverdueHead}>Quá hạn</FilterTh>
                    <FilterTh colKey="status">Hợp đồng</FilterTh>
                    <th className={s.actionsHead}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} isAdmin={isAdmin} />)
                  ) : displayed.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 10 : 9}>
                        <div className={s.emptyState}>
                          <div className={s.emptyIcon}><Building2 size={26} /></div>
                          <p className={s.emptyTitle}>Không tìm thấy doanh nghiệp</p>
                          <p className={s.emptyDesc}>
                            {(hasActiveFilters || colFilterCount > 0)
                              ? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm.'
                              : 'Chưa có khách hàng nào. Nhấn "+ Thêm khách hàng" để bắt đầu.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((c) => (
                      <CompanyRow
                        key={c.id}
                        company={c}
                        isAdmin={isAdmin}
                        selected={selectedIds.has(c.id)}
                        onToggleSelect={() => toggleSelect(c.id)}
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
              {loading ? '...' : `Hiển thị ${paginationFrom}-${paginationTo} / ${clientTotal} record`}
              {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
              {hasColSortActive && ' · đang sắp xếp'}
            </span>

            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={safePage === 1}>«</button>
              <button className={s.paginationBtn} onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>‹</button>
              {pageWindow().map((n, i) =>
                n === '…' ? (
                  <span key={`sep-${i}`} className={s.paginationEllipsis}>…</span>
                ) : (
                  <button
                    key={n}
                    className={`${s.paginationBtn} ${safePage === n ? s.paginationBtnActive : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )
              )}
              <button className={s.paginationBtn} onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>›</button>
              <button className={s.paginationBtn} onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</button>
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
            invalidateRefCompanies(queryClient)   // công ty mới hiển thị ngay ở dropdown các trang
            setCompanies((prev) => [c, ...prev])
            setPagination((p) => ({ ...p, total: p.total + 1 }))
            addToast(`Đã thêm khách hàng "${c.name}"`, 'success')
          }}
        />
      )}

      {/* Export modal (admin) */}
      {showExport && (
        <CompanyExportModal
          companies={exportTargets}
          customDefs={customDefs}
          onClose={() => setShowExport(false)}
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

      {/* Column-header filter dropdown — position:fixed, outside table scroll */}
      {filterPopup && (
        <CoColumnFilterDropdown
          colKey={filterPopup.colKey}
          allRows={companies}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={handleColSort}
          onFilterChange={handleColFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{
            '--hdld-dd-top':  `${filterPopup.top}px`,
            '--hdld-dd-left': `${filterPopup.left}px`,
          }}
        />
      )}
    </AppLayout>
  )
}

// ── CompanyRow ─────────────────────────────────────────────────────────────────

function CompanyRow({ company, isAdmin, selected, onToggleSelect, onClick, onDelete }) {
  const staff    = company.assignedStaff
  const getLabel = useEnumsStore((st) => st.getLabel)

  return (
    <tr onClick={onClick} className={selected ? s.coRowSelected : ''}>
      {isAdmin && (
        <td className={s.coCheckTd} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        </td>
      )}
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
          <div className={s.companyInfo}>
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
        {company.shortName
          ? <span className={s.shortNameCell}>{company.shortName}</span>
          : <span className={s.muted}>—</span>}
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
      {isAdmin && <td className={s.coCheckTd} />}
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
    shortName:        company?.shortName         ?? '',
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
        shortName:        form.shortName.trim()         || null,
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
            <div className={s.formFullRow}>
              <label className={s.formLabel}>Tên viết tắt</label>
              <input
                type="text"
                value={form.shortName}
                onChange={set('shortName')}
                className={inputCls('shortName')}
                placeholder="VD: ABC Corp, Cty ABC..."
                maxLength={100}
              />
              {fe.shortName && <p className={s.formError}>{fe.shortName}</p>}
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
