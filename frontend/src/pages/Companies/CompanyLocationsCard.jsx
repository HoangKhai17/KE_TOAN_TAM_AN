import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MapPin, Plus, Trash2, Loader2, Paperclip, Download, Upload, Filter } from 'lucide-react'
import * as XLSX from 'xlsx-js-style'
import * as locationsApi from '../../api/locations'
import * as attachmentsApi from '../../api/attachments'
import Modal from '../../components/ui/Modal'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import { fmtDate } from './companyUtils'
import DateBox from './DateBox'
import s from './companies.module.css'

const ATTACH_MODULE = 'company_location'

// Cột bảng địa điểm — type: enum | date | text | textarea
const LOC_COLS = [
  { key: 'locationType',           label: 'Loại GP',        type: 'enum', enumType: 'location_type',     required: true },
  { key: 'name',                   label: 'Tên trụ sở / Địa điểm KD', type: 'textarea' },
  { key: 'taxCode',                label: 'MST',            type: 'text' },
  { key: 'licenseEstablishedDate', label: 'Ngày thành lập', type: 'date' },
  { key: 'address',                label: 'Địa chỉ',        type: 'textarea' },
  { key: 'accountingForm',         label: 'PP hạch toán',   type: 'enum', enumType: 'accounting_form' },
  { key: 'locationFunction',       label: 'Chức năng',      type: 'text' },
  { key: 'status',                 label: 'Trạng thái',     type: 'enum', enumType: 'location_status' },
  { key: 'startDate',              label: 'Ngày bắt đầu',   type: 'date' },
  { key: 'endDate',                label: 'Ngày kết thúc',  type: 'date' },
  { key: 'notes',                  label: 'Ghi chú',        type: 'textarea' },
]

const STATUS_CLASS = {
  active: s.locStatusActive, suspended: s.locStatusSuspended, terminated: s.locStatusTerminated,
}

function filterTypeOf(col) {
  if (col.type === 'enum') return 'enum'
  if (col.type === 'date') return 'dateRange'
  return 'text'
}

