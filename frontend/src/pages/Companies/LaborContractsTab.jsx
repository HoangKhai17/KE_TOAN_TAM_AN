import { useState, useEffect, useMemo, useRef } from 'react'
import { Plus, Pencil, Trash2, Download, Loader2, ScrollText, Columns, GripVertical, Filter } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as lcApi from '../../api/laborContracts'
import Modal from '../../components/ui/Modal'
import s from './companies.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Module-level helpers (stable, no dependencies) ────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Xác định kiểu filter cho từng cột:
 *   'enum'        → checkbox list   (contractStatus)
 *   'dateRange'   → từ ngày / đến ngày
 *   'numberRange' → tối thiểu / tối đa
 *   'text'        → search box (mặc định)
 */
function getColumnFilterType(colKey, dynColumns = []) {
  if (colKey === 'contractStatus')                    return 'enum'
  if (colKey === 'contractDate' || colKey === 'endDate') return 'dateRange'
  if (colKey === 'daysRemaining')                     return 'numberRange'
  if (colKey.startsWith('dyn__')) {
    const col = dynColumns.find((c) => c.colName === colKey.slice(5))
    if (col?.colType === 'date')   return 'dateRange'
    if (col?.colType === 'number') return 'numberRange'
  }
  return 'text'
}

/** Returns the display string used in filter checkboxes */
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

