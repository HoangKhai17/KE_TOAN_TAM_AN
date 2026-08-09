import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, Paperclip, Download, Upload, Filter } from 'lucide-react'
import * as XLSX from 'xlsx-js-style'
import * as contractsApi from '../../api/contracts'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import { fmtDate } from './companyUtils'
import DateBox from './DateBox'
import AttachmentManagerModal from './AttachmentManagerModal'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import s from './companies.module.css'

const ATTACH_MODULE = 'company_contract'

// type: enum | textarea | date | computed(days, read-only) | status(đặc biệt)
const CONTRACT_COLS = [
  { key: 'contractType',  label: 'Loại',                    type: 'enum', enumType: 'contract_type', width: 120 },
  { key: 'content',       label: 'Nội dung công việc',      type: 'textarea', width: 260 },
  { key: 'startDate',     label: 'Ngày bắt đầu',            type: 'date', width: 115 },
  { key: 'endDate',       label: 'Ngày kết thúc',           type: 'date', width: 115 },
  { key: 'daysRemaining', label: 'Số ngày còn lại theo HĐ', type: 'computed', width: 150 },
  // key = statusOverride: đúng field backend nhận (null=Tự động, 'renewed'/'stopped'=chọn tay)
  { key: 'statusOverride', label: 'Trạng thái',             type: 'status', width: 155 },
]

// 5 trạng thái NHÃN CỐ ĐỊNH gắn công thức (theo yêu cầu — không dùng enum động).
const CONTRACT_STATUS = {
  active:  { label: 'Đang hoạt động',      cls: 'active' },
  renew:   { label: 'Gia hạn hợp đồng',    cls: 'renew' },
  expired: { label: 'Hết hạn hợp đồng',    cls: 'expired' },
  renewed: { label: 'Đã gia hạn hợp đồng', cls: 'renewed' },
  stopped: { label: 'Ngưng dịch vụ',       cls: 'stopped' },
}
const STATUS_CLS = {
  active:  s.contractStActive,  renew:   s.contractStRenew,   expired: s.contractStExpired,
  renewed: s.contractStRenewed, stopped: s.contractStStopped,
}

