import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Pencil, Trash2, Download, Loader2, FileSignature, Columns, GripVertical, Filter, Upload } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as cscApi from '../../api/clientSupplierContracts'
import Modal from '../../components/ui/Modal'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import { extractCustomFields } from '../../utils/excelImport'
import s from './companies.module.css'

const CSC_IMPORT_COLS = [
  { key: 'partyName',       label: 'Tên đối tượng',    required: true,  type: 'text', example: 'Công ty ABC' },
  { key: 'contractParty',   label: 'Đối tượng HĐ',     required: false, type: 'text', example: 'Khách hàng' },
  { key: 'contractContent', label: 'Nội dung HĐ',      required: false, type: 'text', example: 'Dịch vụ kế toán' },
  { key: 'contractNumber',  label: 'Số HĐ',            required: false, type: 'text', example: 'HĐ-KH-001' },
  { key: 'contractDate',    label: 'Ngày HĐ',          required: false, type: 'date', example: '2024-01-01' },
  { key: 'endDate',         label: 'Ngày kết thúc',    required: false, type: 'date', example: '2025-12-31' },
  { key: 'notes',           label: 'Ghi chú',          required: false, type: 'text', example: '' },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const MIN_COL_W = 60

const DEFAULT_COL_WIDTHS = {
  contractParty:   130,
  partyName:       180,
  contractContent: 180,
  contractNumber:  130,
  contractDate:    110,
  endDate:         110,
  daysRemaining:    90,
  contractStatus:  130,
  notes:           200,
}
const DEFAULT_CUSTOM_COL_W = 160
const STT_W = 42    // fixed — matches CSS .cscThSttFixed
const ACTIONS_W = 100 // matches CSS .cscThActionsFixed width

const STATUS_LABEL = {
  active:        'Còn hiệu lực',
  expiring_soon: 'Sắp hết hạn',
  expired:       'Đã hết hạn',
  permanent:     'Không thời hạn',
}

const STATUS_CSS = {
  active:        s.hdldStatusActive,
  expiring_soon: s.hdldStatusExpiringSoon,
  expired:       s.hdldStatusExpired,
  permanent:     s.hdldStatusPermanent,
}

const COL_TYPE_LABEL = { text: 'Văn bản', number: 'Số', date: 'Ngày' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getColumnFilterType(colKey, dynColumns = []) {
  if (colKey === 'contractStatus')                          return 'enum'
  if (colKey === 'contractDate' || colKey === 'endDate')    return 'dateRange'
  if (colKey === 'daysRemaining')                           return 'numberRange'
  if (colKey.startsWith('dyn__')) {
    const col = dynColumns.find((c) => c.colName === colKey.slice(5))
    if (col?.colType === 'date')   return 'dateRange'
    if (col?.colType === 'number') return 'numberRange'
  }
  return 'text'
}

function getDisplayLabel(row, colKey) {
  if (colKey.startsWith('dyn__')) {
    const v = row.customFields[colKey.slice(5)]
    return v != null && v !== '' ? String(v) : '(Trống)'
  }
  switch (colKey) {
    case 'contractStatus':
      return STATUS_LABEL[row.contractStatus] ?? row.contractStatus
    case 'contractDate':
      return row.contractDate ? fmtDate(row.contractDate) : '(Trống)'
    case 'endDate':
      return row.endDate ? fmtDate(row.endDate) : '(Trống)'
    case 'daysRemaining':
      return row.daysRemaining !== null ? String(row.daysRemaining) : '(Không xác định)'
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}

function getSortKey(row, colKey) {
  if (colKey.startsWith('dyn__')) return (row.customFields[colKey.slice(5)] ?? '').toLowerCase()
  if (colKey === 'contractDate' || colKey === 'endDate') return row[colKey] ?? ''
  if (colKey === 'daysRemaining') return row.daysRemaining ?? Number.MAX_SAFE_INTEGER
  if (colKey === 'contractStatus') return STATUS_LABEL[row.contractStatus] ?? ''
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}

// ── ResizeHandle — drag to resize column ──────────────────────────────────────

function ResizeHandle({ onResize }) {
  const startX = useRef(null)

  function handleMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(me) {
      const dx = me.clientX - startX.current
      startX.current = me.clientX
      onResize(dx)
    }

    function onUp() {
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  return <span className={s.archColResizeHandle} onMouseDown={handleMouseDown} />
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`${s.hdldStatusBadge} ${STATUS_CSS[status] ?? ''}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── ColumnFilterDropdown sub-sections ────────────────────────────────────────

function EnumFilterSection({ colKey, allRows, currentFilter, onFilterChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set()
    const vals = []
    for (const row of allRows) {
      const lbl = getDisplayLabel(row, colKey)
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
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={toggleAll}
        />
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

function TextFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [q, setQ] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const inputRef  = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className={s.hdldDdFilterSection}>
      <input
        ref={inputRef}
        type="text"
        className={s.hdldDdInput}
        placeholder="Tìm kiếm..."
        value={q}
        onChange={(e) => { setQ(e.target.value); onFilterChange(colKey, e.target.value.trim() || null) }}
      />
      {q && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn} onClick={() => { setQ(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function DateRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to,   setTo  ] = useState(currentFilter?.to   ?? '')

  function apply(f, t) { onFilterChange(colKey, f || t ? { from: f, to: t } : null) }

  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <input type="date" className={s.hdldDdInput} value={from}
            onChange={(e) => { setFrom(e.target.value); apply(e.target.value, to) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <input type="date" className={s.hdldDdInput} value={to}
            onChange={(e) => { setTo(e.target.value); apply(from, e.target.value) }} />
        </div>
      </div>
      {(from || to) && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setFrom(''); setTo(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function NumberRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [minVal, setMinVal] = useState(currentFilter?.min ?? '')
  const [maxVal, setMaxVal] = useState(currentFilter?.max ?? '')

  function apply(mn, mx) {
    onFilterChange(colKey, mn !== '' || mx !== '' ? { min: mn, max: mx } : null)
  }

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

function ColumnFilterDropdown({ colKey, dynColumns, allRows, currentFilter, sortState, onSort, onFilterChange, onClose, style }) {
  const dropRef    = useRef(null)
  const filterType = getColumnFilterType(colKey, dynColumns)

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        if (!e.target.closest('[data-csc-filter-btn]')) onClose()
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
          onClick={() => onSort(colKey, 'asc')}>
          ↑&nbsp; Sắp xếp A → Z
        </button>
        <button className={`${s.hdldDdSortBtn} ${activeDesc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}>
          ↓&nbsp; Sắp xếp Z → A
        </button>
      </div>
      {filterType === 'enum' && (
        <EnumFilterSection colKey={colKey} allRows={allRows} currentFilter={currentFilter}
          onFilterChange={onFilterChange} onClose={onClose} />
      )}
      {filterType === 'text' && (
        <TextFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'dateRange' && (
        <DateRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'numberRange' && (
        <NumberRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
    </div>
  )
}

// ── Export helpers ────────────────────────────────────────────────────────────

function buildExportGroups(dynColumns) {
  return [
    {
      key: 'company',
      label: 'Công ty',
      fields: [
        { key: 'stt',           label: 'STT'          },
        { key: 'companyName',   label: 'Khách hàng'   },
        { key: 'taxCode',       label: 'Mã số thuế'   },
        { key: 'assignedStaff', label: 'Quản lý'      },
      ],
    },
    {
      key: 'contract',
      label: 'Hợp đồng',
      fields: [
        { key: 'contractParty',   label: 'Đối tượng HĐ'  },
        { key: 'partyName',       label: 'Tên đối tượng' },
        { key: 'contractContent', label: 'Nội dung HĐ'   },
        { key: 'contractNumber',  label: 'Số HĐ'         },
        { key: 'contractDate',    label: 'Ngày HĐ'       },
        { key: 'endDate',         label: 'Ngày kết thúc' },
        { key: 'daysRemaining',   label: 'Ngày còn lại'  },
        { key: 'contractStatus',  label: 'Tình trạng'    },
        { key: 'notes',           label: 'Ghi chú'       },
      ],
    },
    ...(dynColumns.length > 0 ? [{
      key: 'custom',
      label: 'Cột tuỳ chỉnh',
      fields: dynColumns.map((col) => ({ key: `dyn__${col.colName}`, label: col.colName })),
    }] : []),
  ]
}

function formatExportPreviewCell(row, key, company, rowIdx = 0) {
  if (key === 'stt')             return rowIdx + 1
  if (key === 'companyName')     return company?.name ?? '—'
  if (key === 'taxCode')         return company?.taxCode ?? '—'
  if (key === 'assignedStaff')   return company?.assignedStaff?.name ?? '—'
  if (key === 'contractStatus')  return STATUS_LABEL[row.contractStatus] ?? row.contractStatus
  if (key === 'contractDate')    return fmtDate(row.contractDate)
  if (key === 'endDate')         return fmtDate(row.endDate)
  if (key === 'daysRemaining')   return row.daysRemaining !== null ? row.daysRemaining : '—'
  if (key.startsWith('dyn__'))   return row.customFields[key.slice(5)] ?? '—'
  return row[key] ?? '—'
}

// ── CscExportModal ────────────────────────────────────────────────────────────

function CscExportModal({ companyId, company, contracts, columns, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const groups   = useMemo(() => buildExportGroups(columns), [columns])
  const allKeys  = useMemo(() => groups.flatMap((g) => g.fields.map((f) => f.key)), [groups])

  const [selected, setSelected]   = useState(() => new Set(allKeys))
  const [exporting, setExporting] = useState(false)

  function isGroupAll(group) { return group.fields.every((f) => selected.has(f.key)) }
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
    if (selected.size === 0) { addToast('Vui lòng chọn ít nhất một cột', 'error'); return }
    setExporting(true)
    try {
      const fields = allKeys.filter((k) => selected.has(k)).join(',')
      const blob   = await cscApi.exportContracts(companyId, fields)
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `hd_kh_ncc_${(company.name ?? companyId).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('Xuất Excel thành công', 'success')
      onClose()
    } catch {
      addToast('Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  const previewFields = groups.flatMap((g) => g.fields).filter((f) => selected.has(f.key))
  const previewRows   = contracts.slice(0, 8)

  return (
    <Modal title="Xuất Excel — Theo dõi HĐ KH.NCC" onClose={onClose} wide>
      <div className={s.modalForm}>
        <div className={s.hdldExportBody}>
          <div className={s.hdldExportSidebar}>
            <div className={s.hdldExportSidebarTitle}>Chọn cột xuất</div>
            {groups.map((group) => (
              <div key={group.key} className={s.hdldExportGroup}>
                <label className={s.hdldExportGroupLabel}>
                  <input
                    type="checkbox"
                    checked={isGroupAll(group)}
                    ref={(el) => {
                      if (el) {
                        const some = group.fields.some((f) => selected.has(f.key))
                        el.indeterminate = some && !isGroupAll(group)
                      }
                    }}
                    onChange={() => toggleGroup(group)}
                  />
                  <span>{group.label}</span>
                </label>
                {group.fields.map((f) => (
                  <label key={f.key} className={s.hdldExportFieldItem}>
                    <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggleField(f.key)} />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className={s.hdldExportPreviewPane}>
            <div className={s.hdldExportPreviewTitle}>
              Xem trước ({Math.min(8, contracts.length)} / {contracts.length} hợp đồng)
            </div>
            <div className={s.hdldExportPreviewWrap}>
              {previewFields.length === 0 ? (
                <div className={s.hdldExportPreviewEmpty}>Chưa chọn cột nào</div>
              ) : (
                <table className={s.hdldExportPreviewTable}>
                  <thead>
                    <tr>{previewFields.map((f) => <th key={f.key}>{f.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr key={row.id}>
                        {previewFields.map((f) => (
                          <td key={f.key}>{formatExportPreviewCell(row, f.key, company, rowIdx)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        <div className={s.hdldExportFooter}>
          <span className={s.hdldExportCount}>{selected.size} cột · {contracts.length} hợp đồng</span>
          <div className={s.modalActions}>
            <button type="button" onClick={onClose} className={s.btnOutline} disabled={exporting}>Huỷ</button>
            <button type="button" className={s.btnNavy} onClick={handleExport}
              disabled={exporting || selected.size === 0}>
              {exporting
                ? <><Loader2 size={13} className={s.spin} /> Đang xuất...</>
                : <><Download size={13} /> Xuất Excel</>}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── InlineTdCell — click-to-edit ──────────────────────────────────────────────

function InlineTdCell({ value, canEdit, onSave, inputType = 'text', tdClassName, tdStyle, required }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef               = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const newVal = inputType === 'date' ? localVal : localVal.trim()
    const orig   = inputType === 'date' ? (value ?? '') : (value ?? '').trim()
    if (newVal === orig) return
    if (required && !newVal) { setLocalVal(value ?? ''); return }
    onSave(newVal || null)
  }

  function renderDisplay() {
    if (!value || value === '') return <span className={s.archInlineEmpty}>—</span>
    if (inputType === 'date') return fmtDate(value)
    return value
  }

  return (
    <td
      className={`${tdClassName ?? ''} ${canEdit ? s.archInlineTdEditable : ''}`}
      style={tdStyle}
      onClick={() => canEdit && !editing && setEditing(true)}
    >
      {editing ? (
        inputType === 'multiline' ? (
          <textarea
            ref={inputRef}
            value={localVal}
            className={s.archInlineEditInput}
            rows={2}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
            }}
          />
        ) : (
          <input
            ref={inputRef}
            type={inputType}
            value={localVal}
            className={s.archInlineEditInput}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { setLocalVal(value ?? ''); setEditing(false) }
            }}
          />
        )
      ) : renderDisplay()}
    </td>
  )
}

// ── ManageColumnsModal ────────────────────────────────────────────────────────

function ManageColumnsModal({ companyId, columns, onColumnsChange, onClose }) {
  const addToast             = useToastStore((st) => st.toast)
  const [newName, setNewName]       = useState('')
  const [newType, setNewType]       = useState('text')
  const [adding, setAdding]         = useState(false)
  const [error, setError]           = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) { setError('Vui lòng nhập tên cột'); return }
    if (columns.some((c) => c.colName === newName.trim())) { setError('Tên cột đã tồn tại'); return }
    setError(null)
    setAdding(true)
    try {
      const col = await cscApi.createColumn(companyId, { colName: newName.trim(), colType: newType })
      onColumnsChange([...columns, col])
      setNewName('')
      setNewType('text')
      addToast(`Đã thêm cột "${col.colName}"`, 'success')
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể thêm cột')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(col) {
    setDeletingId(col.id)
    try {
      await cscApi.deleteColumn(companyId, col.id)
      onColumnsChange(columns.filter((c) => c.id !== col.id))
      addToast(`Đã xoá cột "${col.colName}"`, 'success')
    } catch {
      addToast('Không thể xoá cột', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Modal title="Quản lý cột tuỳ chỉnh" onClose={onClose} maxWidth={520}>
      <div className={s.modalForm}>
        <p className={s.hdldModalDesc}>
          Các cột tuỳ chỉnh áp dụng cho tất cả hợp đồng trong công ty này.
          Xoá cột không làm mất dữ liệu đã nhập.
        </p>
        {columns.length === 0 ? (
          <p className={s.hdldModalEmpty}>Chưa có cột tuỳ chỉnh nào.</p>
        ) : (
          <div className={s.hdldColList}>
            {columns.map((col) => (
              <div key={col.id} className={s.hdldColRow}>
                <GripVertical size={13} className={s.hdldColGrip} />
                <span className={s.hdldColName}>{col.colName}</span>
                <span className={s.hdldColTypeBadge}>{COL_TYPE_LABEL[col.colType] ?? col.colType}</span>
                <button
                  className={`${s.iconBtnSm} ${s.iconBtnDanger} ${s.hdldColDeleteBtn}`}
                  onClick={() => handleDelete(col)}
                  disabled={deletingId === col.id}
                  title="Xoá cột"
                >
                  {deletingId === col.id ? <Loader2 size={12} className={s.spin} /> : <Trash2 size={12} />}
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleAdd}>
          {error && <div className={`${s.errorBox} ${s.hdldInlineError}`}>{error}</div>}
          <div className={s.hdldAddColForm}>
            <div className={s.hdldAddColMain}>
              <label className={s.formLabel}>Tên cột mới</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Giá trị HĐ, Phụ lục..."
                className={s.formInput}
                autoFocus
              />
            </div>
            <div className={s.hdldAddColType}>
              <label className={s.formLabel}>Kiểu dữ liệu</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className={s.formSelect}>
                <option value="text">Văn bản</option>
                <option value="number">Số</option>
                <option value="date">Ngày</option>
              </select>
            </div>
            <button type="submit" className={`${s.btnNavy} ${s.hdldAddColBtn}`} disabled={adding}>
              {adding ? <Loader2 size={13} className={s.spin} /> : <Plus size={13} />}
              Thêm
            </button>
          </div>
        </form>
        <div className={`${s.modalActions} ${s.hdldModalActions}`}>
          <button onClick={onClose} className={s.btnOutline}>Đóng</button>
        </div>
      </div>
    </Modal>
  )
}

// ── ContractFormModal ─────────────────────────────────────────────────────────

function emptyForm(columns) {
  return {
    contractParty:   '',
    partyName:       '',
    contractContent: '',
    contractNumber:  '',
    contractDate:    '',
    endDate:         '',
    notes:           '',
    customFields:    Object.fromEntries(columns.map((c) => [c.colName, ''])),
  }
}

function ContractFormModal({ initial, columns, onSubmit, onClose, title }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        contractParty:   initial.contractParty   ?? '',
        partyName:       initial.partyName        ?? '',
        contractContent: initial.contractContent  ?? '',
        contractNumber:  initial.contractNumber   ?? '',
        contractDate:    initial.contractDate   ? String(initial.contractDate).substring(0, 10)  : '',
        endDate:         initial.endDate        ? String(initial.endDate).substring(0, 10)       : '',
        notes:           initial.notes           ?? '',
        customFields:    {
          ...Object.fromEntries(columns.map((c) => [c.colName, ''])),
          ...(initial.customFields ?? {}),
        },
      }
    }
    return emptyForm(columns)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function setField(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }
  function setColValue(colName, val) {
    setForm((p) => ({ ...p, customFields: { ...p.customFields, [colName]: val } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.partyName.trim()) { setError('Vui lòng nhập tên đối tượng'); return }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        contractParty:   form.contractParty.trim()   || null,
        partyName:       form.partyName.trim(),
        contractContent: form.contractContent.trim() || null,
        contractNumber:  form.contractNumber.trim()  || null,
        contractDate:    form.contractDate  || null,
        endDate:         form.endDate       || null,
        notes:           form.notes.trim()  || null,
        customFields:    form.customFields,
      })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} width="min(1400px, calc(100vw - 80px))">
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div className={s.formGrid2}>
          <div>
            <label className={s.formLabel}>Đối tượng hợp đồng</label>
            <input
              type="text"
              value={form.contractParty}
              onChange={setField('contractParty')}
              placeholder="VD: Nhà cung cấp, Khách hàng..."
              className={s.formInput}
              autoFocus
            />
          </div>
          <div>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên đối tượng</label>
            <input
              type="text"
              value={form.partyName}
              onChange={setField('partyName')}
              placeholder="Nhập tên đối tượng ký kết"
              className={s.formInput}
            />
          </div>
          <div className={s.hdldFormSpan2}>
            <label className={s.formLabel}>Nội dung hợp đồng</label>
            <input
              type="text"
              value={form.contractContent}
              onChange={setField('contractContent')}
              placeholder="VD: Cung cấp dịch vụ kế toán, Mua bán hàng hoá..."
              className={s.formInput}
            />
          </div>
          <div>
            <label className={s.formLabel}>Số hợp đồng</label>
            <input
              type="text"
              value={form.contractNumber}
              onChange={setField('contractNumber')}
              placeholder="VD: HĐ-2024/001"
              className={s.formInput}
            />
          </div>
          <div>
            <label className={s.formLabel}>Ngày hợp đồng</label>
            <input type="date" value={form.contractDate} onChange={setField('contractDate')} className={s.formInput} />
          </div>
          <div>
            <label className={s.formLabel}>Ngày kết thúc</label>
            <input type="date" value={form.endDate} onChange={setField('endDate')} className={s.formInput} />
          </div>
          <div className={s.hdldFormSpan2}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes}
              onChange={setField('notes')}
              placeholder="Ghi chú thêm về hợp đồng..."
              className={s.formTextarea}
              rows={2}
            />
          </div>
          {columns.map((col) => (
            <div key={col.id}>
              <label className={s.formLabel}>
                {col.colName}
                <span className={s.hdldColTypeHint}>({COL_TYPE_LABEL[col.colType]})</span>
              </label>
              <input
                type={col.colType === 'number' ? 'number' : col.colType === 'date' ? 'date' : 'text'}
                value={form.customFields[col.colName] ?? ''}
                onChange={(e) => setColValue(col.colName, e.target.value)}
                className={s.formInput}
              />
            </div>
          ))}
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnOutline} disabled={saving}>Huỷ</button>
          <button type="submit" disabled={saving} className={s.btnNavy}>
            {saving && <Loader2 size={13} />}
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── DeleteConfirmModal ────────────────────────────────────────────────────────

function DeleteConfirmModal({ contract, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)

  async function go() {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <Modal title="Xoá hợp đồng" onClose={onClose}>
      <div className={s.modalForm}>
        <p className={s.hdldConfirmText}>
          Bạn có chắc muốn xoá hợp đồng với <strong>{contract.partyName}</strong>?
          Hành động này không thể hoàn tác.
        </p>
        <div className={s.modalActions}>
          <button onClick={onClose} className={s.btnOutline} disabled={deleting}>Huỷ</button>
          <button onClick={go} className={s.btnDanger} disabled={deleting}>
            {deleting ? <Loader2 size={13} /> : <Trash2 size={13} />}
            Xoá
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── ClientSupplierContractsTab ────────────────────────────────────────────────

export default function ClientSupplierContractsTab({ company }) {
  const companyId = company.id
  const user      = useAuthStore((st) => st.user)
  const addToast  = useToastStore((st) => st.toast)

  const canEdit = user?.role === 'admin' || company.assignedStaffId === user?.id

  // ── Data ─────────────────────────────────────────────────────────────────────
  const [contracts, setContracts]     = useState([])
  const [columns, setColumns]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [showExport, setShowExport]   = useState(false)
  const [showImport, setShowImport]   = useState(false)

  // ── Column resize — persisted in localStorage per company ─────────────────────
  const lsKey = `cscColWidths_${companyId}`
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(`cscColWidths_${companyId}`)
      return saved ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) } : { ...DEFAULT_COL_WIDTHS }
    } catch {
      return { ...DEFAULT_COL_WIDTHS }
    }
  })

  function resizeCol(key, dx) {
    setColWidths((prev) => {
      const next = { ...prev, [key]: Math.max(MIN_COL_W, (prev[key] ?? DEFAULT_CUSTOM_COL_W) + dx) }
      try { localStorage.setItem(lsKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const tableWidth = useMemo(() => {
    const customW = columns.reduce((sum, c) => sum + (colWidths[`col_${c.id}`] ?? DEFAULT_CUSTOM_COL_W), 0)
    return (
      STT_W
      + (colWidths.contractParty   ?? DEFAULT_COL_WIDTHS.contractParty)
      + (colWidths.partyName       ?? DEFAULT_COL_WIDTHS.partyName)
      + (colWidths.contractContent ?? DEFAULT_COL_WIDTHS.contractContent)
      + (colWidths.contractNumber  ?? DEFAULT_COL_WIDTHS.contractNumber)
      + (colWidths.contractDate    ?? DEFAULT_COL_WIDTHS.contractDate)
      + (colWidths.endDate         ?? DEFAULT_COL_WIDTHS.endDate)
      + (colWidths.daysRemaining   ?? DEFAULT_COL_WIDTHS.daysRemaining)
      + (colWidths.contractStatus  ?? DEFAULT_COL_WIDTHS.contractStatus)
      + (colWidths.notes           ?? DEFAULT_COL_WIDTHS.notes)
      + customW
      + (canEdit ? ACTIONS_W : 0)
    )
  }, [colWidths, columns, canEdit])

  // ── Column-header filter state ────────────────────────────────────────────────
  const [colFilters, setColFilters]   = useState({})
  const [sortState, setSortState]     = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  // ── Pagination ────────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)

  // ── Modal state ───────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate]         = useState(false)
  const [editTarget, setEditTarget]         = useState(null)
  const [deleteTarget, setDeleteTarget]     = useState(null)
  const [showManageCols, setShowManageCols] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const [list, cols] = await Promise.all([
        cscApi.listContracts(companyId),
        cscApi.listColumns(companyId),
      ])
      setContracts(list)
      setColumns(cols)
    } catch {
      addToast('Không thể tải dữ liệu hợp đồng', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD handlers ──────────────────────────────────────────────────────────────
  async function handleCreate(body) {
    await cscApi.createContract(companyId, body)
    await load()
    setShowCreate(false)
    addToast(`Đã thêm hợp đồng "${body.partyName}"`, 'success')
  }

  async function handleEdit(body) {
    await cscApi.updateContract(companyId, editTarget.id, body)
    await load()
    setEditTarget(null)
    addToast('Đã cập nhật hợp đồng', 'success')
  }

  async function handleDelete() {
    await cscApi.deleteContract(companyId, deleteTarget.id)
    setContracts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    addToast('Đã xoá hợp đồng', 'success')
  }

  async function handleFieldSave(contractId, fieldData) {
    try {
      const updated = await cscApi.updateContract(companyId, contractId, fieldData)
      setContracts((prev) => prev.map((c) => c.id === contractId ? updated : c))
    } catch {
      addToast('Không thể lưu thông tin hợp đồng', 'error')
    }
  }

  async function handleCustomFieldSave(contractId, colName, value) {
    const contract = contracts.find((c) => c.id === contractId)
    if (!contract) return
    try {
      const updated = await cscApi.updateContract(companyId, contractId, {
        customFields: { ...(contract.customFields ?? {}), [colName]: value },
      })
      setContracts((prev) => prev.map((c) => c.id === contractId ? updated : c))
    } catch {
      addToast('Không thể lưu', 'error')
    }
  }

  // ── Filter + sort + paginate ──────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let result = [...contracts]

    for (const [colKey, filterVal] of Object.entries(colFilters)) {
      const filterType = getColumnFilterType(colKey, columns)

      if (filterType === 'enum') {
        if (filterVal instanceof Set && filterVal.size > 0) {
          result = result.filter((row) => filterVal.has(getDisplayLabel(row, colKey)))
        }
      } else if (filterType === 'text') {
        if (typeof filterVal === 'string' && filterVal.trim()) {
          const q = filterVal.toLowerCase()
          result = result.filter((row) => getDisplayLabel(row, colKey).toLowerCase().includes(q))
        }
      } else if (filterType === 'dateRange') {
        if (filterVal && (filterVal.from || filterVal.to)) {
          result = result.filter((row) => {
            const raw = colKey.startsWith('dyn__')
              ? row.customFields[colKey.slice(5)]
              : row[colKey]
            if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (filterVal.from && d < filterVal.from) return false
            if (filterVal.to   && d > filterVal.to)   return false
            return true
          })
        }
      } else if (filterType === 'numberRange') {
        if (filterVal && (filterVal.min !== '' || filterVal.max !== '')) {
          result = result.filter((row) => {
            const num = colKey === 'daysRemaining'
              ? row.daysRemaining
              : parseFloat(colKey.startsWith('dyn__')
                  ? row.customFields[colKey.slice(5)]
                  : row[colKey])
            if (num === null || num === undefined || isNaN(num)) return false
            if (filterVal.min !== '' && num < parseFloat(filterVal.min)) return false
            if (filterVal.max !== '' && num > parseFloat(filterVal.max)) return false
            return true
          })
        }
      }
    }

    if (sortState.col) {
      result.sort((a, b) => {
        const ak = getSortKey(a, sortState.col)
        const bk = getSortKey(b, sortState.col)
        if (typeof ak === 'number' && typeof bk === 'number') {
          return sortState.dir === 'asc' ? ak - bk : bk - ak
        }
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }

    return result
  }, [contracts, columns, colFilters, sortState])

  // Reset to page 1 whenever filter/sort changes
  useEffect(() => { setPage(1) }, [colFilters, sortState])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const pageRows   = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Filter UI helpers ─────────────────────────────────────────────────────────
  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) {
      setFilterPopup(null)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
    }
  }

  function handleFilterChange(colKey, val) {
    setColFilters((prev) => {
      const next = { ...prev }
      if (val === null) delete next[colKey]
      else next[colKey] = val
      return next
    })
  }

  function handleSort(col, dir) { setSortState({ col, dir }) }

  function hasFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = getColumnFilterType(colKey, columns)
    if (t === 'enum')        return f instanceof Set && f.size > 0
    if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
    if (t === 'dateRange')   return Boolean(f.from || f.to)
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }

  function hasSort(colKey) { return sortState.col === colKey }

  // FilterTh — column header with filter button + resize handle
  function FilterTh({ colKey, thClassName, style, children, resizeKey }) {
    const active = hasFilter(colKey) || hasSort(colKey)
    return (
      <th className={`${s.cscThResizable} ${thClassName ?? ''}`} style={style}>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-csc-filter-btn
            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
            onClick={(e) => openFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
        <ResizeHandle onResize={(dx) => resizeCol(resizeKey ?? colKey, dx)} />
      </th>
    )
  }

  const activeFilterCount = Object.values(colFilters).filter((v) => {
    if (v == null) return false
    if (v instanceof Set) return v.size > 0
    if (typeof v === 'string') return v.trim().length > 0
    if (typeof v === 'object') return Boolean(v.from || v.to || v.min !== '' || v.max !== '')
    return false
  }).length
  const hasSortActive = sortState.col !== null

  // Sticky left offset for partyName column
  const partyNameLeft = STT_W + (colWidths.contractParty ?? DEFAULT_COL_WIDTHS.contractParty)

  return (
    <div>
      {/* Toolbar */}
      <div className={s.hdldToolbar}>
        {!loading && (
          <span className={s.hdldToolbarCount}>
            {displayed.length}
            {displayed.length < contracts.length && `/${contracts.length}`} hợp đồng
            {activeFilterCount > 0 && ` · ${activeFilterCount} bộ lọc`}
            {hasSortActive && ' · đang sắp xếp'}
            {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
          </span>
        )}

        {(activeFilterCount > 0 || hasSortActive) && (
          <button
            className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
            onClick={() => { setColFilters({}); setSortState({ col: null, dir: 'asc' }) }}
          >
            Xoá tất cả bộ lọc
          </button>
        )}

        <div className={s.hdldToolbarRight}>
          {canEdit && (
            <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={() => setShowManageCols(true)}>
              <Columns size={13} /> Quản lý cột
            </button>
          )}
          <button
            className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
            onClick={() => setShowExport(true)}
            disabled={loading}
          >
            <Download size={13} /> Xuất Excel
          </button>
          {canEdit && (
            <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={() => setShowImport(true)}>
              <Upload size={13} /> Nhập từ Excel
            </button>
          )}
          {canEdit && (
            <button className={`${s.btnNavy} ${s.hdldToolbarBtn}`} onClick={() => setShowCreate(true)}>
              <Plus size={13} /> Thêm hợp đồng
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} /> Đang tải...
        </div>
      ) : contracts.length === 0 ? (
        <div className={s.emptyState}>
          <FileSignature size={32} className={s.hdldEmptyIcon} />
          <p className={s.hdldEmptyText}>Chưa có hợp đồng KH.NCC nào.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={`${s.tableScroll} ${s.archTableScroll}`}>
            <table className={`${s.table} ${s.cscTable}`} style={{ '--csc-table-w': `${tableWidth}px` }}>
              <thead>
                <tr>
                  {/* STT — sticky, fixed width, no resize */}
                  <th className={s.cscThSttFixed}>#</th>

                  {/* Đối tượng HĐ — sticky col 2; --csc-col-left = STT_W (fixed 42px) */}
                  <FilterTh
                    colKey="contractParty"
                    thClassName={s.cscThPartySticky}
                    style={{ '--csc-col-w': `${colWidths.contractParty ?? DEFAULT_COL_WIDTHS.contractParty}px`, '--csc-col-left': `${STT_W}px` }}
                  >
                    Đối tượng HĐ
                  </FilterTh>

                  {/* Tên đối tượng — sticky col 3; --csc-col-left = STT_W + contractParty width */}
                  <FilterTh
                    colKey="partyName"
                    thClassName={s.cscThPartyNameSticky}
                    style={{ '--csc-col-w': `${colWidths.partyName ?? DEFAULT_COL_WIDTHS.partyName}px`, '--csc-col-left': `${partyNameLeft}px` }}
                  >
                    Tên đối tượng
                  </FilterTh>

                  <FilterTh colKey="contractContent" style={{ '--csc-col-w': `${colWidths.contractContent ?? DEFAULT_COL_WIDTHS.contractContent}px` }}>
                    Nội dung HĐ
                  </FilterTh>
                  <FilterTh colKey="contractNumber" style={{ '--csc-col-w': `${colWidths.contractNumber ?? DEFAULT_COL_WIDTHS.contractNumber}px` }}>
                    Số HĐ
                  </FilterTh>
                  <FilterTh colKey="contractDate" style={{ '--csc-col-w': `${colWidths.contractDate ?? DEFAULT_COL_WIDTHS.contractDate}px` }}>
                    Ngày HĐ
                  </FilterTh>
                  <FilterTh colKey="endDate" style={{ '--csc-col-w': `${colWidths.endDate ?? DEFAULT_COL_WIDTHS.endDate}px` }}>
                    Ngày kết thúc
                  </FilterTh>
                  <FilterTh colKey="daysRemaining" style={{ '--csc-col-w': `${colWidths.daysRemaining ?? DEFAULT_COL_WIDTHS.daysRemaining}px` }}>
                    Ngày còn lại
                  </FilterTh>
                  <FilterTh colKey="contractStatus" style={{ '--csc-col-w': `${colWidths.contractStatus ?? DEFAULT_COL_WIDTHS.contractStatus}px` }}>
                    Tình trạng
                  </FilterTh>
                  <FilterTh colKey="notes" style={{ '--csc-col-w': `${colWidths.notes ?? DEFAULT_COL_WIDTHS.notes}px` }}>
                    Ghi chú
                  </FilterTh>

                  {columns.map((col) => (
                    <FilterTh
                      key={col.id}
                      colKey={`dyn__${col.colName}`}
                      resizeKey={`col_${col.id}`}
                      style={{ '--csc-col-w': `${colWidths[`col_${col.id}`] ?? DEFAULT_CUSTOM_COL_W}px` }}
                    >
                      {col.colName}
                    </FilterTh>
                  ))}

                  {canEdit && <th className={s.cscThActionsFixed}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={10 + columns.length + (canEdit ? 1 : 0)} className={s.hdldEmptyRow}>
                      Không có hợp đồng nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : pageRows.map((c, idx) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + idx
                  return (
                    <tr key={c.id} className={s.cscDocRow}>
                      {/* STT — sticky */}
                      <td className={s.cscCellSttFixed}>{globalIdx + 1}</td>

                      {/* contractParty — sticky col 2; --csc-cell-left = STT_W */}
                      <InlineTdCell
                        value={c.contractParty}
                        canEdit={canEdit}
                        tdClassName={`${s.hdldCellSoft} ${s.cscCellPartySticky}`}
                        tdStyle={{ '--csc-cell-left': `${STT_W}px` }}
                        onSave={(val) => handleFieldSave(c.id, { contractParty: val })}
                      />

                      {/* partyName — sticky col 3; --csc-cell-left = STT_W + contractParty width */}
                      <InlineTdCell
                        value={c.partyName}
                        canEdit={canEdit}
                        required
                        tdClassName={`${s.hdldCellName} ${s.cscCellPartyNameSticky}`}
                        tdStyle={{ '--csc-cell-left': `${partyNameLeft}px` }}
                        onSave={(val) => handleFieldSave(c.id, { partyName: val })}
                      />

                      <InlineTdCell
                        value={c.contractContent}
                        canEdit={canEdit}
                        tdClassName={s.hdldCellNotes}
                        onSave={(val) => handleFieldSave(c.id, { contractContent: val })}
                      />
                      <InlineTdCell
                        value={c.contractNumber}
                        canEdit={canEdit}
                        tdClassName={s.hdldCellMono}
                        onSave={(val) => handleFieldSave(c.id, { contractNumber: val })}
                      />
                      <InlineTdCell
                        value={c.contractDate ? String(c.contractDate).substring(0, 10) : ''}
                        canEdit={canEdit}
                        inputType="date"
                        tdClassName={s.hdldCellDate}
                        onSave={(val) => handleFieldSave(c.id, { contractDate: val })}
                      />
                      <InlineTdCell
                        value={c.endDate ? String(c.endDate).substring(0, 10) : ''}
                        canEdit={canEdit}
                        inputType="date"
                        tdClassName={s.hdldCellDate}
                        onSave={(val) => handleFieldSave(c.id, { endDate: val })}
                      />
                      <td className={s.hdldCellDays}>
                        {c.daysRemaining !== null ? c.daysRemaining : '—'}
                      </td>
                      <td><StatusBadge status={c.contractStatus} /></td>
                      <InlineTdCell
                        value={c.notes}
                        canEdit={canEdit}
                        inputType="multiline"
                        tdClassName={s.hdldCellNotes}
                        onSave={(val) => handleFieldSave(c.id, { notes: val })}
                      />

                      {columns.map((col) => (
                        <InlineTdCell
                          key={col.id}
                          value={c.customFields[col.colName] ?? ''}
                          canEdit={canEdit}
                          inputType={col.colType === 'date' ? 'date' : col.colType === 'number' ? 'number' : 'text'}
                          tdClassName={s.hdldCellCustom}
                          onSave={(val) => handleCustomFieldSave(c.id, col.colName, val)}
                        />
                      ))}

                      {canEdit && (
                        <td className={s.cscCellActions}>
                          <div className={s.hdldActionsRow}>
                            <button
                              className={s.iconBtnSm}
                              onClick={() => setEditTarget(c)}
                              title="Chỉnh sửa"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className={`${s.iconBtnSm} ${s.iconBtnDanger}`}
                              onClick={() => setDeleteTarget(c)}
                              title="Xoá"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Table footer: count + pagination */}
          <div className={s.archTableFooter}>
            <span className={s.archTableCount}>
              {displayed.length} hợp đồng
              {displayed.length < contracts.length && ` (lọc từ ${contracts.length})`}
              {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
            </span>
            {totalPages > 1 && (
              <div className={s.archPagination}>
                <button
                  className={s.archPageBtn}
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹ Trước
                </button>
                <span className={s.archPageInfo}>
                  {page} / {totalPages}
                </span>
                <button
                  className={s.archPageBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Tiếp ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Column filter dropdown */}
      {filterPopup && (
        <ColumnFilterDropdown
          colKey={filterPopup.colKey}
          dynColumns={columns}
          allRows={contracts}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={handleSort}
          onFilterChange={handleFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{
            '--hdld-dd-top':  `${filterPopup.top}px`,
            '--hdld-dd-left': `${filterPopup.left}px`,
          }}
        />
      )}

      {/* Modals */}
      {showExport && (
        <CscExportModal companyId={companyId} company={company} contracts={contracts}
          columns={columns} onClose={() => setShowExport(false)} />
      )}
      {showManageCols && (
        <ManageColumnsModal companyId={companyId} columns={columns}
          onColumnsChange={setColumns} onClose={() => setShowManageCols(false)} />
      )}
      {showCreate && (
        <ContractFormModal title="Thêm hợp đồng KH.NCC" columns={columns}
          onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <ContractFormModal title="Sửa hợp đồng KH.NCC" initial={editTarget} columns={columns}
          onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal contract={deleteTarget}
          onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
      )}
      {showImport && (
        <ExcelImportModal
          title="Nhập HĐ KH.NCC từ Excel"
          entityLabel="hợp đồng"
          fixedCols={CSC_IMPORT_COLS}
          dynCols={columns}
          templateName="mau_import_hd_kh_ncc.xlsx"
          sheetName="Theo dõi HĐ KH.NCC"
          onImport={async (validRows) => {
            const rows = validRows.map((r) => ({
              ...r,
              customFields: extractCustomFields(r, columns),
            }))
            const result = await cscApi.batchImport(companyId, rows)
            if (result.inserted > 0) await load()
            return result
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}
