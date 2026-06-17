import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Plus, Trash2, Filter, Loader2, Download, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import * as api from '../../api/companyTables'
import Modal from '../../components/ui/Modal'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import s from './companies.module.css'

// ── Cell value as plain text (for export/preview) ─────────────────────────────
function cellText(col, row) {
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
    }
    const v = computeDays(col, row); return v ?? ''
  }
  const v = row.data?.[col.colKey]
  return col.dataType === 'date' ? fmtDate(v) : (v ?? '')
}

// ── Export modal: chọn cột + preview (giống flow tab cũ) ──────────────────────
function ExportModal({ def, columns, rows, company, onClose }) {
  // Trường thông tin công ty (giá trị giống nhau mọi dòng) — tùy chọn xuất
  const extraFields = [
    { key: '__row_id',         label: 'ID dòng',           perRow: (r) => r.id },
    { key: '__company_name',   label: 'Tên công ty',       value: company.name ?? '' },
    { key: '__tax_code',       label: 'Mã số thuế',        value: company.taxCode ?? '' },
    { key: '__assigned_staff', label: 'Nhân sự phụ trách', value: company.assignedStaff?.name ?? '' },
  ]
  // Mặc định tick các trường công ty + cột bảng; "ID dòng" để TẮT (chỉ bật khi cần round-trip update)
  const [selected, setSelected] = useState(() => new Set([
    ...extraFields.filter((f) => f.key !== '__row_id').map((f) => f.key),
    ...columns.map((c) => c.colKey),
  ]))
  function toggle(k) { setSelected((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n }) }

  // Thứ tự xuất: STT → trường công ty (đã chọn) → cột bảng (đã chọn)
  const outFields = [
    ...extraFields.filter((f) => selected.has(f.key)),
    ...columns.filter((c) => selected.has(c.colKey)).map((c) => ({ key: c.colKey, label: c.label, col: c })),
  ]
  const cellOf = (f, r) => (f.col ? cellText(f.col, r) : (f.perRow ? f.perRow(r) : f.value))

  function doExport() {
    const header = ['STT', ...outFields.map((f) => f.label)]
    const body = rows.map((r, i) => [i + 1, ...outFields.map((f) => cellOf(f, r))])
    const ws = XLSX.utils.aoa_to_sheet([header, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, def.name.substring(0, 30))
    XLSX.writeFile(wb, `${def.tableKey}_${(company.name || company.id).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    onClose()
  }

  const previewRows = rows.slice(0, 8)
  return (
    <Modal title={`Xuất Excel — ${def.name}`} onClose={onClose} wide>
      <div className={s.modalForm}>
        <div className={s.hdldExportBody}>
          <div className={s.hdldExportSidebar}>
            <div className={s.hdldExportSidebarTitle}>Thông tin công ty</div>
            {extraFields.map((f) => (
              <label key={f.key} className={s.hdldExportFieldItem}>
                <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} />
                <span>{f.label}</span>
              </label>
            ))}
            <div className={s.hdldExportSidebarTitle}>Cột bảng</div>
            {columns.map((c) => (
              <label key={c.colKey} className={s.hdldExportFieldItem}>
                <input type="checkbox" checked={selected.has(c.colKey)} onChange={() => toggle(c.colKey)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <div className={s.hdldExportPreviewPane}>
            <div className={s.hdldExportPreviewTitle}>Xem trước ({Math.min(8, rows.length)} / {rows.length} dòng)</div>
            <div className={s.hdldExportPreviewWrap}>
              {outFields.length === 0 ? (
                <div className={s.hdldExportPreviewEmpty}>Chưa chọn trường nào</div>
              ) : (
                <table className={s.hdldExportPreviewTable}>
                  <thead><tr>{outFields.map((f) => <th key={f.key}>{f.label}</th>)}</tr></thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.id}>{outFields.map((f) => <td key={f.key}>{String(cellOf(f, r) || '—')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        <div className={s.hdldExportFooter}>
          <span className={s.hdldExportCount}>{selected.size} trường · {rows.length} dòng</span>
          <div className={s.modalActions}>
            <button type="button" className={s.btnOutline} onClick={onClose}>Huỷ</button>
            <button type="button" className={s.btnNavy} onClick={doExport} disabled={outFields.length === 0}>
              <Download size={13} /> Xuất Excel
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function todayISO() { return new Date().toISOString().substring(0, 10) }
function daysBetween(fromISO, toISO) {
  const a = new Date(String(fromISO).substring(0, 10))
  const b = new Date(String(toISO).substring(0, 10))
  if (isNaN(a) || isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}
function monthsBetween(fromISO, toISO) {
  const a = new Date(String(fromISO).substring(0, 10))
  const b = new Date(String(toISO).substring(0, 10))
  if (isNaN(a) || isNaN(b)) return null
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) m -= 1   // chưa đủ tháng → trừ 1
  return m
}

// ── Computed engine (Pha 2) ───────────────────────────────────────────────────
function computeDays(col, row) {
  const src = row.data?.[col.computedConfig?.source_col]
  if (!src) return null
  if (col.computedType === 'days_until') return daysBetween(todayISO(), src)
  if (col.computedType === 'days_since') return daysBetween(src, todayISO())
  if (col.computedType === 'months_since') return monthsBetween(src, todayISO())
  return null
}
function resolveBucket(cfg, src) {
  if (!cfg) return { label: '—', tone: 'muted' }
  if (src == null || src === '') return { label: cfg.null_label || '—', tone: cfg.null_tone || 'muted' }
  let metric
  if (cfg.mode === 'days_until')      metric = daysBetween(todayISO(), src)
  else if (cfg.mode === 'days_since') metric = daysBetween(src, todayISO())
  else                                metric = Number(src)
  const buckets = cfg.buckets || []
  for (const b of buckets) {
    if (b.max === null || b.max === undefined || metric <= Number(b.max)) {
      return { label: b.label, tone: b.tone || 'muted' }
    }
  }
  const last = buckets[buckets.length - 1]
  return last ? { label: last.label, tone: last.tone || 'muted' } : { label: '—', tone: 'muted' }
}

const TONE_CLASS = {
  success: s.ctblToneSuccess, warning: s.ctblToneWarning,
  danger: s.ctblToneDanger, info: s.ctblToneInfo, muted: s.ctblToneMuted,
}
const STATUS_ORDER = { danger: 0, warning: 1, info: 2, success: 3, muted: 4 }

// ── Type-driven helpers (docs/018) ────────────────────────────────────────────
function columnFilterType(col) {
  if (col.dataType === 'computed') {
    return col.computedType === 'status_threshold' ? 'enum' : 'numberRange'
  }
  if (col.dataType === 'select') return 'enum'
  if (col.dataType === 'date')   return 'dateRange'
  if (col.dataType === 'number') return 'numberRange'
  return 'text'
}
function displayLabel(row, col) {
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
    }
    const v = computeDays(col, row)
    return v != null ? String(v) : '(Trống)'
  }
  const v = row.data?.[col.colKey]
  if (v == null || v === '') return '(Trống)'
  if (col.dataType === 'date') return fmtDate(v)
  return String(v)
}
function numericValue(row, col) {
  if (col.dataType === 'computed') return computeDays(col, row)
  const v = row.data?.[col.colKey]
  return v == null || v === '' ? null : Number(v)
}
function sortKey(row, col) {
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return STATUS_ORDER[resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).tone] ?? 9
    }
    return computeDays(col, row) ?? Number.MAX_SAFE_INTEGER
  }
  const v = row.data?.[col.colKey]
  if (col.dataType === 'number') return v == null || v === '' ? Number.MAX_SAFE_INTEGER : Number(v)
  if (col.dataType === 'date')   return v ?? ''
  return String(v ?? '').toLowerCase()
}

// ── Column-header filter sub-sections ─────────────────────────────────────────
function EnumSection({ col, allRows, currentFilter, onChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set(); const out = []
    for (const r of allRows) { const l = displayLabel(r, col); if (!seen.has(l)) { seen.add(l); out.push(l) } }
    return out.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [allRows, col])
  const selected = useMemo(() => (!currentFilter ? new Set(allValues) : currentFilter), [currentFilter, allValues])
  const allChecked = selected.size === allValues.length
  const noneChecked = selected.size === 0
  function toggle(v) {
    const next = new Set(selected); next.has(v) ? next.delete(v) : next.add(v)
    onChange(next.size === allValues.length ? null : next)
  }
  return (
    <>
      <label className={s.hdldDdSelectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={() => onChange(allChecked ? new Set() : null)} />
        Chọn tất cả ({allValues.length})
      </label>
      <div className={s.hdldDdValueList}>
        {allValues.map((v) => (
          <label key={v} className={s.hdldDdValueItem}>
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
            <span className={s.hdldDdValueText}>{v}</span>
          </label>
        ))}
      </div>
      <div className={s.hdldDdFooter}>
        <button className={s.hdldDdClearBtn} onClick={() => { onChange(null); onClose() }}>Xoá bộ lọc</button>
      </div>
    </>
  )
}
function TextSection({ currentFilter, onChange }) {
  const [q, setQ] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className={s.hdldDdFilterSection}>
      <input ref={ref} type="text" className={s.hdldDdInput} placeholder="Tìm kiếm..."
        value={q} onChange={(e) => { setQ(e.target.value); onChange(e.target.value.trim() || null) }} />
      {q && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn}
        onClick={() => { setQ(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function DateRangeSection({ currentFilter, onChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to, setTo] = useState(currentFilter?.to ?? '')
  const apply = (f, t) => onChange(f || t ? { from: f, to: t } : null)
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <input type="date" className={s.hdldDdInput} value={from}
            onChange={(e) => { setFrom(e.target.value); apply(e.target.value, to) }} /></div>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <input type="date" className={s.hdldDdInput} value={to}
            onChange={(e) => { setTo(e.target.value); apply(from, e.target.value) }} /></div>
      </div>
      {(from || to) && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn}
        onClick={() => { setFrom(''); setTo(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function NumberRangeSection({ currentFilter, onChange }) {
  const [mn, setMn] = useState(currentFilter?.min ?? '')
  const [mx, setMx] = useState(currentFilter?.max ?? '')
  const apply = (a, b) => onChange(a !== '' || b !== '' ? { min: a, max: b } : null)
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Tối thiểu</span>
          <input type="number" className={s.hdldDdInput} placeholder="0" value={mn}
            onChange={(e) => { setMn(e.target.value); apply(e.target.value, mx) }} /></div>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input type="number" className={s.hdldDdInput} placeholder="∞" value={mx}
            onChange={(e) => { setMx(e.target.value); apply(mn, e.target.value) }} /></div>
      </div>
      {(mn !== '' || mx !== '') && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn}
        onClick={() => { setMn(''); setMx(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function ColumnFilterDropdown({ col, allRows, currentFilter, sortState, onSort, onChange, onClose, style }) {
  const ref = useRef(null)
  const ft = columnFilterType(col)
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-hdld-filter-btn]')) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const asc = sortState.col === col.colKey && sortState.dir === 'asc'
  const desc = sortState.col === col.colKey && sortState.dir === 'desc'
  return (
    <div ref={ref} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${asc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.colKey, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${desc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.colKey, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {ft === 'enum'        && <EnumSection col={col} allRows={allRows} currentFilter={currentFilter} onChange={onChange} onClose={onClose} />}
      {ft === 'text'        && <TextSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'dateRange'   && <DateRangeSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'numberRange' && <NumberRangeSection currentFilter={currentFilter} onChange={onChange} />}
    </div>
  )
}

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditableCell({ col, value, canEdit, onSave }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value ?? '')
  const ref = useRef(null)
  useEffect(() => { setLocal(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit(val) {
    setEditing(false)
    const next = val !== undefined ? val : (col.dataType === 'date' ? local : String(local).trim())
    if (String(next ?? '') === String(value ?? '')) return
    onSave(next === '' ? null : next)
  }

  if (col.dataType === 'select') {
    return (
      <td className={canEdit ? s.archInlineTdEditable : ''}>
        {canEdit ? (
          <select className={s.archInlineEditInput} value={value ?? ''}
            onChange={(e) => onSave(e.target.value || null)}>
            <option value=""></option>
            {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (value || <span className={s.archInlineEmpty}>—</span>)}
      </td>
    )
  }

  return (
    <td className={canEdit ? s.archInlineTdEditable : ''} onClick={() => canEdit && !editing && setEditing(true)}>
      {editing ? (
        <input ref={ref} type={col.dataType === 'number' ? 'number' : col.dataType === 'date' ? 'date' : 'text'}
          value={local} className={s.archInlineEditInput}
          onChange={(e) => setLocal(e.target.value)} onBlur={() => commit()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false) }
          }} />
      ) : (
        (value == null || value === '')
          ? <span className={s.archInlineEmpty}>—</span>
          : (col.dataType === 'date' ? fmtDate(value) : String(value))
      )}
    </td>
  )
}

// ── Resize handle ─────────────────────────────────────────────────────────────
function ResizeHandle({ onResize, onResizeEnd }) {
  const startX = useRef(null)
  function down(e) {
    e.preventDefault(); e.stopPropagation()
    startX.current = e.clientX
    function move(me) { const dx = me.clientX - startX.current; startX.current = me.clientX; onResize(dx) }
    function up() {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      onResizeEnd?.()
    }
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }
  return <span className={s.archColResizeHandle} onMouseDown={down} />
}

const PAGE_SIZE = 20

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomTableTab({ def, company, onDefUpdated }) {
  const companyId = company.id
  const user     = useAuthStore((st) => st.user)
  const addToast = useToastStore((st) => st.toast)
  const isAdmin  = user?.role === 'admin'
  const canEdit  = isAdmin || company.assignedStaffId === user?.id

  const [rows, setRows]                 = useState([])
  const [companyCols, setCompanyCols]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [colFilters, setColFilters]     = useState({})
  const [sortState, setSortState]       = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null)
  const [page, setPage]                 = useState(1)
  const [deletingRow, setDeletingRow]   = useState(null)
  const [showExport, setShowExport]     = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [pageSize, setPageSize]         = useState(PAGE_SIZE)
  const [selectedIds, setSelectedIds]   = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Column widths — GLOBAL (lưu vào company_table_columns.width). Chỉ admin được kéo;
  // kéo 1 chỗ → đồng bộ mọi công ty. Khởi tạo từ def, cập nhật live khi kéo.
  const [colWidths, setColWidths] = useState(() => {
    const init = {}
    for (const c of (def.columns || [])) if (c.width != null) init[c.colKey] = c.width
    return init
  })
  const widthsRef = useRef({})
  function resizeCol(col, dx) {
    setColWidths((prev) => {
      const w = Math.max(70, (prev[col.colKey] ?? col.width ?? 160) + dx)
      widthsRef.current[col.colKey] = w
      return { ...prev, [col.colKey]: w }
    })
  }
  async function commitWidth(col) {
    if (!isAdmin || col.scope !== 'global' || !col.id) return
    const w = widthsRef.current[col.colKey]
    if (w == null) return
    try { await api.updateColumn(col.id, { width: Math.round(w) }); onDefUpdated?.() }
    catch { addToast('Không thể lưu độ rộng cột', 'error') }
  }

  const columns = useMemo(() => {
    const glob = (def.columns || []).filter((c) => c.isActive !== false)
    return [...glob, ...companyCols]
  }, [def.columns, companyCols])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.listRows(companyId, def.id),
      def.allowCompanyColumns ? api.listCompanyColumns(companyId, def.id) : Promise.resolve([]),
    ])
      .then(([r, cc]) => { if (!cancelled) { setRows(r); setCompanyCols(cc); setSelectedIds(new Set()) } })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [companyId, def.id, def.allowCompanyColumns])

  useEffect(() => load(), [load])
  useEffect(() => { setPage(1) }, [colFilters, sortState, pageSize])

  // ── Client filter + sort + pagination ───────────────────────────────────────
  const displayed = useMemo(() => {
    let result = [...rows]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const col = columns.find((c) => c.colKey === colKey)
      if (!col) continue
      const ft = columnFilterType(col)
      if (ft === 'enum' && fv instanceof Set && fv.size > 0) {
        result = result.filter((r) => fv.has(displayLabel(r, col)))
      } else if (ft === 'text' && typeof fv === 'string' && fv.trim()) {
        const q = fv.toLowerCase()
        result = result.filter((r) => displayLabel(r, col).toLowerCase().includes(q))
      } else if (ft === 'dateRange' && fv && (fv.from || fv.to)) {
        result = result.filter((r) => {
          const raw = r.data?.[col.colKey]; if (!raw) return false
          const d = String(raw).substring(0, 10)
          if (fv.from && d < fv.from) return false
          if (fv.to && d > fv.to) return false
          return true
        })
      } else if (ft === 'numberRange' && fv && (fv.min !== '' || fv.max !== '')) {
        result = result.filter((r) => {
          const n = numericValue(r, col)
          if (n == null || isNaN(n)) return false
          if (fv.min !== '' && n < parseFloat(fv.min)) return false
          if (fv.max !== '' && n > parseFloat(fv.max)) return false
          return true
        })
      }
    }
    if (sortState.col) {
      const col = columns.find((c) => c.colKey === sortState.col)
      if (col) result.sort((a, b) => {
        const ak = sortKey(a, col), bk = sortKey(b, col)
        if (typeof ak === 'number' && typeof bk === 'number') return sortState.dir === 'asc' ? ak - bk : bk - ak
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, columns, colFilters, sortState])

  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)

  // ── Filter handlers ──────────────────────────────────────────────────────────
  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) setFilterPopup(null)
    else { const r = e.currentTarget.getBoundingClientRect(); setFilterPopup({ colKey, top: r.bottom + 4, left: r.left }) }
  }
  function setFilter(colKey, val) {
    setColFilters((prev) => { const n = { ...prev }; if (val === null) delete n[colKey]; else n[colKey] = val; return n })
  }
  function hasColFilter(colKey) {
    const f = colFilters[colKey]; if (f == null) return false
    const col = columns.find((c) => c.colKey === colKey); if (!col) return false
    const t = columnFilterType(col)
    if (t === 'enum') return f instanceof Set && f.size > 0
    if (t === 'text') return typeof f === 'string' && f.trim().length > 0
    if (t === 'dateRange') return Boolean(f.from || f.to)
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length

  // ── Row mutations ────────────────────────────────────────────────────────────
  async function addRow() {
    try { const row = await api.createRow(companyId, def.id, {}); setRows((p) => [...p, row]) }
    catch { addToast('Không thể thêm dòng', 'error') }
  }
  async function saveCell(row, colKey, value) {
    try {
      const updated = await api.updateRow(companyId, def.id, row.id, { [colKey]: value })
      setRows((p) => p.map((r) => r.id === updated.id ? updated : r))
    } catch { addToast('Không thể lưu', 'error') }
  }
  async function removeRow(row) {
    setDeletingRow(row.id)
    try { await api.deleteRow(companyId, def.id, row.id); setRows((p) => p.filter((r) => r.id !== row.id)) }
    catch { addToast('Không thể xoá dòng', 'error') }
    finally { setDeletingRow(null) }
  }

  // ── Row multi-select + bulk delete ───────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id))
  const somePageSelected = pageRows.some((r) => selectedIds.has(r.id))
  function toggleSelectAll() {
    setSelectedIds((p) => {
      const n = new Set(p)
      if (allPageSelected) pageRows.forEach((r) => n.delete(r.id))
      else pageRows.forEach((r) => n.add(r.id))
      return n
    })
  }
  async function bulkDelete() {
    if (!selectedIds.size) return
    if (!window.confirm(`Xoá ${selectedIds.size} dòng đã chọn? Không thể hoàn tác.`)) return
    setBulkDeleting(true)
    let done = 0
    for (const id of [...selectedIds]) {
      try { await api.deleteRow(companyId, def.id, id); done++ } catch { /* skip */ }
    }
    setRows((p) => p.filter((r) => !selectedIds.has(r.id)))
    setSelectedIds(new Set())
    setBulkDeleting(false)
    addToast(done > 0 ? `Đã xoá ${done} dòng` : 'Không xoá được dòng nào', done > 0 ? 'success' : 'error')
  }

  // ── Import Excel ─────────────────────────────────────────────────────────────
  const importCols = useMemo(() => {
    const cols = columns.filter((c) => c.dataType !== 'computed').map((c) => ({
      key: c.colKey, label: c.label, required: c.required,
      type: c.dataType === 'number' ? 'number' : c.dataType === 'date' ? 'date' : 'text',
      example: '',
    }))
    // Cột "ID dòng" (tùy chọn) — dùng khi cập nhật theo ID; thêm mới thì để trống
    cols.push({ key: '__id', label: 'ID dòng', required: false, type: 'text', example: '' })
    return cols
  }, [columns])
  const matchKeyOptions = useMemo(
    () => columns.filter((c) => c.dataType !== 'computed').map((c) => ({ value: c.colKey, label: c.label })),
    [columns],
  )
  async function handleImport(validRows, opts = {}) {
    const payload = validRows.map((r) => {
      const d = { _rowNum: r._rowNum }
      if (r.__id) d.__id = r.__id
      for (const c of importCols) if (c.key !== '__id' && r[c.key] !== null && r[c.key] !== undefined) d[c.key] = r[c.key]
      return d
    })
    const res = opts.mode === 'upsert'
      ? await api.upsertRows(companyId, def.id, opts.matchKey || null, payload)
      : await api.batchCreateRows(companyId, def.id, payload)
    load()
    return res
  }

  const colSpan = columns.length + 2 + (canEdit ? 1 : 0) // [check] + STT + columns + actions

  return (
    <div>
      {/* Toolbar */}
      <div className={s.hdldToolbar}>
        {!loading && (
          <span className={s.hdldToolbarCount}>
            {displayed.length}{displayed.length < rows.length && `/${rows.length}`} dòng
            {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
            {sortState.col && ' · đang sắp xếp'}
          </span>
        )}
        {(colFilterCount > 0 || sortState.col) && (
          <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
            onClick={() => { setColFilters({}); setSortState({ col: null, dir: 'asc' }) }}>
            Xoá tất cả bộ lọc
          </button>
        )}
        {canEdit && selectedIds.size > 0 && (
          <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={bulkDelete} disabled={bulkDeleting}>
            {bulkDeleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} color="var(--color-danger)" />}
            Xoá {selectedIds.size} dòng
          </button>
        )}
        <div className={s.hdldToolbarRight}>
          <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={() => setShowExport(true)} disabled={loading || rows.length === 0}>
            <Download size={13} /> Xuất Excel
          </button>
          {canEdit && columns.length > 0 && (
            <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={() => setShowImport(true)}>
              <Upload size={13} /> Nhập Excel
            </button>
          )}
          {canEdit && (
            <button className={`${s.btnNavy} ${s.hdldToolbarBtn}`} onClick={addRow}>
              <Plus size={13} /> Thêm dòng
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.loadingCenter}><Loader2 size={18} className={s.spin} /> Đang tải...</div>
      ) : columns.length === 0 ? (
        <div className={s.emptyState}><p className={s.hdldEmptyText}>Bảng chưa có cột. Admin cấu hình cột trong Cài đặt.</p></div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={`${s.table} ${s.hdldTable}`}>
              <thead>
                <tr>
                  {canEdit && (
                    <th className={s.hdldThStt}>
                      <input type="checkbox" checked={allPageSelected}
                        ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected }}
                        onChange={toggleSelectAll} title="Chọn tất cả trang này" />
                    </th>
                  )}
                  <th className={s.hdldThStt}>STT</th>
                  {columns.map((col) => {
                    const active = hasColFilter(col.colKey) || sortState.col === col.colKey
                    const w = colWidths[col.colKey] ?? col.width ?? undefined
                    return (
                      <th key={col.colKey} className={s.ctblTh} style={w ? { '--hdld-col-w': `${w}px`, width: `${w}px` } : undefined}>
                        <div className={s.hdldThInner}>
                          <span className={s.hdldThLabel}>{col.label}{col.required && ' *'}</span>
                          <button data-hdld-filter-btn
                            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
                            onClick={(e) => openFilter(col.colKey, e)} title="Lọc / Sắp xếp">
                            <Filter size={10} />
                          </button>
                        </div>
                        {isAdmin && <ResizeHandle onResize={(dx) => resizeCol(col, dx)} onResizeEnd={() => commitWidth(col)} />}
                      </th>
                    )
                  })}
                  <th className={s.actionsHead} />
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr><td colSpan={colSpan} className={s.hdldEmptyRow}>
                    {(colFilterCount > 0) ? 'Không có dòng khớp bộ lọc.' : 'Chưa có dữ liệu. Nhấn "Thêm dòng".'}
                  </td></tr>
                ) : pageRows.map((row, idx) => (
                  <tr key={row.id}>
                    {canEdit && (
                      <td className={s.hdldCellStt} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} />
                      </td>
                    )}
                    <td className={s.hdldCellStt}>{(safePage - 1) * pageSize + idx + 1}</td>
                    {columns.map((col) => {
                      if (col.dataType === 'computed') {
                        if (col.computedType === 'status_threshold') {
                          const b = resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col])
                          return <td key={col.colKey}><span className={`${s.ctblBadge} ${TONE_CLASS[b.tone] ?? s.ctblToneMuted}`}>{b.label}</span></td>
                        }
                        const v = computeDays(col, row)
                        return <td key={col.colKey}>{v != null ? v : <span className={s.archInlineEmpty}>—</span>}</td>
                      }
                      return (
                        <EditableCell key={col.colKey} col={col} value={row.data?.[col.colKey]}
                          canEdit={canEdit} onSave={(val) => saveCell(row, col.colKey, val)} />
                      )
                    })}
                    <td className={s.cTaskActionCell}>
                      {canEdit && (
                        <button className={`${s.rowActionBtn} ${s.rowActionDanger}`} title="Xoá dòng"
                          disabled={deletingRow === row.id} onClick={() => removeRow(row)}>
                          {deletingRow === row.id ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.archTableFooter}>
            <span className={s.archTableCount}>{displayed.length} dòng</span>
            {totalPages > 1 && (
              <div className={s.archPagination}>
                <button className={s.archPageBtn} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹ Trước</button>
                <span className={s.archPageInfo}>{safePage} / {totalPages}</span>
                <button className={s.archPageBtn} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Tiếp ›</button>
              </div>
            )}
            <div className={s.pageSizeWrap}>
              <span className={s.pageSizeLabel}>Hiển thị:</span>
              {[20, 50, 100].map((n) => (
                <button key={n} className={`${s.pageSizeBtn} ${pageSize === n ? s.pageSizeBtnActive : ''}`} onClick={() => setPageSize(n)}>{n}</button>
              ))}
              <span className={s.pageSizeLabel}>/ trang</span>
            </div>
          </div>
        </div>
      )}

      {filterPopup && (() => {
        const col = columns.find((c) => c.colKey === filterPopup.colKey)
        if (!col) return null
        return (
          <ColumnFilterDropdown
            col={col} allRows={rows}
            currentFilter={colFilters[filterPopup.colKey] ?? null}
            sortState={sortState}
            onSort={(c, d) => setSortState({ col: c, dir: d })}
            onChange={(val) => setFilter(filterPopup.colKey, val)}
            onClose={() => setFilterPopup(null)}
            style={{ '--hdld-dd-top': `${filterPopup.top}px`, '--hdld-dd-left': `${filterPopup.left}px` }}
          />
        )
      })()}

      {showExport && (
        <ExportModal def={def} columns={columns} rows={rows} company={company} onClose={() => setShowExport(false)} />
      )}
      {showImport && (
        <ExcelImportModal
          title={`Nhập Excel — ${def.name}`}
          entityLabel="dòng"
          fixedCols={importCols}
          matchKeyOptions={matchKeyOptions}
          templateName={`${def.tableKey}_template.xlsx`}
          sheetName={def.name.substring(0, 28)}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
