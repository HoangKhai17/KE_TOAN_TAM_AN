import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Trash2, Paperclip, Download, Upload, Filter } from 'lucide-react'
import { exportXlsx } from '../../utils/exportXlsx'
import * as locationsApi from '../../api/locations'
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
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import { matchColFilter, isColFilterActive } from '../../components/ui/columnFilter'
import s from './companies.module.css'

const ATTACH_MODULE = 'company_location'

// Cột bảng địa điểm — type: enum | date | text | textarea
const LOC_COLS = [
  { key: 'locationType',           label: 'Loại GP',        type: 'enum', enumType: 'location_type',     required: true },
  { key: 'name',                   label: 'Tên trụ sở / Địa điểm KD', type: 'textarea' },
  { key: 'taxCode',                label: 'MST',            type: 'text' },
  { key: 'licenseEstablishedDate', label: 'Ngày TL/thay đổi GD', type: 'date' },
  { key: 'address',                label: 'Địa chỉ',        type: 'textarea' },
  { key: 'accountingForm',         label: 'PP hạch toán',   type: 'enum', enumType: 'accounting_form' },
  { key: 'locationFunction',       label: 'Chức năng',      type: 'text' },
  { key: 'status',                 label: 'Trạng thái',     type: 'enum', enumType: 'location_status' },
  { key: 'startDate',              label: 'Ngày bắt đầu',   type: 'date' },
  { key: 'endDate',                label: 'Ngày kết thúc',  type: 'date' },
  { key: 'notes',                  label: 'Ghi chú thay đổi', type: 'textarea' },
]

const STATUS_CLASS = {
  active: s.locStatusActive, suspended: s.locStatusSuspended, terminated: s.locStatusTerminated,
}

function filterTypeOf(col) {
  if (col.type === 'enum') return 'enum'
  if (col.type === 'date') return 'dateRange'
  return 'text'
}

// Dropdown lọc/sắp header cột dùng chung ui/ColumnFilterDropdown (đã thay bản riêng).

