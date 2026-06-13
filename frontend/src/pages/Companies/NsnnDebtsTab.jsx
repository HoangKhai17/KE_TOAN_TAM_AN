import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Pencil, Trash2, Download, Loader2, TrendingDown, Columns, GripVertical, Filter } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as nsnnApi from '../../api/nsnnDebts'
import Modal from '../../components/ui/Modal'
import s from './companies.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const MIN_COL_W = 60

const DEFAULT_COL_WIDTHS = {
  documentType: 200,
  category:     150,
  debtAmount:   140,
  updateDate:   120,
  daysLate:     130,
  repeatCount:  130,
  notes:        200,
}
const DEFAULT_CUSTOM_COL_W = 160
const STT_W     = 42
const ACTIONS_W = 100

const COL_TYPE_LABEL = { text: 'Văn bản', number: 'Số', date: 'Ngày' }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMoney(val) {
  if (val === null || val === undefined) return '—'
  return Number(val).toLocaleString('vi-VN')
}

function getColumnFilterType(colKey, dynColumns = []) {
  if (colKey === 'updateDate')               return 'dateRange'
  if (colKey === 'debtAmount')               return 'numberRange'
  if (colKey === 'daysLate')                 return 'numberRange'
  if (colKey === 'repeatCount')              return 'numberRange'
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
    case 'debtAmount':  return row.debtAmount !== null ? fmtMoney(row.debtAmount) : '(Trống)'
    case 'updateDate':  return row.updateDate ? fmtDate(row.updateDate) : '(Trống)'
    case 'daysLate':    return row.daysLate !== null ? String(row.daysLate) : '(Trống)'
    case 'repeatCount': return row.repeatCount !== null ? String(row.repeatCount) : '(Trống)'
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}

function getSortKey(row, colKey) {
  if (colKey.startsWith('dyn__')) return (row.customFields[colKey.slice(5)] ?? '').toLowerCase()
  if (colKey === 'updateDate')    return row.updateDate ?? ''
  if (colKey === 'debtAmount')    return row.debtAmount ?? Number.MAX_SAFE_INTEGER
  if (colKey === 'daysLate')      return row.daysLate ?? Number.MAX_SAFE_INTEGER
  if (colKey === 'repeatCount')   return row.repeatCount ?? Number.MAX_SAFE_INTEGER
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}

// ── ResizeHandle ───────────────────────────────────────────────────────────────

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

// ── Filter sub-sections ────────────────────────────────────────────────────────

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
        if (!e.target.closest('[data-nsnn-filter-btn]')) onClose()
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

// ── Export helpers ─────────────────────────────────────────────────────────────

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
      key: 'debt',
      label: 'Nợ NSNN',
      fields: [
        { key: 'documentType', label: 'Loại chứng từ / công việc'      },
        { key: 'category',     label: 'Phạm trù'                       },
        { key: 'debtAmount',   label: 'Số tiền nợ NSNN'                },
        { key: 'updateDate',   label: 'Thời điểm cập nhật'             },
        { key: 'daysLate',     label: 'Số ngày chậm so với hôm nay'    },
        { key: 'repeatCount',  label: 'Số lần lặp lại cho 1 công việc' },
        { key: 'notes',        label: 'Ghi chú'                        },
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
  if (key === 'stt')           return rowIdx + 1
  if (key === 'companyName')   return company?.name ?? '—'
  if (key === 'taxCode')       return company?.taxCode ?? '—'
  if (key === 'assignedStaff') return company?.assignedStaff?.name ?? '—'
  if (key === 'updateDate')    return fmtDate(row.updateDate)
  if (key === 'debtAmount')    return row.debtAmount !== null ? fmtMoney(row.debtAmount) : '—'
  if (key === 'daysLate')      return row.daysLate !== null ? row.daysLate : '—'
  if (key === 'repeatCount')   return row.repeatCount !== null ? row.repeatCount : '—'
  if (key.startsWith('dyn__')) return row.customFields[key.slice(5)] ?? '—'
  return row[key] ?? '—'
}