// ── Filter dropdown sections (tái dùng class hdld* trong companies.module.css) ──
function EnumSection({ values, currentFilter, onChange, onClose }) {
  const selected = useMemo(() => (!currentFilter ? new Set(values) : currentFilter), [currentFilter, values])
  const allChecked  = selected.size === values.length
  const noneChecked = selected.size === 0
  function toggle(v) {
    const next = new Set(selected); next.has(v) ? next.delete(v) : next.add(v)
    onChange(next.size === values.length ? null : next)
  }
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
function ColumnFilterDropdown({ col, values, currentFilter, sortState, onSort, onChange, onClose, style }) {
  const ref = useRef(null)
  const ft = filterTypeOf(col)
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest('[data-hdld-filter-btn]')) onClose()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])
  const asc = sortState.col === col.key && sortState.dir === 'asc'
  const desc = sortState.col === col.key && sortState.dir === 'desc'
  return (
    <div ref={ref} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${asc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.key, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${desc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.key, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {ft === 'enum'      && <EnumSection values={values} currentFilter={currentFilter} onChange={onChange} onClose={onClose} />}
      {ft === 'text'      && <TextSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'dateRange' && <DateRangeSection currentFilter={currentFilter} onChange={onChange} />}
    </div>
  )
}

// ── Ô nhập inline (enum/date/text/textarea) — click để sửa, blur/Enter tự lưu ──
function LocEditableCell({ col, row, value, enumOpts, getLabel, canEdit, active, onActivate, onSave, onNavigate }) {
  const [local, setLocal] = useState(value ?? '')
  const ref = useRef(null)
  const isTextType = col.type === 'text' || col.type === 'textarea'
  useEffect(() => { setLocal(value ?? '') }, [value])
  useEffect(() => {
    if (!active || !ref.current) return
    ref.current.focus()
    if ((col.type === 'text' || col.type === 'textarea') && ref.current.setSelectionRange) {
      const end = String(ref.current.value ?? '').length
      ref.current.setSelectionRange(end, end)
    }
    if (col.type === 'textarea') {
      ref.current.style.height = '0px'
      ref.current.style.height = `${ref.current.scrollHeight}px`
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [active, col.type])

  function commit(val) {
    const next = val !== undefined ? val : (isTextType ? String(local).replace(/[ \t]+$/gm, '').trim() : local)
    if (String(next ?? '') === String(value ?? '')) return
    onSave(next === '' ? null : next)
  }
  function handleKey(e) {
    if (e.key === 'Enter') {
      if (col.type === 'textarea' && (e.altKey || e.shiftKey)) return   // xuống dòng trong ô
      e.preventDefault(); commit(); onNavigate?.('down'); return
    }
    if (e.key === 'Tab')    { e.preventDefault(); commit(); onNavigate?.(e.shiftKey ? 'prev' : 'next'); return }
    if (e.key === 'Escape') { setLocal(value ?? ''); onNavigate?.('cancel') }
  }

  // Enum: mặc định hiển thị như text; chỉ hiện dropdown khi ô được kích hoạt.
  if (col.type === 'enum') {
    if (!canEdit) {
      return <td className={s.locCellClip}>{value ? getLabel(col.enumType, value, value) : <span className={s.locMuted}>—</span>}</td>
    }
    if (col.key === 'status') {
      // Trạng thái vẫn hiện badge màu khi không active; click để đổi
      return (
        <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
          {active ? (
            <select ref={ref} className={s.archInlineEditInput} value={value ?? ''}
              onChange={(e) => onSave(e.target.value || null)} onKeyDown={handleKey} onBlur={() => onNavigate?.('cancel')}>
              {enumOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          ) : (
            <span className={`${s.locStatus} ${STATUS_CLASS[value] ?? ''}`}>{getLabel(col.enumType, value, value)}</span>
          )}
        </td>
      )
    }
    return (
      <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
        {active ? (
          <select ref={ref} className={s.archInlineEditInput} value={value ?? ''}
            onChange={(e) => onSave(e.target.value || null)} onKeyDown={handleKey}
            onBlur={() => onNavigate?.('cancel')} onClick={(e) => e.stopPropagation()}>
            {!col.required && <option value="">— Không chọn —</option>}
            {enumOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        ) : (
          value
            ? <span className={s.locEnumText}>{getLabel(col.enumType, value, value)}</span>
            : <span className={s.locMuted}>—</span>
        )}
      </td>
    )
  }

  // Ngày: LUÔN dùng DateBox (hiển thị dd/mm/yyyy, không phụ thuộc locale trình duyệt),
  // chọn xong lưu ngay. Không dùng <input type="date"> native vì hay hiện mm/dd/yyyy.
  if (col.type === 'date') {
    if (!canEdit) {
      return <td className={s.locDateText}>{value ? fmtDate(value) : <span className={s.locMuted}>—</span>}</td>
    }
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

  if (!canEdit) {
    return <td className={s.locCellClip}>{(value == null || value === '') ? <span className={s.locMuted}>—</span>
      : (col.type === 'textarea' ? <span className={s.ctblMultiline}>{String(value)}</span> : String(value))}</td>
  }

  return (
    <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''} ${col.type === 'textarea' ? '' : s.locCellClip}`} onClick={onActivate}>
      {active ? (
        col.type === 'textarea' ? (
          <textarea ref={ref} rows={1} wrap="soft"
            value={local} className={`${s.archInlineEditInput} ${s.ctblTextarea}`}
            onChange={(e) => {
              setLocal(e.target.value)
              e.target.style.height = '0px'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onBlur={() => { commit(); onNavigate?.('cancel') }}
            onClick={(e) => e.stopPropagation()} onKeyDown={handleKey} />
        ) : (
          <input ref={ref} type="text" value={local}
            className={s.archInlineEditInput}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => { commit(); onNavigate?.('cancel') }}
            onClick={(e) => e.stopPropagation()} onKeyDown={handleKey} />
        )
      ) : (
        (value == null || value === '')
          ? <span className={s.archInlineEmpty}>—</span>
          : (col.type === 'textarea' ? <span className={s.ctblMultiline}>{String(value)}</span> : String(value))
      )}
    </td>
  )
}

// ── Popup quản lý file đính kèm của MỘT địa điểm ────────────────────────────────
function LocationFilesModal({ location, canEdit, onClose, onChanged }) {
  const addToast = useToastStore((st) => st.toast)
  const [files, setFiles]     = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const f = await attachmentsApi.listFiles(ATTACH_MODULE, location.id); setFiles(f); return f }
    catch { addToast('Không tải được danh sách file', 'error'); return null }
    finally { setLoading(false) }
  }, [location.id, addToast])
  useEffect(() => { load() }, [load])

  async function onPick(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    if (file.size > attachmentsApi.MAX_FILE_BYTES) {
      addToast(`File quá lớn (tối đa ${attachmentsApi.formatSize(attachmentsApi.MAX_FILE_BYTES)})`, 'error'); return
    }
    setUploading(true)
    try {
      await attachmentsApi.uploadFile(ATTACH_MODULE, location.id, file)
      addToast('Đã tải file lên', 'success'); const f = await load(); onChanged?.(f?.length ?? 0)
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Tải file thất bại', 'error') }
    finally { setUploading(false) }
  }
  async function remove(f) {
    try { await attachmentsApi.deleteFile(f.id); addToast('Đã xoá file', 'success'); const arr = await load(); onChanged?.(arr?.length ?? 0) }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không xoá được file', 'error') }
  }

  return (
    <Modal title={`File đính kèm — ${location.name || 'địa điểm'}`} onClose={onClose}>
      {loading ? (
        <div className={s.locFileEmpty}><Loader2 size={16} className={s.spin} /> Đang tải…</div>
      ) : files.length === 0 ? (
        <div className={s.locFileEmpty}>Chưa có file đính kèm.</div>
      ) : (
        <div className={s.locFileList}>
          {files.map((f) => (
            <div key={f.id} className={s.locFileRow}>
              <Paperclip size={14} className={s.locMuted} />
              <span className={s.locFileName} title={f.fileName}>{f.fileName}</span>
              <span className={s.locFileSize}>{attachmentsApi.formatSize(f.sizeBytes)}</span>
              <button className={s.locFileIconBtn} title="Tải xuống" onClick={() => attachmentsApi.downloadFile(f.id, f.fileName)}>
                <Download size={14} />
              </button>
              {canEdit && (
                <button className={`${s.locFileIconBtn} ${s.locFileIconDanger}`} title="Xoá" onClick={() => remove(f)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <input ref={fileRef} type="file" accept={attachmentsApi.ACCEPT_ATTR} className={s.hiddenInput} onChange={onPick} />
          <button className={s.locFileBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 size={13} className={s.spin} /> : <Upload size={13} />}
            {uploading ? 'Đang tải lên…' : 'Tải file lên'}
          </button>
        </>
      )}
    </Modal>
  )
}

export default function CompanyLocationsCard({ companyId, canEdit = true }) {
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const addToast   = useToastStore((st) => st.toast)

  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [filesFor, setFilesFor] = useState(null)
  const [activeCell, setActiveCell] = useState(null)   // { rowId, colKey }
  const [colFilters, setColFilters] = useState({})
  const [sortState, setSortState]   = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null) // { colKey, top, left }
  const [showImport, setShowImport] = useState(false)
  const [pendingFocus, setPendingFocus] = useState(null)
  const [page, setPage] = useState(1)
  const cardRef = useRef(null)

  // Thoát chế độ sửa khi người dùng bấm ra ngoài card. Trì hoãn một nhịp để
  // onBlur của input/textarea kịp lưu giá trị trước khi editor bị đóng.
  useEffect(() => {
    if (!activeCell) return undefined
    function handleOutsidePointer(e) {
      if (cardRef.current?.contains(e.target)) return
      window.setTimeout(() => setActiveCell(null), 0)
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [activeCell])

  const enumOptsFor = useCallback((col) => (col.enumType ? getOptions(col.enumType) : []), [getOptions])

  // Nhãn hiển thị dùng cho lọc/sắp/xuất
  const cellText = useCallback((row, col) => {
    const v = row[col.key]
    if (v == null || v === '') return ''
    if (col.type === 'enum') return getLabel(col.enumType, v, v)
    if (col.type === 'date') return fmtDate(v)
    return String(v)
  }, [getLabel])

  // 1 query duy nhất (file_count đã gộp ở backend) → KHÔNG còn N+1 đếm file từng dòng.
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await locationsApi.listLocations(companyId)) }
    catch { addToast('Không tải được danh sách địa điểm', 'error') }
    finally { setLoading(false) }
  }, [companyId, addToast])
  useEffect(() => { load() }, [load])

  const PAGE_SIZE = 20

  // ── Lọc + sắp xếp phía client ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let out = [...rows]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const col = LOC_COLS.find((c) => c.key === colKey); if (!col) continue
      const ft = filterTypeOf(col)
      if (ft === 'enum' && fv instanceof Set) {
        out = out.filter((r) => fv.has(cellText(r, col) || '(Trống)'))
      } else if (ft === 'text' && typeof fv === 'string') {
        const q = fv.toLowerCase(); out = out.filter((r) => cellText(r, col).toLowerCase().includes(q))
      } else if (ft === 'dateRange' && fv) {
        out = out.filter((r) => { const d = r[colKey] ? String(r[colKey]).slice(0, 10) : ''
          if (!d) return false; if (fv.from && d < fv.from) return false; if (fv.to && d > fv.to) return false; return true })
      }
    }
    if (sortState.col) {
      const col = LOC_COLS.find((c) => c.key === sortState.col)
      out.sort((a, b) => {
        const ak = col?.type === 'date' ? (a[sortState.col] || '') : cellText(a, col).toLowerCase()
        const bk = col?.type === 'date' ? (b[sortState.col] || '') : cellText(b, col).toLowerCase()
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return out
  }, [rows, colFilters, sortState, cellText])

  // ── Phân trang phía client ───────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayed.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [colFilters, sortState])   // đổi lọc/sắp → về trang 1

  // ── Inline edit: lưu từng ô ──────────────────────────────────────────────────
  async function saveCell(row, colKey, value) {
    const col = LOC_COLS.find((c) => c.key === colKey)
    if (col?.required && !value) { addToast('Trường bắt buộc, không được để trống', 'error'); return }
    if (String(row[colKey] ?? '') === String(value ?? '')) return
    try {
      const updated = await locationsApi.updateLocation(companyId, row.id, { [colKey]: value })
      setRows((p) => p.map((r) => r.id === updated.id ? updated : r))
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không lưu được', 'error') }
  }

  async function addRow() {
    const firstType = getOptions('location_type')[0]?.key
    if (!firstType) { addToast('Chưa có danh mục "Loại GP" trong Cài đặt', 'error'); return }
    try {
      const created = await locationsApi.createLocation(companyId, { locationType: firstType, status: 'active' })
      setRows((p) => [...p, created])
      setColFilters({}); setSortState({ col: null, dir: 'asc' })
      setPendingFocus({ rowId: created.id, colKey: LOC_COLS[0].key })
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không thêm được địa điểm', 'error') }
  }

  useEffect(() => {
    if (!pendingFocus) return
    const idx = displayed.findIndex((r) => r.id === pendingFocus.rowId)
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1)   // nhảy đúng trang chứa dòng mới
    setActiveCell({ rowId: pendingFocus.rowId, colKey: pendingFocus.colKey })
    setPendingFocus(null)
  }, [pendingFocus, displayed])   // eslint-disable-line react-hooks/exhaustive-deps

  function navigateCell(rowId, colKey, dir) {
    if (dir === 'cancel') { setActiveCell(null); return }
    const rIdx = displayed.findIndex((r) => r.id === rowId)
    const cIdx = LOC_COLS.findIndex((c) => c.key === colKey)
    if (rIdx < 0 || cIdx < 0) { setActiveCell(null); return }
    const go = (rid, ck) => {
      const idx = displayed.findIndex((r) => r.id === rid)
      if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1)   // sang ô ở trang khác → tự chuyển trang
      setActiveCell({ rowId: rid, colKey: ck })
    }
    if (dir === 'next') {
      if (cIdx < LOC_COLS.length - 1) return go(rowId, LOC_COLS[cIdx + 1].key)
      if (rIdx < displayed.length - 1) return go(displayed[rIdx + 1].id, LOC_COLS[0].key)
      return addRow()
    }
    if (dir === 'prev') {
      if (cIdx > 0) return go(rowId, LOC_COLS[cIdx - 1].key)
      if (rIdx > 0) return go(displayed[rIdx - 1].id, LOC_COLS[LOC_COLS.length - 1].key)
      return
    }
    if (dir === 'down') {
      if (rIdx < displayed.length - 1) return go(displayed[rIdx + 1].id, colKey)
      return addRow()
    }
  }

  async function remove(row) {
    try { await locationsApi.deleteLocation(companyId, row.id); setRows((p) => p.filter((r) => r.id !== row.id)); addToast('Đã xoá địa điểm', 'success') }
    catch (err) { addToast(err.response?.data?.error?.message ?? 'Không xoá được địa điểm', 'error') }
  }

  // ── Header filter ─────────────────────────────────────────────────────────────
  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) { setFilterPopup(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
  }
  function setColFilter(colKey, val) {
    setColFilters((p) => { const n = { ...p }; if (val === null) delete n[colKey]; else n[colKey] = val; return n })
  }
  function hasFilter(colKey) {
    const f = colFilters[colKey]; if (f == null) return false
    if (f instanceof Set) return f.size > 0
    if (typeof f === 'string') return f.length > 0
    return !!(f.from || f.to)
  }
  const enumValuesFor = useCallback((col) => {
    const seen = new Set(), out = []
    for (const r of rows) { const l = cellText(r, col) || '(Trống)'; if (!seen.has(l)) { seen.add(l); out.push(l) } }
    return out.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [rows, cellText])

  // ── Export Excel ──────────────────────────────────────────────────────────────
  function doExport() {
    const header = [...LOC_COLS.map((c) => c.label), 'File đính kèm']
    const aoa = [header, ...displayed.map((r) => [
      ...LOC_COLS.map((c) => cellText(r, c)),
      r.fileCount > 0 ? `${r.fileCount} file` : '',
    ])]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = header.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'DiaDiem')
    XLSX.writeFile(wb, `dia_diem_kinh_doanh_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Import (nhãn tiếng Việt → option_key) ────────────────────────────────────
  const importFixedCols = [
    { key: 'locationType', label: 'Loại GP', required: true, type: 'text', example: 'Văn phòng đại diện' },
    { key: 'name', label: 'Tên trụ sở / Địa điểm KD', type: 'text', example: 'Chi nhánh 1' },
    { key: 'taxCode', label: 'MST', type: 'text', example: '0312345678-001' },
    { key: 'licenseEstablishedDate', label: 'Ngày thành lập', type: 'date', example: '01/04/2026' },
    { key: 'address', label: 'Địa chỉ', type: 'text' },
    { key: 'accountingForm', label: 'PP hạch toán', type: 'text', example: 'Phụ thuộc' },
    { key: 'locationFunction', label: 'Chức năng', type: 'text', example: 'Địa điểm làm việc' },
    { key: 'status', label: 'Trạng thái', type: 'text', example: 'Đang hoạt động' },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'endDate', label: 'Ngày kết thúc', type: 'date' },
    { key: 'notes', label: 'Ghi chú', type: 'text' },
  ]
  function reverseEnum(enumType) {
    const m = {}
    for (const o of getOptions(enumType)) { m[o.label.toLowerCase().trim()] = o.key; m[o.key.toLowerCase()] = o.key }
    return m
  }
  async function handleImport(validRows) {
    const rev = {
      locationType:     reverseEnum('location_type'),
      accountingForm:   reverseEnum('accounting_form'),
      status:           reverseEnum('location_status'),
    }
    const mapEnum = (kind, raw) => raw ? (rev[kind][String(raw).toLowerCase().trim()] ?? undefined) : null
    const d = (v) => (v ? String(v).slice(0, 10) : null)
    let inserted = 0, failed = 0; const errors = []
    for (const r of validRows) {
      try {
        const lt = mapEnum('locationType', r.locationType)
        if (!lt) { failed++; errors.push({ row: r._rowNum, message: `Loại GP không hợp lệ: "${r.locationType}"` }); continue }
        const af = mapEnum('accountingForm', r.accountingForm)
        if (r.accountingForm && af === undefined) { failed++; errors.push({ row: r._rowNum, message: `PP hạch toán không hợp lệ: "${r.accountingForm}"` }); continue }
        const st = mapEnum('status', r.status)
        if (r.status && st === undefined) { failed++; errors.push({ row: r._rowNum, message: `Trạng thái không hợp lệ: "${r.status}"` }); continue }
        await locationsApi.createLocation(companyId, {
          locationType: lt,
          name: r.name || null, taxCode: r.taxCode || null,
          licenseEstablishedDate: d(r.licenseEstablishedDate),
          address: r.address || null,
          accountingForm: af || null,
          locationFunction: r.locationFunction || null,   // text tự do
          status: st || 'active',
          startDate: d(r.startDate), endDate: d(r.endDate),
          notes: r.notes || null,
        })
        inserted++
      } catch (err) { failed++; errors.push({ row: r._rowNum, message: err.response?.data?.error?.message ?? 'Lỗi tạo địa điểm' }) }
    }
    await load()
    return { inserted, failed, errors }
  }

  const colCount = LOC_COLS.length + 2   // + File + Thao tác

  return (
    <div ref={cardRef} className={s.infoCard}>
      <div className={s.infoCardHeader}>
        <div className={s.infoCardTitle}>
          <div className={`${s.infoCardTitleIcon} ${s.infoCardIconBlue}`}><MapPin size={14} /></div>
          Trụ sở chính / địa điểm kinh doanh
        </div>
        {canEdit && (
          <div className={s.locHeaderActions}>
            <button className={s.locBtnExport} onClick={doExport} disabled={rows.length === 0}>
              <Download size={13} /> Xuất
            </button>
            <button className={s.locBtnImport} onClick={() => setShowImport(true)}>
              <Upload size={13} /> Import
            </button>
            <button className={s.locAddBtn} onClick={addRow}>
              <Plus size={13} /> Thêm địa điểm
            </button>
          </div>
        )}
      </div>

      <div className={s.infoCardBody}>
        <div className={s.locTableWrap}>
          <div className={s.locTableScroll}>
          <table className={`${s.locTable} ${s.locTableWide}`}>
            <colgroup>
              {LOC_COLS.map((col) => <col key={col.key} className={s[`colLoc_${col.key}`]} />)}
              <col className={s.colFiles} />
              <col className={s.colAction} />
            </colgroup>
            <thead>
              <tr>
                {LOC_COLS.map((col) => (
                  <th key={col.key}>
                    <div className={s.hdldThInner}>
                      <span className={s.hdldThLabel}>{col.label}</span>
                      <button data-hdld-filter-btn
                        className={`${s.hdldFilterBtn} ${hasFilter(col.key) || sortState.col === col.key ? s.hdldFilterBtnActive : ''}`}
                        onClick={(e) => openFilter(col.key, e)} title="Lọc / Sắp xếp">
                        <Filter size={10} />
                      </button>
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
                <tr><td colSpan={colCount} className={s.locEmpty}>
                  {rows.length === 0 ? 'Chưa có địa điểm. Nhấn “Thêm địa điểm”.' : 'Không có dòng khớp bộ lọc.'}
                </td></tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id}>
                    {LOC_COLS.map((col) => (
                      <LocEditableCell
                        key={col.key} col={col} row={r} value={r[col.key]}
                        enumOpts={enumOptsFor(col)} getLabel={getLabel} canEdit={canEdit}
                        active={activeCell?.rowId === r.id && activeCell?.colKey === col.key}
                        onActivate={() => canEdit && setActiveCell({ rowId: r.id, colKey: col.key })}
                        onSave={(val) => saveCell(r, col.key, val)}
                        onNavigate={(dir) => navigateCell(r.id, col.key, dir)}
                      />
                    ))}
                    <td className={s.locCenter}>
                      <button className={s.locFileBtn} onClick={() => setFilesFor(r)} title="Quản lý file đính kèm">
                        <Paperclip size={13} />
                        {r.fileCount > 0 && <span className={s.locFileCount}>{r.fileCount}</span>}
                      </button>
                    </td>
                    <td className={s.locCenter}>
                      {canEdit && (
                        <button className={s.locBtnDelete} onClick={() => remove(r)} title="Xoá"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {!loading && totalPages > 1 && (
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>{displayed.length} địa điểm · trang {safePage}/{totalPages}</span>
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
          <p className={s.locHint}>Mẹo: nhấp thẳng vào ô để sửa; Enter/Tab để sang ô kế; ở dòng cuối Enter/Tab tự thêm dòng mới.</p>
        )}
      </div>

      {filterPopup && (() => {
        const col = LOC_COLS.find((c) => c.key === filterPopup.colKey)
        return (
          <ColumnFilterDropdown
            col={col}
            values={filterTypeOf(col) === 'enum' ? enumValuesFor(col) : []}
            currentFilter={colFilters[filterPopup.colKey] ?? null}
            sortState={sortState}
            onSort={(c, dir) => { setSortState({ col: c, dir }); setFilterPopup(null) }}
            onChange={(val) => setColFilter(filterPopup.colKey, val)}
            onClose={() => setFilterPopup(null)}
            style={{ '--hdld-dd-top': `${filterPopup.top}px`, '--hdld-dd-left': `${filterPopup.left}px` }}
          />
        )
      })()}

      {filesFor && (
        <LocationFilesModal location={filesFor} canEdit={canEdit}
          onClose={() => setFilesFor(null)}
          onChanged={(count) => setRows((p) => p.map((r) => r.id === filesFor.id ? { ...r, fileCount: count } : r))} />
      )}

      {showImport && (
        <ExcelImportModal
          title="Import địa điểm kinh doanh"
          entityLabel="địa điểm"
          fixedCols={importFixedCols}
          templateName="mau_dia_diem_kinh_doanh.xlsx"
          sheetName="Địa điểm"
          onImport={handleImport}
          onClose={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