// ── Công thức số ngày còn lại + trạng thái tự động ──────────────────────────────
function rawDays(endDate) {
  if (!endDate) return null
  const end = new Date(String(endDate).slice(0, 10) + 'T00:00:00')
  if (isNaN(end.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((end - today) / 86400000)
}
// Chọn tay ('renewed'/'stopped') → ẩn số ngày; không có ngày kết thúc → ẩn.
function displayDays(row) {
  if (row.statusOverride || !row.endDate) return null
  return rawDays(row.endDate)
}
// Chọn tay → dùng override; else tự tính từ số ngày; không có ngày kết thúc → null (trống).
function effectiveStatus(row) {
  if (row.statusOverride) return row.statusOverride
  const d = rawDays(row.endDate)
  if (d == null) return null
  if (d < 0) return 'expired'
  if (d <= 45) return 'renew'
  return 'active'
}
function statusLabel(row) {
  const st = effectiveStatus(row)
  return st ? CONTRACT_STATUS[st].label : ''
}

function filterTypeOf(col) {
  if (col.type === 'enum' || col.type === 'status') return 'enum'
  if (col.type === 'date') return 'dateRange'
  if (col.type === 'computed') return 'numberRange'
  return 'text'
}

// ── Filter dropdown sections (tái dùng class hdld*) ─────────────────────────────
function EnumSection({ values, currentFilter, onChange, onClose }) {
  const selected = useMemo(() => (!currentFilter ? new Set(values) : currentFilter), [currentFilter, values])
  const allChecked = selected.size === values.length, noneChecked = selected.size === 0
  const toggle = (v) => { const n = new Set(selected); n.has(v) ? n.delete(v) : n.add(v); onChange(n.size === values.length ? null : n) }
  return (
    <>
      <label className={s.hdldDdSelectAll}>
        <input type="checkbox" checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={() => onChange(allChecked ? new Set() : null)} />
        Chọn tất cả ({values.length})
      </label>
      <div className={s.hdldDdValueList}>
        {values.map((v) => (
          <label key={v} className={s.hdldDdValueItem}>
            <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
            <span className={s.hdldDdValueText}>{v}</span>
          </label>
        ))}
      </div>
      <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn} onClick={() => { onChange(null); onClose() }}>Xoá bộ lọc</button></div>
    </>
  )
}
function TextSection({ currentFilter, onChange }) {
  const [q, setQ] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const ref = useRef(null); useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className={s.hdldDdFilterSection}>
      <input ref={ref} type="text" className={s.hdldDdInput} placeholder="Tìm kiếm..."
        value={q} onChange={(e) => { setQ(e.target.value); onChange(e.target.value.trim() || null) }} />
      {q && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn} onClick={() => { setQ(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function DateRangeSection({ currentFilter, onChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? ''); const [to, setTo] = useState(currentFilter?.to ?? '')
  const apply = (f, t) => onChange(f || t ? { from: f, to: t } : null)
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <DateBox value={from} className={s.hdldDdDateBox}
            onChange={(value) => { setFrom(value); apply(value, to) }} /></div>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <DateBox value={to} className={s.hdldDdDateBox}
            onChange={(value) => { setTo(value); apply(from, value) }} /></div>
      </div>
      {(from || to) && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn} onClick={() => { setFrom(''); setTo(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function NumberRangeSection({ currentFilter, onChange }) {
  const [mn, setMn] = useState(currentFilter?.min ?? ''); const [mx, setMx] = useState(currentFilter?.max ?? '')
  const apply = (a, b) => onChange(a !== '' || b !== '' ? { min: a, max: b } : null)
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Tối thiểu</span>
          <input type="number" className={s.hdldDdInput} placeholder="-∞" value={mn} onChange={(e) => { setMn(e.target.value); apply(e.target.value, mx) }} /></div>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input type="number" className={s.hdldDdInput} placeholder="∞" value={mx} onChange={(e) => { setMx(e.target.value); apply(mn, e.target.value) }} /></div>
      </div>
      {(mn !== '' || mx !== '') && <div className={s.hdldDdFooter}><button className={s.hdldDdClearBtn} onClick={() => { setMn(''); setMx(''); onChange(null) }}>Xoá bộ lọc</button></div>}
    </div>
  )
}
function ColumnFilterDropdown({ col, values, currentFilter, sortState, onSort, onChange, onClose, style }) {
  const ref = useRef(null); const ft = filterTypeOf(col)
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-hdld-filter-btn]')) onClose() }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const asc = sortState.col === col.key && sortState.dir === 'asc', desc = sortState.col === col.key && sortState.dir === 'desc'
  return (
    <div ref={ref} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${asc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.key, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${desc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.key, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {ft === 'enum'        && <EnumSection values={values} currentFilter={currentFilter} onChange={onChange} onClose={onClose} />}
      {ft === 'text'        && <TextSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'dateRange'   && <DateRangeSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'numberRange' && <NumberRangeSection currentFilter={currentFilter} onChange={onChange} />}
    </div>
  )
}

// ── Ô nhập inline cho hợp đồng ─────────────────────────────────────────────────
function ContractCell({ col, row, value, enumOpts, getLabel, canEdit, active, onActivate, onSave, onNavigate }) {
  const [local, setLocal] = useState(value ?? '')
  const ref = useRef(null)
  useEffect(() => { setLocal(value ?? '') }, [value])
  useEffect(() => {
    if (!active || !ref.current) return
    ref.current.focus()
    if (col.type === 'textarea' && ref.current.setSelectionRange) {
      const end = String(ref.current.value ?? '').length; ref.current.setSelectionRange(end, end)
    }
  }, [active, col.type])

  // Số ngày còn lại — CHỈ ĐỌC (tự tính)
  if (col.type === 'computed') {
    const d = displayDays(row)
    return <td className={`${s.locCellClip} ${s.locCenter}`}>
      {d == null ? <span className={s.locMuted}>—</span>
        : <span className={d < 0 ? s.contractDaysNeg : ''}>{d}</span>}
    </td>
  }

  // Trạng thái — badge tự tính; click chọn tay (Đã gia hạn / Ngưng dịch vụ) hoặc Tự động
  if (col.type === 'status') {
    const st = effectiveStatus(row)
    if (!canEdit) {
      return <td className={s.locCellClip}>{st ? <span className={`${s.contractStatus} ${STATUS_CLS[st] ?? ''}`}>{CONTRACT_STATUS[st].label}</span> : <span className={s.locMuted}>—</span>}</td>
    }
    return (
      <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
        {active ? (
          <select ref={ref} className={s.archInlineEditInput} value={row.statusOverride ?? ''}
            onChange={(e) => onSave(e.target.value || null)} onBlur={() => onNavigate?.('cancel')} onClick={(e) => e.stopPropagation()}>
            <option value="">↻ Tự động tính lại (Đang HĐ / Gia hạn / Hết hạn)</option>
            <option value="renewed">{CONTRACT_STATUS.renewed.label}</option>
            <option value="stopped">{CONTRACT_STATUS.stopped.label}</option>
          </select>
        ) : (
          st ? <span className={`${s.contractStatus} ${STATUS_CLS[st] ?? ''}`}>{CONTRACT_STATUS[st].label}</span> : <span className={s.locMuted}>—</span>
        )}
      </td>
    )
  }

  // Enum động (Loại) — dropdown getOptions
  if (col.type === 'enum') {
    if (!canEdit) return <td className={s.locCellClip}>{value ? getLabel(col.enumType, value, value) : <span className={s.locMuted}>—</span>}</td>
    return (
      <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
        {active ? (
          <select ref={ref} className={s.archInlineEditInput} value={value ?? ''}
            onChange={(e) => onSave(e.target.value || null)} onBlur={() => onNavigate?.('cancel')} onClick={(e) => e.stopPropagation()}>
            <option value="">— Không chọn —</option>
            {enumOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : (value ? <span className={s.locEnumText}>{getLabel(col.enumType, value, value)}</span> : <span className={s.locMuted}>—</span>)}
      </td>
    )
  }

  // Ngày: mặc định hiển thị chữ trơn dd/mm/yyyy; chỉ mở DateBox khi cell active.
  if (col.type === 'date') {
    if (!canEdit) return <td className={s.locDateText}>{value ? fmtDate(value) : <span className={s.locMuted}>—</span>}</td>
    if (!active) {
      return (
        <td className={`${s.archInlineTdEditable} ${s.locDateText}`} onClick={onActivate}>
          {value ? fmtDate(value) : <span className={s.locMuted}>—</span>}
        </td>
      )
    }
    return (
      <td className={`${s.archInlineTdEditable} ${s.ctblCellActive}`} onClick={(e) => e.stopPropagation()}>
        <DateBox
          value={value ? String(value).slice(0, 10) : ''}
          onChange={(v) => { onSave(v || null); onNavigate?.('cancel') }}
          className={s.locDateBox}
        />
      </td>
    )
  }

  // Textarea (Nội dung)
  function commit() {
    const next = String(local).replace(/[ \t]+$/gm, '').trim()
    if (String(next) === String(value ?? '')) return
    onSave(next === '' ? null : next)
  }
  function handleKey(e) {
    if (e.key === 'Enter' && !(e.altKey || e.shiftKey)) { e.preventDefault(); commit(); onNavigate?.('down') }
    else if (e.key === 'Tab') { e.preventDefault(); commit(); onNavigate?.(e.shiftKey ? 'prev' : 'next') }
    else if (e.key === 'Escape') { setLocal(value ?? ''); onNavigate?.('cancel') }
  }
  if (!canEdit) return <td className={s.locCellClip}>{value ? <span className={s.ctblMultiline}>{String(value)}</span> : <span className={s.locMuted}>—</span>}</td>
  return (
    <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
      {active ? (
        <textarea ref={ref} rows={Math.min(6, Math.max(1, String(local).split('\n').length))}
          value={local} className={`${s.archInlineEditInput} ${s.ctblTextarea}`}
          onChange={(e) => setLocal(e.target.value)} onBlur={() => { commit(); onNavigate?.('cancel') }}
          onClick={(e) => e.stopPropagation()} onKeyDown={handleKey} />
      ) : (value == null || value === '') ? <span className={s.archInlineEmpty}>—</span> : <span className={s.ctblMultiline}>{String(value)}</span>}
    </td>
  )
}

// ── Popup file đính kèm 1 hợp đồng ─────────────────────────────────────────────
function ContractFilesModal({ contract, canEdit, onClose, onChanged }) {
  return (
    <AttachmentManagerModal
      module={ATTACH_MODULE}
      entityId={contract.id}
      title="File đính kèm — hợp đồng"
      canEdit={canEdit}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

export default function CompanyContractsCard({ companyId, canEdit = true }) {
  const confirmDelete = useDeleteConfirm()
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const addToast   = useToastStore((st) => st.toast)

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [filesFor, setFilesFor] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState]   = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [pendingFocus, setPendingFocus] = useState(null)
  const [page, setPage] = useState(1)
  const cardRef = useRef(null)
  const PAGE_SIZE = 20

  useEffect(() => {
    if (!activeCell) return undefined
    function onOut(e) { if (cardRef.current?.contains(e.target)) return; window.setTimeout(() => setActiveCell(null), 0) }
    document.addEventListener('pointerdown', onOut)
    return () => document.removeEventListener('pointerdown', onOut)
  }, [activeCell])

  const enumOptsFor = useCallback((col) => (col.enumType ? getOptions(col.enumType) : []), [getOptions])

  // Nhãn dùng cho lọc/sắp/xuất (bao gồm cột tính toán daysRemaining + status)
  const cellText = useCallback((row, col) => {
    if (col.type === 'status') return statusLabel(row)
    if (col.type === 'computed') { const d = displayDays(row); return d == null ? '' : String(d) }
    const v = row[col.key]
    if (v == null || v === '') return ''
    if (col.type === 'enum') return getLabel(col.enumType, v, v)
    if (col.type === 'date') return fmtDate(v)
    return String(v)
  }, [getLabel])

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await contractsApi.listContracts(companyId)) }
    catch { addToast('Không tải được danh sách hợp đồng', 'error') }
    finally { setLoading(false) }
  }, [companyId, addToast])
  useEffect(() => { load() }, [load])

  const displayed = useMemo(() => {
    let out = [...rows]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const col = CONTRACT_COLS.find((c) => c.key === colKey); if (!col) continue
      const ft = filterTypeOf(col)
      if (ft === 'enum' && fv instanceof Set) out = out.filter((r) => fv.has(cellText(r, col) || '(Trống)'))
      else if (ft === 'text' && typeof fv === 'string') { const q = fv.toLowerCase(); out = out.filter((r) => cellText(r, col).toLowerCase().includes(q)) }
      else if (ft === 'dateRange' && fv) out = out.filter((r) => { const d = r[colKey] ? String(r[colKey]).slice(0, 10) : ''; if (!d) return false; if (fv.from && d < fv.from) return false; if (fv.to && d > fv.to) return false; return true })
      else if (ft === 'numberRange' && fv) out = out.filter((r) => { const n = displayDays(r); if (n == null) return false; if (fv.min !== '' && n < parseFloat(fv.min)) return false; if (fv.max !== '' && n > parseFloat(fv.max)) return false; return true })
    }
    if (sortState.col) {
      const col = CONTRACT_COLS.find((c) => c.key === sortState.col)
      out.sort((a, b) => {
        let ak, bk
        if (col?.type === 'computed') { ak = displayDays(a) ?? Number.MAX_SAFE_INTEGER; bk = displayDays(b) ?? Number.MAX_SAFE_INTEGER; return sortState.dir === 'asc' ? ak - bk : bk - ak }
        ak = col?.type === 'date' ? (a[sortState.col] || '') : cellText(a, col).toLowerCase()
        bk = col?.type === 'date' ? (b[sortState.col] || '') : cellText(b, col).toLowerCase()
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return out
  }, [rows, colFilters, sortState, cellText])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const selection = useRowSelection({ rows: pageRows })
  const canReorder = canEdit && Object.keys(colFilters).length === 0 && sortState.col == null && activeCell == null
  const reorder = useRowReorder({
    rows, setRows, enabled: canReorder,
    onError: () => addToast('Không thể lưu thứ tự hợp đồng', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => previous[index]?.id !== row.id)
      .map(({ row, index }) => contractsApi.updateContract(companyId, row.id, { sortOrder: index }))),
  })
  useEffect(() => { setPage(1) }, [colFilters, sortState])

  async function saveCell(row, colKey, value) {
    if (String(row[colKey] ?? '') === String(value ?? '')) return
    try {
      const updated = await contractsApi.updateContract(companyId, row.id, { [colKey]: value })
      setRows((p) => p.map((r) => r.id === updated.id ? updated : r))
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không lưu được', 'error') }
  }

  async function addRow() {
    try {
      const created = await contractsApi.createContract(companyId, {})
      setRows((p) => [...p, created])
      setColFilters({}); setSortState({ col: null, dir: 'asc' })
      setPendingFocus({ rowId: created.id, colKey: CONTRACT_COLS[0].key })
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thêm được hợp đồng', 'error') }
  }

  useEffect(() => {
    if (!pendingFocus) return
    const idx = displayed.findIndex((r) => r.id === pendingFocus.rowId)
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1)
    setActiveCell({ rowId: pendingFocus.rowId, colKey: pendingFocus.colKey })
    setPendingFocus(null)
  }, [pendingFocus, displayed])   // eslint-disable-line react-hooks/exhaustive-deps

  // Điều hướng chỉ qua các cột NHẬP được (bỏ cột computed)
  const editableCols = CONTRACT_COLS.filter((c) => c.type !== 'computed')
  function navigateCell(rowId, colKey, dir) {
    if (dir === 'cancel') { setActiveCell(null); return }
    const rIdx = displayed.findIndex((r) => r.id === rowId)
    const cIdx = editableCols.findIndex((c) => c.key === colKey)
    if (rIdx < 0 || cIdx < 0) { setActiveCell(null); return }
    const go = (rid, ck) => { const i = displayed.findIndex((r) => r.id === rid); if (i >= 0) setPage(Math.floor(i / PAGE_SIZE) + 1); setActiveCell({ rowId: rid, colKey: ck }) }
    if (dir === 'next') { if (cIdx < editableCols.length - 1) return go(rowId, editableCols[cIdx + 1].key); if (rIdx < displayed.length - 1) return go(displayed[rIdx + 1].id, editableCols[0].key); return addRow() }
    if (dir === 'prev') { if (cIdx > 0) return go(rowId, editableCols[cIdx - 1].key); if (rIdx > 0) return go(displayed[rIdx - 1].id, editableCols[editableCols.length - 1].key); return }
    if (dir === 'down') { if (rIdx < displayed.length - 1) return go(displayed[rIdx + 1].id, colKey); return addRow() }
  }

  async function remove(row) {
    try { await contractsApi.deleteContract(companyId, row.id); setRows((p) => p.filter((r) => r.id !== row.id)); addToast('Đã xoá hợp đồng', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không xoá được hợp đồng', 'error') }
  }
  async function removeSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa hợp đồng dịch vụ', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> hợp đồng đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => contractsApi.deleteContract(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setRows((current) => current.filter((row) => !deleted.has(row.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} hợp đồng`, deleted.size ? 'success' : 'error')
  }

  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) { setFilterPopup(null); return }
    const rect = e.currentTarget.getBoundingClientRect(); setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
  }
  function setColFilter(colKey, val) { setColFilters((p) => { const n = { ...p }; if (val === null) delete n[colKey]; else n[colKey] = val; return n }) }
  function hasFilter(colKey) { const f = colFilters[colKey]; if (f == null) return false; if (f instanceof Set) return f.size > 0; if (typeof f === 'string') return f.length > 0; return !!(f.from || f.to || f.min !== undefined || f.max !== undefined) }
  const enumValuesFor = useCallback((col) => {
    const seen = new Set(), out = []
    for (const r of rows) { const l = cellText(r, col) || '(Trống)'; if (!seen.has(l)) { seen.add(l); out.push(l) } }
    return out.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [rows, cellText])

  function doExport() {
    const header = [...CONTRACT_COLS.map((c) => c.label), 'File đính kèm']
    const aoa = [header, ...displayed.map((r) => [...CONTRACT_COLS.map((c) => cellText(r, c)), r.fileCount > 0 ? `${r.fileCount} file` : ''])]
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = header.map(() => ({ wch: 20 }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'HopDong')
    XLSX.writeFile(wb, `hop_dong_dich_vu_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const importFixedCols = [
    { key: 'contractType', label: 'Loại', type: 'text', example: 'Hợp đồng' },
    { key: 'content', label: 'Nội dung công việc', type: 'text', example: 'Dịch vụ kế toán thuế' },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date', example: '01/01/2026' },
    { key: 'endDate', label: 'Ngày kết thúc', type: 'date', example: '30/06/2026' },
    { key: 'status', label: 'Trạng thái (chỉ: Đã gia hạn hợp đồng / Ngưng dịch vụ)', type: 'text' },
  ]
  function reverseEnum(enumType) { const m = {}; for (const o of getOptions(enumType)) { m[o.label.toLowerCase().trim()] = o.key; m[o.key.toLowerCase()] = o.key } return m }
  async function handleImport(validRows) {
    const revType = reverseEnum('contract_type')
    const d = (v) => (v ? String(v).slice(0, 10) : null)
    const mapStatus = (raw) => {
      const t = String(raw || '').toLowerCase().trim()
      if (!t) return null
      if (t.includes('đã gia hạn') || t === 'renewed') return 'renewed'
      if (t.includes('ngưng') || t === 'stopped') return 'stopped'
      return null   // các trạng thái tự động → để null (tự tính)
    }
    let inserted = 0, failed = 0; const errors = []
    for (const r of validRows) {
      try {
        const ct = r.contractType ? (revType[String(r.contractType).toLowerCase().trim()] ?? undefined) : null
        if (r.contractType && ct === undefined) { failed++; errors.push({ row: r._rowNum, message: `Loại không hợp lệ: "${r.contractType}"` }); continue }
        await contractsApi.createContract(companyId, {
          contractType: ct || null, content: r.content || null,
          startDate: d(r.startDate), endDate: d(r.endDate),
          statusOverride: mapStatus(r.status),
        })
        inserted++
      } catch (err) { failed++; errors.push({ row: r._rowNum, message: err.response?.data?.error?.message ?? 'Lỗi tạo hợp đồng' }) }
    }
    await load()
    return { inserted, failed, errors }
  }

  const colCount = CONTRACT_COLS.length + 5

  return (
    <div ref={cardRef}>
      {canEdit && (
        <div className={s.locHeaderActions} style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className={s.locBtnExport} onClick={doExport} disabled={rows.length === 0}><Download size={13} /> Xuất</button>
          <button className={s.locBtnImport} onClick={() => setShowImport(true)}><Upload size={13} /> Import</button>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={removeSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.locAddBtn} onClick={addRow}><Plus size={13} /> Thêm hợp đồng</button>
        </div>
      )}

      <div className={s.locTableWrap}>
        <div className={s.locTableScroll}>
          <table className={`${s.locTable} ${s.contractTableWide}`}>
            <colgroup>
              <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
              {CONTRACT_COLS.map((col) => (
                <col key={col.key} className={s[`colCt_${col.key}`]} style={{ width: `${col.width}px` }} />
              ))}
              <col className={s.colFiles} />
              <col className={s.colAction} />
            </colgroup>
            <thead>
              <tr>
                <DragHeaderCell />
                <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
                <IndexHeaderCell />
                {CONTRACT_COLS.map((col) => (
                  <th key={col.key}>
                    <div className={s.hdldThInner}>
                      <span className={s.hdldThLabel}>{col.label}</span>
                      <button data-hdld-filter-btn
                        className={`${s.hdldFilterBtn} ${hasFilter(col.key) || sortState.col === col.key ? s.hdldFilterBtnActive : ''}`}
                        onClick={(e) => openFilter(col.key, e)} title="Lọc / Sắp xếp"><Filter size={10} /></button>
                    </div>
                  </th>
                ))}
                <th className={s.locCenter}>File đính kèm</th>
                <th className={s.locCenter}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={colCount} className={s.locEmpty}>Đang tải…</td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={colCount} className={s.locEmpty}>{rows.length === 0 ? 'Chưa có hợp đồng. Nhấn “Thêm hợp đồng”.' : 'Không có dòng khớp bộ lọc.'}</td></tr>
              ) : (
                pageRows.map((r, index) => (
                  <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={canReorder} handleProps={reorder.handleProps(r.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                    <IndexRowCell index={(safePage - 1) * PAGE_SIZE + index + 1} />
                    {CONTRACT_COLS.map((col) => (
                      <ContractCell key={col.key} col={col} row={r} value={r[col.key]}
                        enumOpts={enumOptsFor(col)} getLabel={getLabel} canEdit={canEdit}
                        active={activeCell?.rowId === r.id && activeCell?.colKey === col.key}
                        onActivate={() => canEdit && col.type !== 'computed' && setActiveCell({ rowId: r.id, colKey: col.key })}
                        onSave={(val) => saveCell(r, col.key, val)}
                        onNavigate={(dir) => navigateCell(r.id, col.key, dir)} />
                    ))}
                    <td className={s.locCenter}>
                      <button className={s.locFileBtn} onClick={() => setFilesFor(r)} title="Quản lý file đính kèm">
                        <Paperclip size={13} />{r.fileCount > 0 && <span className={s.locFileCount}>{r.fileCount}</span>}
                      </button>
                    </td>
                    <td className={s.locCenter}>{canEdit && <button className={s.locBtnDelete} onClick={() => remove(r)} title="Xoá"><Trash2 size={13} /></button>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div className={s.paginationBar}>
          <span className={s.paginationInfo}>{displayed.length} hợp đồng · trang {safePage}/{totalPages}</span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={safePage === 1}>«</button>
            <button className={s.paginationBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button key={n} className={`${s.paginationBtn} ${safePage === n ? s.paginationBtnActive : ''}`} onClick={() => setPage(n)}>{n}</button>
            ))}
            <button className={s.paginationBtn} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>›</button>
            <button className={s.paginationBtn} onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>»</button>
          </div>
        </div>
      )}
      {canEdit && !loading && displayed.length > 0 && (
        <p className={s.locHint}>Trạng thái tự tính theo số ngày còn lại; chọn tay “Đã gia hạn” / “Ngưng dịch vụ” sẽ khoá và ẩn số ngày.</p>
      )}

      {filterPopup && (() => {
        const col = CONTRACT_COLS.find((c) => c.key === filterPopup.colKey)
        return (
          <ColumnFilterDropdown col={col}
            values={filterTypeOf(col) === 'enum' ? enumValuesFor(col) : []}
            currentFilter={colFilters[filterPopup.colKey] ?? null}
            sortState={sortState}
            onSort={(c, dir) => { setSortState({ col: c, dir }); setFilterPopup(null) }}
            onChange={(val) => setColFilter(filterPopup.colKey, val)}
            onClose={() => setFilterPopup(null)}
            style={{ '--hdld-dd-top': `${filterPopup.top}px`, '--hdld-dd-left': `${filterPopup.left}px` }} />
        )
      })()}

      {filesFor && (
        <ContractFilesModal contract={filesFor} canEdit={canEdit}
          onClose={() => setFilesFor(null)}
          onChanged={(count) => setRows((p) => p.map((r) => r.id === filesFor.id ? { ...r, fileCount: count } : r))} />
      )}

      {showImport && (
        <ExcelImportModal title="Import hợp đồng dịch vụ" entityLabel="hợp đồng"
          fixedCols={importFixedCols} templateName="mau_hop_dong_dich_vu.xlsx" sheetName="Hợp đồng"
          onImport={handleImport} onClose={() => { setShowImport(false); load() }} />
      )}
    </div>
  )
}