// ── NsnnExportModal ────────────────────────────────────────────────────────────

function NsnnExportModal({ companyId, company, debts, columns, onClose }) {
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
      const blob   = await nsnnApi.exportDebts(companyId, fields)
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `no_nsnn_${(company.name ?? companyId).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
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
  const previewRows   = debts.slice(0, 8)

  return (
    <Modal title="Xuất Excel — Theo dõi Nợ NSNN" onClose={onClose} wide>
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
              Xem trước ({Math.min(8, debts.length)} / {debts.length} dòng)
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
          <span className={s.hdldExportCount}>{selected.size} cột · {debts.length} dòng</span>
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

// ── InlineTdCell — click-to-edit ───────────────────────────────────────────────

function InlineTdCell({ value, canEdit, onSave, inputType = 'text', tdClassName, tdStyle, required }) {
  const [editing,  setEditing]  = useState(false)
  const [localVal, setLocalVal] = useState(value ?? '')
  const inputRef                = useRef(null)

  useEffect(() => { setLocalVal(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    const newVal = inputType === 'date' || inputType === 'number' ? localVal : localVal.trim()
    const orig   = inputType === 'date' || inputType === 'number' ? (value ?? '') : (value ?? '').toString().trim()
    if (String(newVal) === String(orig)) return
    if (required && !newVal) { setLocalVal(value ?? ''); return }
    onSave(newVal === '' ? null : newVal)
  }

  function renderDisplay() {
    if (value === null || value === undefined || value === '') return <span className={s.archInlineEmpty}>—</span>
    if (inputType === 'date')   return fmtDate(value)
    if (inputType === 'number') return typeof value === 'number' ? value.toLocaleString('vi-VN') : value
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

// ── ManageColumnsModal ─────────────────────────────────────────────────────────

function ManageColumnsModal({ companyId, columns, onColumnsChange, onClose }) {
  const addToast              = useToastStore((st) => st.toast)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('text')
  const [adding,  setAdding]  = useState(false)
  const [error,   setError]   = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) { setError('Vui lòng nhập tên cột'); return }
    if (columns.some((c) => c.colName === newName.trim())) { setError('Tên cột đã tồn tại'); return }
    setError(null); setAdding(true)
    try {
      const col = await nsnnApi.createColumn(companyId, { colName: newName.trim(), colType: newType })
      onColumnsChange([...columns, col])
      setNewName(''); setNewType('text')
      addToast(`Đã thêm cột "${col.colName}"`, 'success')
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể thêm cột')
    } finally { setAdding(false) }
  }

  async function handleDelete(col) {
    setDeletingId(col.id)
    try {
      await nsnnApi.deleteColumn(companyId, col.id)
      onColumnsChange(columns.filter((c) => c.id !== col.id))
      addToast(`Đã xoá cột "${col.colName}"`, 'success')
    } catch { addToast('Không thể xoá cột', 'error') }
    finally  { setDeletingId(null) }
  }

  return (
    <Modal title="Quản lý cột tuỳ chỉnh — Nợ NSNN" onClose={onClose} maxWidth={520}>
      <div className={s.modalForm}>
        <p className={s.hdldModalDesc}>
          Các cột tuỳ chỉnh áp dụng cho tất cả dòng nợ trong công ty này.
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
                type="text" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Cơ quan thuế, Trạng thái xử lý..."
                className={s.formInput} autoFocus
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

// ── DebtFormModal ──────────────────────────────────────────────────────────────

function emptyForm(columns) {
  return {
    documentType: '',
    category:     '',
    debtAmount:   '',
    updateDate:   '',
    repeatCount:  '',
    notes:        '',
    customFields: Object.fromEntries(columns.map((c) => [c.colName, ''])),
  }
}

function DebtFormModal({ initial, columns, onSubmit, onClose, title }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        documentType: initial.documentType ?? '',
        category:     initial.category     ?? '',
        debtAmount:   initial.debtAmount !== null ? String(initial.debtAmount) : '',
        updateDate:   initial.updateDate ? String(initial.updateDate).substring(0, 10) : '',
        repeatCount:  initial.repeatCount !== null ? String(initial.repeatCount) : '',
        notes:        initial.notes ?? '',
        customFields: {
          ...Object.fromEntries(columns.map((c) => [c.colName, ''])),
          ...(initial.customFields ?? {}),
        },
      }
    }
    return emptyForm(columns)
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function setField(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }
  function setColValue(colName, val) {
    setForm((p) => ({ ...p, customFields: { ...p.customFields, [colName]: val } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.documentType.trim()) { setError('Vui lòng nhập loại chứng từ / công việc'); return }
    setError(null); setSaving(true)
    try {
      await onSubmit({
        documentType: form.documentType.trim(),
        category:     form.category.trim()    || null,
        debtAmount:   form.debtAmount !== ''  ? parseFloat(form.debtAmount)  : null,
        updateDate:   form.updateDate         || null,
        repeatCount:  form.repeatCount !== '' ? parseInt(form.repeatCount, 10) : null,
        notes:        form.notes.trim()       || null,
        customFields: form.customFields,
      })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally { setSaving(false) }
  }

  return (
    <Modal title={title} onClose={onClose} width="min(900px, calc(100vw - 80px))">
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div className={s.formGrid2}>
          <div className={s.hdldFormSpan2}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Loại chứng từ / công việc</label>
            <input
              type="text" value={form.documentType} onChange={setField('documentType')}
              placeholder="VD: Thuế GTGT, Thuế TNDN, BHXH..."
              className={s.formInput} autoFocus
            />
          </div>
          <div>
            <label className={s.formLabel}>Phạm trù</label>
            <input
              type="text" value={form.category} onChange={setField('category')}
              placeholder="VD: Thuế, Bảo hiểm, Phí..."
              className={s.formInput}
            />
          </div>
          <div>
            <label className={s.formLabel}>Số tiền nợ NSNN (VNĐ)</label>
            <input
              type="number" value={form.debtAmount} onChange={setField('debtAmount')}
              placeholder="Để trống nếu chưa xác định"
              className={s.formInput} min="0" step="0.01"
            />
          </div>
          <div>
            <label className={s.formLabel}>Thời điểm cập nhật</label>
            <input type="date" value={form.updateDate} onChange={setField('updateDate')} className={s.formInput} />
          </div>
          <div>
            <label className={s.formLabel}>Số lần lặp lại</label>
            <input
              type="number" value={form.repeatCount} onChange={setField('repeatCount')}
              placeholder="Số lần lặp lại cho 1 công việc"
              className={s.formInput} min="0" step="1"
            />
          </div>
          <div className={s.hdldFormSpan2}>
            <label className={s.formLabel}>Ghi chú</label>
            <textarea
              value={form.notes} onChange={setField('notes')}
              placeholder="Ghi chú về khoản nợ..."
              className={s.formTextarea} rows={2}
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

// ── DeleteConfirmModal ─────────────────────────────────────────────────────────

function DeleteConfirmModal({ debt, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false)

  async function go() {
    setDeleting(true)
    try { await onConfirm() } finally { setDeleting(false) }
  }

  return (
    <Modal title="Xoá dòng nợ NSNN" onClose={onClose}>
      <div className={s.modalForm}>
        <p className={s.hdldConfirmText}>
          Bạn có chắc muốn xoá dòng nợ <strong>"{debt.documentType}"</strong>?
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

// ── NsnnDebtsTab ───────────────────────────────────────────────────────────────

export default function NsnnDebtsTab({ company }) {
  const companyId = company.id
  const user      = useAuthStore((st) => st.user)
  const addToast  = useToastStore((st) => st.toast)

  const canEdit = user?.role === 'admin' || company.assignedStaffId === user?.id

  // ── Data ──────────────────────────────────────────────────────────────────────
  const [debts,   setDebts]   = useState([])
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)

  // ── Column resize — persisted per company ─────────────────────────────────────
  const lsKey = `nsnnColWidths_${companyId}`
  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(lsKey)
      return saved ? { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) } : { ...DEFAULT_COL_WIDTHS }
    } catch { return { ...DEFAULT_COL_WIDTHS } }
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
      + (colWidths.documentType ?? DEFAULT_COL_WIDTHS.documentType)
      + (colWidths.category     ?? DEFAULT_COL_WIDTHS.category)
      + (colWidths.debtAmount   ?? DEFAULT_COL_WIDTHS.debtAmount)
      + (colWidths.updateDate   ?? DEFAULT_COL_WIDTHS.updateDate)
      + (colWidths.daysLate     ?? DEFAULT_COL_WIDTHS.daysLate)
      + (colWidths.repeatCount  ?? DEFAULT_COL_WIDTHS.repeatCount)
      + (colWidths.notes        ?? DEFAULT_COL_WIDTHS.notes)
      + customW
      + (canEdit ? ACTIONS_W : 0)
    )
  }, [colWidths, columns, canEdit])

  // ── Filter / sort / pagination state ─────────────────────────────────────────
  const [colFilters,   setColFilters]   = useState({})
  const [sortState,    setSortState]    = useState({ col: null, dir: 'asc' })
  const [filterPopup,  setFilterPopup]  = useState(null)
  const [page,         setPage]         = useState(1)

  // ── Modal state ───────────────────────────────────────────────────────────────
  const [showCreate,     setShowCreate]     = useState(false)
  const [editTarget,     setEditTarget]     = useState(null)
  const [deleteTarget,   setDeleteTarget]   = useState(null)
  const [showManageCols, setShowManageCols] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────────
  async function load() {
    setLoading(true)
    try {
      const [list, cols] = await Promise.all([
        nsnnApi.listDebts(companyId),
        nsnnApi.listColumns(companyId),
      ])
      setDebts(list)
      setColumns(cols)
    } catch {
      addToast('Không thể tải dữ liệu nợ NSNN', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD ──────────────────────────────────────────────────────────────────────
  async function handleCreate(body) {
    await nsnnApi.createDebt(companyId, body)
    await load()
    setShowCreate(false)
    addToast(`Đã thêm dòng nợ "${body.documentType}"`, 'success')
  }

  async function handleEdit(body) {
    await nsnnApi.updateDebt(companyId, editTarget.id, body)
    await load()
    setEditTarget(null)
    addToast('Đã cập nhật dòng nợ NSNN', 'success')
  }

  async function handleDelete() {
    await nsnnApi.deleteDebt(companyId, deleteTarget.id)
    setDebts((prev) => prev.filter((d) => d.id !== deleteTarget.id))
    setDeleteTarget(null)
    addToast('Đã xoá dòng nợ NSNN', 'success')
  }

  async function handleFieldSave(debtId, fieldData) {
    try {
      const updated = await nsnnApi.updateDebt(companyId, debtId, fieldData)
      setDebts((prev) => prev.map((d) => d.id === debtId ? updated : d))
    } catch {
      addToast('Không thể lưu thông tin nợ NSNN', 'error')
    }
  }

  async function handleCustomFieldSave(debtId, colName, value) {
    const debt = debts.find((d) => d.id === debtId)
    if (!debt) return
    try {
      const updated = await nsnnApi.updateDebt(companyId, debtId, {
        customFields: { ...(debt.customFields ?? {}), [colName]: value },
      })
      setDebts((prev) => prev.map((d) => d.id === debtId ? updated : d))
    } catch { addToast('Không thể lưu', 'error') }
  }

  // ── Filter + sort + paginate ──────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let result = [...debts]

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
            const raw = colKey.startsWith('dyn__') ? row.customFields[colKey.slice(5)] : row[colKey]
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
            const num = colKey.startsWith('dyn__')
              ? parseFloat(row.customFields[colKey.slice(5)])
              : parseFloat(row[colKey])
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
  }, [debts, columns, colFilters, sortState])

  useEffect(() => { setPage(1) }, [colFilters, sortState])

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE))
  const pageRows   = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Filter UI ─────────────────────────────────────────────────────────────────
  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) setFilterPopup(null)
    else {
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

  function FilterTh({ colKey, thClassName, style, children, resizeKey }) {
    const active = hasFilter(colKey) || hasSort(colKey)
    return (
      <th className={`${s.cscThResizable} ${thClassName ?? ''}`} style={style}>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-nsnn-filter-btn
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

  return (
    <div>
      {/* Toolbar */}
      <div className={s.hdldToolbar}>
        {!loading && (
          <span className={s.hdldToolbarCount}>
            {displayed.length}
            {displayed.length < debts.length && `/${debts.length}`} dòng nợ
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
            <button className={`${s.btnNavy} ${s.hdldToolbarBtn}`} onClick={() => setShowCreate(true)}>
              <Plus size={13} /> Thêm dòng nợ
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={18} className={s.spin} /> Đang tải...
        </div>
      ) : debts.length === 0 ? (
        <div className={s.emptyState}>
          <TrendingDown size={32} className={s.hdldEmptyIcon} />
          <p className={s.hdldEmptyText}>Chưa có dòng nợ NSNN nào.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={`${s.tableScroll} ${s.archTableScroll}`}>
            <table
              className={`${s.table} ${s.nsnnTable}`}
              style={{ '--nsnn-table-w': `${tableWidth}px` }}
            >
              <thead>
                <tr>
                  <th className={s.nsnnThSttFixed}>#</th>

                  <FilterTh
                    colKey="documentType"
                    style={{ '--nsnn-col-w': `${colWidths.documentType ?? DEFAULT_COL_WIDTHS.documentType}px` }}
                  >
                    Loại chứng từ / công việc
                  </FilterTh>

                  <FilterTh
                    colKey="category"
                    style={{ '--nsnn-col-w': `${colWidths.category ?? DEFAULT_COL_WIDTHS.category}px` }}
                  >
                    Phạm trù
                  </FilterTh>

                  <FilterTh
                    colKey="debtAmount"
                    style={{ '--nsnn-col-w': `${colWidths.debtAmount ?? DEFAULT_COL_WIDTHS.debtAmount}px` }}
                  >
                    Số tiền nợ NSNN
                  </FilterTh>

                  <FilterTh
                    colKey="updateDate"
                    style={{ '--nsnn-col-w': `${colWidths.updateDate ?? DEFAULT_COL_WIDTHS.updateDate}px` }}
                  >
                    Thời điểm cập nhật
                  </FilterTh>

                  <FilterTh
                    colKey="daysLate"
                    style={{ '--nsnn-col-w': `${colWidths.daysLate ?? DEFAULT_COL_WIDTHS.daysLate}px` }}
                  >
                    Số ngày chậm
                  </FilterTh>

                  <FilterTh
                    colKey="repeatCount"
                    style={{ '--nsnn-col-w': `${colWidths.repeatCount ?? DEFAULT_COL_WIDTHS.repeatCount}px` }}
                  >
                    Số lần lặp lại
                  </FilterTh>

                  <FilterTh
                    colKey="notes"
                    style={{ '--nsnn-col-w': `${colWidths.notes ?? DEFAULT_COL_WIDTHS.notes}px` }}
                  >
                    Ghi chú
                  </FilterTh>

                  {columns.map((col) => (
                    <FilterTh
                      key={col.id}
                      colKey={`dyn__${col.colName}`}
                      resizeKey={`col_${col.id}`}
                      style={{ '--nsnn-col-w': `${colWidths[`col_${col.id}`] ?? DEFAULT_CUSTOM_COL_W}px` }}
                    >
                      {col.colName}
                    </FilterTh>
                  ))}

                  {canEdit && <th className={s.nsnnThActionsFixed}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8 + columns.length + (canEdit ? 1 : 0)} className={s.hdldEmptyRow}>
                      Không có dòng nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : pageRows.map((d, idx) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + idx
                  return (
                    <tr key={d.id} className={s.nsnnDocRow}>
                      <td className={s.nsnnCellSttFixed}>{globalIdx + 1}</td>

                      <InlineTdCell
                        value={d.documentType}
                        canEdit={canEdit}
                        required
                        tdClassName={s.nsnnCellMain}
                        onSave={(val) => handleFieldSave(d.id, { documentType: val })}
                      />

                      <InlineTdCell
                        value={d.category}
                        canEdit={canEdit}
                        tdClassName={s.hdldCellSoft}
                        onSave={(val) => handleFieldSave(d.id, { category: val })}
                      />

                      <InlineTdCell
                        value={d.debtAmount !== null ? String(d.debtAmount) : ''}
                        canEdit={canEdit}
                        inputType="number"
                        tdClassName={s.nsnnCellMoney}
                        onSave={(val) => handleFieldSave(d.id, { debtAmount: val !== null ? parseFloat(val) : null })}
                      />

                      <InlineTdCell
                        value={d.updateDate ? String(d.updateDate).substring(0, 10) : ''}
                        canEdit={canEdit}
                        inputType="date"
                        tdClassName={s.hdldCellDate}
                        onSave={(val) => handleFieldSave(d.id, { updateDate: val })}
                      />

                      <td className={s.nsnnCellDaysLate}>
                        {d.daysLate !== null ? (
                          <span className={d.daysLate > 30 ? s.nsnnDaysLateHigh : d.daysLate > 0 ? s.nsnnDaysLateMed : s.nsnnDaysLateOk}>
                            {d.daysLate}
                          </span>
                        ) : '—'}
                      </td>

                      <InlineTdCell
                        value={d.repeatCount !== null ? String(d.repeatCount) : ''}
                        canEdit={canEdit}
                        inputType="number"
                        tdClassName={s.hdldCellDays}
                        onSave={(val) => handleFieldSave(d.id, { repeatCount: val !== null ? parseInt(val, 10) : null })}
                      />

                      <InlineTdCell
                        value={d.notes}
                        canEdit={canEdit}
                        inputType="multiline"
                        tdClassName={s.hdldCellNotes}
                        onSave={(val) => handleFieldSave(d.id, { notes: val })}
                      />

                      {columns.map((col) => (
                        <InlineTdCell
                          key={col.id}
                          value={d.customFields[col.colName] ?? ''}
                          canEdit={canEdit}
                          inputType={col.colType === 'date' ? 'date' : col.colType === 'number' ? 'number' : 'text'}
                          tdClassName={s.hdldCellCustom}
                          onSave={(val) => handleCustomFieldSave(d.id, col.colName, val)}
                        />
                      ))}

                      {canEdit && (
                        <td className={s.nsnnCellActions}>
                          <div className={s.hdldActionsRow}>
                            <button
                              className={s.iconBtnSm}
                              onClick={() => setEditTarget(d)}
                              title="Chỉnh sửa"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className={`${s.iconBtnSm} ${s.iconBtnDanger}`}
                              onClick={() => setDeleteTarget(d)}
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

          {/* Footer: count + pagination */}
          <div className={s.archTableFooter}>
            <span className={s.archTableCount}>
              {displayed.length} dòng nợ
              {displayed.length < debts.length && ` (lọc từ ${debts.length})`}
              {columns.length > 0 && ` · ${columns.length} cột tuỳ chỉnh`}
            </span>
            {totalPages > 1 && (
              <div className={s.archPagination}>
                <button className={s.archPageBtn} disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  ‹ Trước
                </button>
                <span className={s.archPageInfo}>{page} / {totalPages}</span>
                <button className={s.archPageBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
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
          allRows={debts}
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
        <NsnnExportModal companyId={companyId} company={company} debts={debts}
          columns={columns} onClose={() => setShowExport(false)} />
      )}
      {showManageCols && (
        <ManageColumnsModal companyId={companyId} columns={columns}
          onColumnsChange={setColumns} onClose={() => setShowManageCols(false)} />
      )}
      {showCreate && (
        <DebtFormModal title="Thêm dòng nợ NSNN" columns={columns}
          onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <DebtFormModal title="Sửa dòng nợ NSNN" initial={editTarget} columns={columns}
          onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteConfirmModal debt={deleteTarget}
          onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  )
}