// ── Ô nhập inline (enum/date/text/textarea) — click để sửa, blur/Enter tự lưu ──
function LocEditableCell({ col, row: _row, value, enumOpts, getLabel, canEdit, active, onActivate, onSave, onNavigate }) {
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
  return (
    <AttachmentManagerModal
      module={ATTACH_MODULE}
      entityId={location.id}
      title={`File đính kèm — ${location.name || 'địa điểm'}`}
      canEdit={canEdit}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

export default function CompanyLocationsCard({ companyId, canEdit = true }) {
  const confirmDelete = useDeleteConfirm()
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

  // Nhãn cho bộ lọc header (enum: ô trống → '(Trống)'). Dùng cho dropdown chung + so khớp.
  const getColLabel = useCallback((row, colKey) => {
    const col = LOC_COLS.find((c) => c.key === colKey)
    if (!col) return ''
    const t = cellText(row, col)
    return col.type === 'enum' ? (t || '(Trống)') : t
  }, [cellText])

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
      if (!isColFilterActive(fv, ft)) continue
      out = out.filter((r) => matchColFilter(fv, ft, {
        label: getColLabel(r, colKey),
        date:  r[colKey],
      }))
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
  const selection = useRowSelection({ rows: pageRows })
  const canReorder = canEdit && Object.keys(colFilters).length === 0 && sortState.col == null && activeCell == null
  const reorder = useRowReorder({
    rows, setRows, enabled: canReorder,
    onError: () => addToast('Không thể lưu thứ tự địa điểm', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => previous[index]?.id !== row.id)
      .map(({ row, index }) => locationsApi.updateLocation(companyId, row.id, { sortOrder: index }))),
  })
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
  async function removeSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa địa điểm', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> địa điểm đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => locationsApi.deleteLocation(companyId, id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setRows((current) => current.filter((row) => !deleted.has(row.id)))
    selection.remove(deleted)
    addToast(`Đã xoá ${deleted.size}/${ids.length} địa điểm`, deleted.size ? 'success' : 'error')
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
    const col = LOC_COLS.find((c) => c.key === colKey)
    return col ? isColFilterActive(colFilters[colKey], filterTypeOf(col)) : false
  }

  // ── Export Excel (dùng chung: backend format chuẩn) ─────────────────────────────
  async function doExport() {
    const exCols = [
      ...LOC_COLS.map((c) => ({ label: c.label, type: c.type === 'date' ? 'date' : 'text', width: 18 })),
      { label: 'File đính kèm', type: 'text' },
    ]
    const exRows = displayed.map((r) => [
      ...LOC_COLS.map((c) => (c.type === 'date' ? (r[c.key] ? String(r[c.key]).slice(0, 10) : '') : cellText(r, c))),
      r.fileCount > 0 ? `${r.fileCount} file` : '',
    ])
    try {
      await exportXlsx({ filename: `dia_diem_kinh_doanh_${new Date().toISOString().slice(0, 10)}`, sheets: [{ name: 'Địa điểm kinh doanh', columns: exCols, rows: exRows }] })
    } catch (e) { addToast(e.response?.data?.error?.message ?? 'Xuất Excel thất bại', 'error') }
  }

  // ── Import (nhãn tiếng Việt → option_key) ────────────────────────────────────
  const importFixedCols = [
    { key: 'locationType', label: 'Loại GP', required: true, type: 'text', example: 'Văn phòng đại diện' },
    { key: 'name', label: 'Tên trụ sở / Địa điểm KD', type: 'text', example: 'Chi nhánh 1' },
    { key: 'taxCode', label: 'MST', type: 'text', example: '0312345678-001' },
    { key: 'licenseEstablishedDate', label: 'Ngày TL/thay đổi GD', type: 'date', example: '01/04/2026' },
    { key: 'address', label: 'Địa chỉ', type: 'text' },
    { key: 'accountingForm', label: 'PP hạch toán', type: 'text', example: 'Phụ thuộc' },
    { key: 'locationFunction', label: 'Chức năng', type: 'text', example: 'Địa điểm làm việc' },
    { key: 'status', label: 'Trạng thái', type: 'text', example: 'Đang hoạt động' },
    { key: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
    { key: 'endDate', label: 'Ngày kết thúc', type: 'date' },
    { key: 'notes', label: 'Ghi chú thay đổi', type: 'text' },
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

  const colCount = LOC_COLS.length + 5   // controls + File + Thao tác

  return (
    <div ref={cardRef}>
      {canEdit && (
        <div className={s.locHeaderActions} style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className={s.locBtnExport} onClick={doExport} disabled={rows.length === 0}>
            <Download size={13} /> Xuất
          </button>
          <button className={s.locBtnImport} onClick={() => setShowImport(true)}>
            <Upload size={13} /> Import
          </button>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={removeSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.locAddBtn} onClick={addRow}>
            <Plus size={13} /> Thêm địa điểm
          </button>
        </div>
      )}

        <div className={s.locTableWrap}>
          <div className={s.locTableScroll}>
          <table className={`${s.locTable} ${s.locTableWide}`}>
            <colgroup>
              <col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} />
              {LOC_COLS.map((col) => <col key={col.key} className={s[`colLoc_${col.key}`]} />)}
              <col className={s.colFiles} />
              <col className={s.colAction} />
            </colgroup>
            <thead>
              <tr>
                <DragHeaderCell />
                <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
                <IndexHeaderCell />
                {LOC_COLS.map((col) => (
                  <th key={col.key}>
                    <div className={s.hdldThInner}>
                      <span className={s.hdldThLabel}>{col.label}</span>
                      <button data-hdld-filter-btn data-colfilter-btn
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
                pageRows.map((r, index) => (
                  <tr key={r.id} {...reorder.rowProps(r.id)} className={reorder.dragOverId === r.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={canReorder} handleProps={reorder.handleProps(r.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(r.id)} onToggle={() => selection.toggle(r.id)} />
                    <IndexRowCell index={(safePage - 1) * PAGE_SIZE + index + 1} />
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

      {filterPopup && (() => {
        const col = LOC_COLS.find((c) => c.key === filterPopup.colKey)
        return (
          <ColumnFilterDropdown
            colKey={col.key}
            filterType={filterTypeOf(col)}
            allRows={rows}
            getDisplayLabel={getColLabel}
            currentFilter={colFilters[filterPopup.colKey] ?? null}
            sortState={sortState}
            onSort={(c, dir) => { setSortState(dir ? { col: c, dir } : { col: null, dir: 'asc' }); setFilterPopup(null) }}
            onFilterChange={(_k, val) => setColFilter(filterPopup.colKey, val)}
            onClose={() => setFilterPopup(null)}
            style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }}
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