/** Returns a sortable primitive for the given column */
function getSortKey(row, colKey) {
  if (colKey.startsWith('dyn__')) return (row.customFields[colKey.slice(5)] ?? '').toLowerCase()
  if (colKey === 'contractDate' || colKey === 'endDate') return row[colKey] ?? ''
  if (colKey === 'daysRemaining') return row.daysRemaining ?? Number.MAX_SAFE_INTEGER
  if (colKey === 'contractStatus') return STATUS_LABEL[row.contractStatus] ?? ''
  const v = row[colKey]
  return v != null ? String(v).toLowerCase() : ''
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`${s.hdldStatusBadge} ${STATUS_CSS[status] ?? ''}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

// ── ColumnFilterDropdown — sub-sections theo kiểu cột ────────────────────────

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
  const [query, setQuery] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className={s.hdldDdFilterSection}>
      <input
        ref={inputRef}
        type="text"
        className={s.hdldDdInput}
        placeholder="Tìm kiếm..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          onFilterChange(colKey, e.target.value.trim() || null)
        }}
      />
      {query && (
        <div className={s.hdldDdFooter}>
          <button
            className={s.hdldDdClearBtn}
            onClick={() => { setQuery(''); onFilterChange(colKey, null) }}
          >
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

  function apply(f, t) {
    onFilterChange(colKey, f || t ? { from: f, to: t } : null)
  }

  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <input
            type="date"
            className={s.hdldDdInput}
            value={from}
            onChange={(e) => { setFrom(e.target.value); apply(e.target.value, to) }}
          />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <input
            type="date"
            className={s.hdldDdInput}
            value={to}
            onChange={(e) => { setTo(e.target.value); apply(from, e.target.value) }}
          />
        </div>
      </div>
      {(from || to) && (
        <div className={s.hdldDdFooter}>
          <button
            className={s.hdldDdClearBtn}
            onClick={() => { setFrom(''); setTo(''); onFilterChange(colKey, null) }}
          >
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
          <input
            type="number"
            className={s.hdldDdInput}
            placeholder="0"
            value={minVal}
            onChange={(e) => { setMinVal(e.target.value); apply(e.target.value, maxVal) }}
          />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input
            type="number"
            className={s.hdldDdInput}
            placeholder="∞"
            value={maxVal}
            onChange={(e) => { setMaxVal(e.target.value); apply(minVal, e.target.value) }}
          />
        </div>
      </div>
      {(minVal !== '' || maxVal !== '') && (
        <div className={s.hdldDdFooter}>
          <button
            className={s.hdldDdClearBtn}
            onClick={() => { setMinVal(''); setMaxVal(''); onFilterChange(colKey, null) }}
          >
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
      {/* Sort — luôn hiển thị */}
      <div className={s.hdldDdSortSection}>
        <button
          className={`${s.hdldDdSortBtn} ${activeAsc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}
        >
          ↑&nbsp; Sắp xếp A → Z
        </button>
        <button
          className={`${s.hdldDdSortBtn} ${activeDesc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}
        >
          ↓&nbsp; Sắp xếp Z → A
        </button>
      </div>

      {/* Filter section — khác nhau theo kiểu cột */}
      {filterType === 'enum' && (
        <EnumFilterSection
          colKey={colKey} allRows={allRows}
          currentFilter={currentFilter}
          onFilterChange={onFilterChange} onClose={onClose}
        />
      )}
      {filterType === 'text' && (
        <TextFilterSection
          colKey={colKey}
          currentFilter={currentFilter}
          onFilterChange={onFilterChange}
        />
      )}
      {filterType === 'dateRange' && (
        <DateRangeFilterSection
          colKey={colKey}
          currentFilter={currentFilter}
          onFilterChange={onFilterChange}
        />
      )}
      {filterType === 'numberRange' && (
        <NumberRangeFilterSection
          colKey={colKey}
          currentFilter={currentFilter}
          onFilterChange={onFilterChange}
        />
      )}
    </div>
  )
}

// ── LaborContractExportModal ──────────────────────────────────────────────────

function buildExportGroups(dynColumns) {
  return [
    {
      key: 'company',
      label: 'Công ty',
      fields: [
        { key: 'stt',         label: 'STT'        },
        { key: 'companyName', label: 'Tên công ty' },
      ],
    },
    {
      key: 'employee',
      label: 'Nhân viên',
      fields: [
        { key: 'employeeName', label: 'Tên nhân viên' },
        { key: 'taxCode',      label: 'MST nhân viên' },
      ],
    },
    {
      key: 'contract',
      label: 'Hợp đồng',
      fields: [
        { key: 'contractType',   label: 'Loại hợp đồng' },
        { key: 'contractNumber', label: 'Số hợp đồng'   },
        { key: 'contractDate',   label: 'Ngày ký'        },
        { key: 'endDate',        label: 'Ngày kết thúc'  },
        { key: 'daysRemaining',  label: 'Ngày còn lại'   },
        { key: 'contractStatus', label: 'Tình trạng'     },
        { key: 'notes',          label: 'Ghi chú'        },
      ],
    },
    ...(dynColumns.length > 0 ? [{
      key: 'custom',
      label: 'Cột tuỳ chỉnh',
      fields: dynColumns.map((col) => ({ key: `dyn__${col.colName}`, label: col.colName })),
    }] : []),
  ]
}

function formatExportPreviewCell(row, key, companyName, rowIdx = 0) {
  if (key === 'stt')            return rowIdx + 1
  if (key === 'companyName')    return companyName ?? '—'
  if (key === 'contractStatus') return STATUS_LABEL[row.contractStatus] ?? row.contractStatus
  if (key === 'contractDate')   return fmtDate(row.contractDate)
  if (key === 'endDate')        return fmtDate(row.endDate)
  if (key === 'daysRemaining')  return row.daysRemaining !== null ? row.daysRemaining : '—'
  if (key.startsWith('dyn__')) return row.customFields[key.slice(5)] ?? '—'
  return row[key] ?? '—'
}

function LaborContractExportModal({ companyId, company, contracts, columns, onClose }) {
  const addToast   = useToastStore((st) => st.toast)
  const groups     = useMemo(() => buildExportGroups(columns), [columns])
  const allKeys    = useMemo(() => groups.flatMap((g) => g.fields.map((f) => f.key)), [groups])

  const [selected, setSelected]   = useState(() => new Set(allKeys))
  const [exporting, setExporting] = useState(false)

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
    if (selected.size === 0) { addToast('Vui lòng chọn ít nhất một cột', 'error'); return }
    setExporting(true)
    try {
      // Giữ đúng thứ tự theo allKeys
      const fields = allKeys.filter((k) => selected.has(k)).join(',')
      const blob   = await lcApi.exportContracts(companyId, fields)
      const url    = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = url
      a.download   = `hdld_${(company.name ?? companyId).replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
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

  // Preview: 8 dòng đầu, chỉ hiển thị cột được chọn (theo thứ tự groups)
  const previewFields  = groups.flatMap((g) => g.fields).filter((f) => selected.has(f.key))
  const previewRows    = contracts.slice(0, 8)
  const companyName    = company?.name ?? ''

  return (
    <Modal title="Xuất Excel — Theo dõi HĐLĐ" onClose={onClose} wide>
      <div className={s.modalForm}>
        <div className={s.hdldExportBody}>
          {/* Sidebar chọn cột */}
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

          {/* Preview */}
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
                    <tr>
                      {previewFields.map((f) => <th key={f.key}>{f.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIdx) => (
                      <tr key={row.id}>
                        {previewFields.map((f) => (
                          <td key={f.key}>{formatExportPreviewCell(row, f.key, companyName, rowIdx)}</td>
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
          <span className={s.hdldExportCount}>
            {selected.size} cột · {contracts.length} hợp đồng
          </span>
          <div className={s.modalActions}>
            <button type="button" onClick={onClose} className={s.btnOutline} disabled={exporting}>
              Huỷ
            </button>
            <button
              type="button"
              className={s.btnNavy}
              onClick={handleExport}
              disabled={exporting || selected.size === 0}
            >
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
    if (columns.some((c) => c.colName === newName.trim())) {
      setError('Tên cột đã tồn tại')
      return
    }
    setError(null)
    setAdding(true)
    try {
      const col = await lcApi.createColumn(companyId, { colName: newName.trim(), colType: newType })
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
      await lcApi.deleteColumn(companyId, col.id)
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
                <span className={s.hdldColTypeBadge}>
                  {COL_TYPE_LABEL[col.colType] ?? col.colType}
                </span>
                <button
                  className={`${s.iconBtnSm} ${s.iconBtnDanger} ${s.hdldColDeleteBtn}`}
                  onClick={() => handleDelete(col)}
                  disabled={deletingId === col.id}
                  title="Xoá cột"
                >
                  {deletingId === col.id
                    ? <Loader2 size={12} className={s.spin} />
                    : <Trash2 size={12} />}
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
                placeholder="VD: Mức lương, Vị trí..."
                className={s.formInput}
                autoFocus
              />
            </div>
            <div className={s.hdldAddColType}>
              <label className={s.formLabel}>Kiểu dữ liệu</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className={s.formSelect}
              >
                <option value="text">Văn bản</option>
                <option value="number">Số</option>
                <option value="date">Ngày</option>
              </select>
            </div>
            <button
              type="submit"
              className={`${s.btnNavy} ${s.hdldAddColBtn}`}
              disabled={adding}
            >
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
    employeeName:   '',
    taxCode:        '',
    contractType:   '',
    contractNumber: '',
    contractDate:   '',
    endDate:        '',
    notes:          '',
    customFields:   Object.fromEntries(columns.map((c) => [c.colName, ''])),
  }
}

function ContractFormModal({ initial, columns, onSubmit, onClose, title }) {
  const [form, setForm] = useState(() => {
    if (initial) {
      return {
        employeeName:   initial.employeeName   ?? '',
        taxCode:        initial.taxCode        ?? '',
        contractType:   initial.contractType   ?? '',
        contractNumber: initial.contractNumber ?? '',
        contractDate:   initial.contractDate   ? String(initial.contractDate).substring(0, 10) : '',
        endDate:        initial.endDate        ? String(initial.endDate).substring(0, 10)       : '',
        notes:          initial.notes          ?? '',
        customFields:   {
          ...Object.fromEntries(columns.map((c) => [c.colName, ''])),
          ...(initial.customFields ?? {}),
        },
      }
    }
    return emptyForm(columns)
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function setField(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  function setColValue(colName, val) {
    setForm((p) => ({ ...p, customFields: { ...p.customFields, [colName]: val } }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.employeeName.trim()) { setError('Vui lòng nhập tên nhân viên'); return }
    setError(null)
    setSaving(true)
    try {
      await onSubmit({
        employeeName:   form.employeeName.trim(),
        taxCode:        form.taxCode.trim()        || null,
        contractType:   form.contractType.trim()   || null,
        contractNumber: form.contractNumber.trim() || null,
        contractDate:   form.contractDate  || null,
        endDate:        form.endDate       || null,
        notes:          form.notes.trim()  || null,
        customFields:   form.customFields,
      })
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} maxWidth={760}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        <div className={s.formGrid2}>
          <div className={s.hdldFormSpan2}>
            <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên nhân viên</label>
            <input
              type="text"
              value={form.employeeName}
              onChange={setField('employeeName')}
              placeholder="Nhập tên nhân viên"
              className={s.formInput}
              autoFocus
            />
          </div>

          <div>
            <label className={s.formLabel}>MST nhân viên</label>
            <input
              type="text"
              value={form.taxCode}
              onChange={setField('taxCode')}
              placeholder="Mã số thuế TNCN của nhân viên"
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Loại hợp đồng</label>
            <input
              type="text"
              value={form.contractType}
              onChange={setField('contractType')}
              placeholder="VD: Hợp đồng thử việc, HĐLĐ 1 năm..."
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
            <label className={s.formLabel}>Ngày ký hợp đồng</label>
            <input
              type="date"
              value={form.contractDate}
              onChange={setField('contractDate')}
              className={s.formInput}
            />
          </div>

          <div>
            <label className={s.formLabel}>Ngày kết thúc</label>
            <input
              type="date"
              value={form.endDate}
              onChange={setField('endDate')}
              className={s.formInput}
            />
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
          <button type="button" onClick={onClose} className={s.btnOutline} disabled={saving}>
            Huỷ
          </button>
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
          Bạn có chắc muốn xoá hợp đồng của nhân viên{' '}
          <strong>{contract.employeeName}</strong>? Hành động này không thể hoàn tác.
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

// ── LaborContractsTab ─────────────────────────────────────────────────────────

export default function LaborContractsTab({ company }) {
  const companyId = company.id
  const user      = useAuthStore((st) => st.user)
  const addToast  = useToastStore((st) => st.toast)

  const canEdit = user?.role === 'admin' || company.assignedStaffId === user?.id

  const [contracts, setContracts]       = useState([])
  const [columns, setColumns]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [showExport, setShowExport]     = useState(false)

  // Column-header filter state
  const [colFilters, setColFilters]     = useState({})   // { colKey: Set<string> | undefined }
  const [sortState, setSortState]       = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null) // { colKey, top, left }

  const [showCreate, setShowCreate]           = useState(false)
  const [editTarget, setEditTarget]           = useState(null)
  const [deleteTarget, setDeleteTarget]       = useState(null)
  const [showManageCols, setShowManageCols]   = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [list, cols] = await Promise.all([
        lcApi.listContracts(companyId),
        lcApi.listColumns(companyId),
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

  async function handleCreate(body) {
    await lcApi.createContract(companyId, body)
    await load()
    setShowCreate(false)
    addToast(`Đã thêm hợp đồng của "${body.employeeName}"`, 'success')
  }

  async function handleEdit(body) {
    await lcApi.updateContract(companyId, editTarget.id, body)
    await load()
    setEditTarget(null)
    addToast('Đã cập nhật hợp đồng', 'success')
  }

  async function handleDelete() {
    await lcApi.deleteContract(companyId, deleteTarget.id)
    setContracts((prev) => prev.filter((c) => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    addToast('Đã xoá hợp đồng', 'success')
  }


  // Apply column filters + sort
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

  function handleSort(col, dir) {
    setSortState({ col, dir })
  }

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

  function hasSort(colKey) {
    return sortState.col === colKey
  }

  /** Renders a <th> with filter button. noFilter = skip filter button (e.g. STT, actions). */
  function FilterTh({ colKey, className, children }) {
    const active = hasFilter(colKey) || hasSort(colKey)
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

  const activeFilterCount = Object.values(colFilters).filter((v) => v && v.size > 0).length
  const hasSortActive     = sortState.col !== null

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
            <button
              className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
              onClick={() => setShowManageCols(true)}
            >
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
            <button
              className={`${s.btnNavy} ${s.hdldToolbarBtn}`}
              onClick={() => setShowCreate(true)}
            >
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
          <ScrollText size={32} className={s.hdldEmptyIcon} />
          <p className={s.hdldEmptyText}>Chưa có hợp đồng lao động nào.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={`${s.table} ${s.hdldTable}`}>
              <thead>
                <tr>
                  <th className={s.hdldThStt}>STT</th>
                  <FilterTh colKey="employeeName"   className={s.hdldThName}>Tên nhân viên</FilterTh>
                  <FilterTh colKey="taxCode"        className={s.hdldThTaxCode}>MST nhân viên</FilterTh>
                  <FilterTh colKey="contractType"   className={s.hdldThType}>Loại HĐ</FilterTh>
                  <FilterTh colKey="contractNumber" className={s.hdldThNumber}>Số HĐ</FilterTh>
                  <FilterTh colKey="contractDate"   className={s.hdldThDateSm}>Ngày ký</FilterTh>
                  <FilterTh colKey="endDate"        className={s.hdldThDate}>Ngày kết thúc</FilterTh>
                  <FilterTh colKey="daysRemaining"  className={s.hdldThDays}>Ngày còn lại</FilterTh>
                  <FilterTh colKey="contractStatus" className={s.hdldThStatus}>Tình trạng</FilterTh>
                  <FilterTh colKey="notes"          className={s.hdldThNotes}>Ghi chú</FilterTh>
                  {columns.map((col) => (
                    <FilterTh key={col.id} colKey={`dyn__${col.colName}`} className={s.hdldThCustom}>
                      {col.colName}
                    </FilterTh>
                  ))}
                  {canEdit && <th className={s.actionsHead}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={10 + columns.length + (canEdit ? 1 : 0)} className={s.hdldEmptyRow}>
                      Không có hợp đồng nào khớp bộ lọc.
                    </td>
                  </tr>
                ) : displayed.map((c, idx) => (
                  <tr key={c.id}>
                    <td className={s.hdldCellStt}>{idx + 1}</td>
                    <td className={s.hdldCellName}>{c.employeeName}</td>
                    <td className={s.hdldCellMono}>{c.taxCode ?? '—'}</td>
                    <td className={s.hdldCellSoft}>{c.contractType ?? '—'}</td>
                    <td className={s.hdldCellMono}>{c.contractNumber ?? '—'}</td>
                    <td className={s.hdldCellDate}>{fmtDate(c.contractDate)}</td>
                    <td className={s.hdldCellDate}>{fmtDate(c.endDate)}</td>
                    <td className={s.hdldCellDays}>
                      {c.daysRemaining !== null ? c.daysRemaining : '—'}
                    </td>
                    <td><StatusBadge status={c.contractStatus} /></td>
                    <td className={s.hdldCellNotes} title={c.notes ?? ''}>
                      {c.notes ?? '—'}
                    </td>
                    {columns.map((col) => (
                      <td key={col.id} className={s.hdldCellCustom}>
                        {c.customFields[col.colName] ?? '—'}
                      </td>
                    ))}
                    {canEdit && (
                      <td>
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Column filter dropdown — position:fixed, rendered outside table scroll */}
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

      {/* Export modal */}
      {showExport && (
        <LaborContractExportModal
          companyId={companyId}
          company={company}
          contracts={contracts}
          columns={columns}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Modals */}
      {showManageCols && (
        <ManageColumnsModal
          companyId={companyId}
          columns={columns}
          onColumnsChange={setColumns}
          onClose={() => setShowManageCols(false)}
        />
      )}
      {showCreate && (
        <ContractFormModal
          title="Thêm hợp đồng lao động"
          columns={columns}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editTarget && (
        <ContractFormModal
          title={`Chỉnh sửa: ${editTarget.employeeName}`}
          initial={editTarget}
          columns={columns}
          onSubmit={handleEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          contract={deleteTarget}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
