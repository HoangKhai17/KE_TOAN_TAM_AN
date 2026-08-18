import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Plus, Trash2, Filter, Loader2, Download, Upload, X, ExternalLink, Paperclip, FileUp, RefreshCw, Eye } from 'lucide-react'
import * as api from '../../api/companyTables'
import { exportXlsx } from '../../utils/exportXlsx'
import { uploadFile, downloadFile, deleteFile, formatSize, canPreview, ACCEPT_ATTR, MAX_FILE_BYTES } from '../../api/attachments'
import AttachmentPreviewModal from './AttachmentPreviewModal'
import { evaluateFormula, extractRefs, splitRef } from '../../utils/formula'
import { normalizeClipboardGrid, parseClipboardGrid } from '../../utils/clipboardGrid'
import Modal from '../../components/ui/Modal'
import ExcelImportModal from '../../components/ui/ExcelImportModal'
import { useCompanyFooter } from './companyFooter'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import DateBox from './DateBox'
import {
  DragHeaderCell,
  DragRowCell,
  SelectionHeaderCell,
  SelectionRowCell,
  useRowSelection,
} from '../../components/ui/data-table'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import s from './companies.module.css'

// ── Cell value as plain text (for export/preview) ─────────────────────────────
// columns cần cho cột 'formula' (tham chiếu cột khác). files: map "rowId|colKey"→[file] cho cột 'file'.
export function cellText(col, row, columns = [], filesByCell = null) {
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
    }
    const v = computeDays(col, row); return v ?? ''
  }
  if (col.dataType === 'formula') {
    const { value, error } = evalFormula(col, row, columns)
    return error || formatFormulaValue(value)
  }
  if (col.dataType === 'link') return linksText(row.data?.[col.colKey])
  if (col.dataType === 'file') {
    const list = filesByCell?.[`${row.id}|${col.colKey}`] ?? []
    return list.map((f) => f.fileName).join(', ')
  }
  const v = row.data?.[col.colKey]
  return col.dataType === 'date' ? fmtDate(v) : (v ?? '')
}

// ── Export modal: chọn cột + preview (giống flow tab cũ) ──────────────────────
function ExportModal({ def, columns, rows, company, filesByCell, clusterDefs = [], companyId, addToast, onClose }) {
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

  const isCluster = (clusterDefs?.length ?? 0) > 1   // có bảng cha–con
  const [exportCluster, setExportCluster] = useState(isCluster)
  const [exporting, setExporting] = useState(false)

  // Thứ tự xuất: STT → trường công ty (đã chọn) → cột bảng (đã chọn)
  const outFields = [
    ...extraFields.filter((f) => selected.has(f.key)),
    ...columns.filter((c) => selected.has(c.colKey)).map((c) => ({ key: c.colKey, label: c.label, col: c })),
  ]
  const cellOf = (f, r) => (f.col ? cellText(f.col, r, columns, filesByCell) : (f.perRow ? f.perRow(r) : f.value))

  const totalActive = (f) => f.col && f.col.options?.showTotal && (f.col.dataType === 'number' || f.col.dataType === 'formula')
  // Kiểu cột gửi backend để format (số/ngày/chữ)
  const exportType = (col) => {
    if (col.dataType === 'number') return 'number'
    if (col.dataType === 'formula') return isFormulaNumber(col) ? 'number' : 'text'
    if (col.dataType === 'date') return 'date'
    return 'text'   // select / link / file / text / computed
  }
  // Giá trị 1 ô theo ĐÚNG KIỂU (số→number, ngày→'YYYY-MM-DD', còn lại→chuỗi) để backend format.
  const exportValue = (col, r, cols, files) => {
    if (col.dataType === 'number') { const v = r.data?.[col.colKey]; if (v == null || v === '') return ''; const n = Number(v); return Number.isNaN(n) ? v : n }
    if (col.dataType === 'date')   { const v = r.data?.[col.colKey]; return v ? String(v).slice(0, 10) : '' }
    if (col.dataType === 'formula') { const { value, error } = evalFormula(col, r, cols); return error || (value ?? '') }
    return cellText(col, r, cols, files)   // select/link/file/text/computed
  }

  // Dựng 1 sheet spec (contract gửi backend) cho bảng d.
  function buildSheetSpec(d, dCols, dRows, dFields, dFiles) {
    const columnsSpec = [
      { label: 'STT', type: 'number', align: 'center', width: 6 },
      ...dFields.map((f) => (f.col
        ? { label: f.label, type: exportType(f.col), thousands: !!f.col.options?.thousands, width: f.col.width ? Math.max(8, Math.round(f.col.width / 7)) : undefined }
        : { label: f.label, type: 'text' })),
    ]
    const rowsSpec = dRows.map((r, i) => [i + 1, ...dFields.map((f) => (f.col ? exportValue(f.col, r, dCols, dFiles) : (f.perRow ? f.perRow(r) : f.value)))])
    let totalRow = null
    if (dFields.some(totalActive)) {
      totalRow = ['Tổng', ...dFields.map((f) => {
        if (!totalActive(f)) return ''
        let sum = 0
        for (const r of dRows) { const n = numericValue(r, f.col, dCols); if (n != null && !Number.isNaN(n)) sum += n }
        return sum
      })]
    }
    return { name: String(d.name || 'Sheet').slice(0, 31), columns: columnsSpec, rows: rowsSpec, totalRow, totalPosition: 'top' }
  }

  async function doExport() {
    setExporting(true)
    try {
      const exportDefs = exportCluster && isCluster ? clusterDefs : [def]
      const clusterList = clusterDefs.length ? clusterDefs : [def]
      // Nạp rows mọi bảng trong cụm (cho sheet + công thức liên bảng). Bảng hiện tại đã có.
      const rowsByDefId = { [def.id]: rows }
      for (const d of clusterList) {
        if (!rowsByDefId[d.id]) rowsByDefId[d.id] = await api.listRows(companyId, d.id).catch(() => [])
      }
      // Map công thức liên bảng: tableKey → { rows, columns } (cả cụm)
      const crossMap = {}
      for (const d of clusterList) crossMap[d.tableKey] = { rows: rowsByDefId[d.id] ?? [], columns: (d.columns || []).filter((c) => c.isActive !== false) }
      setCrossTables(crossMap)   // để công thức (kể cả liên bảng) tính đúng khi xuất

      const sheets = exportDefs.map((d) => {
        const dCols = d.id === def.id ? columns : (d.columns || []).filter((c) => c.isActive !== false)
        const dRows = rowsByDefId[d.id] ?? []
        const dFields = d.id === def.id ? outFields : dCols.map((c) => ({ key: c.colKey, label: c.label, col: c }))
        const dFiles = d.id === def.id ? filesByCell : null
        return buildSheetSpec(d, dCols, dRows, dFields, dFiles)
      })
      const stamp = new Date().toISOString().slice(0, 10)
      const safeCompany = (company.name || company.id).replace(/\s+/g, '_')
      const base = exportCluster && isCluster ? `${clusterDefs[0]?.tableKey || def.tableKey}_cum` : def.tableKey
      await exportXlsx({ filename: `${base}_${safeCompany}_${stamp}`, sheets })
      onClose()
    } catch (e) {
      addToast?.(e.response?.data?.error?.message ?? 'Xuất Excel thất bại', 'error')
    } finally { setExporting(false) }
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
          <span className={s.hdldExportCount}>
            {selected.size} trường · {rows.length} dòng
            {isCluster && (
              <label style={{ marginLeft: 14, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={exportCluster} onChange={(e) => setExportCluster(e.target.checked)} />
                Xuất cả cụm cha–con ({clusterDefs.length} bảng → {clusterDefs.length} sheet)
              </label>
            )}
          </span>
          <div className={s.modalActions}>
            <button type="button" className={s.btnOutline} onClick={onClose} disabled={exporting}>Huỷ</button>
            <button type="button" className={s.btnNavy} onClick={doExport} disabled={outFields.length === 0 || exporting}>
              {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />} Xuất Excel
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

// ── Formula engine wiring (Pha kiểu 'formula') ────────────────────────────────
// resolver đọc giá trị cột cho công thức; hỗ trợ formula-tham-chiếu-formula + chống vòng lặp.
//
// LIÊN BẢNG: token {tableKey!col_key} resolve thành MẢNG cả cột của bảng kia (trong cụm
// cha–con). Dữ liệu bảng kia nằm ở holder `_crossTables` (component set trước khi render).
// Chỉ 1 CustomTableTab mount tại một thời điểm nên holder module-level là an toàn.
//   _crossTables = { [tableKey]: { rows, columns } }
let _crossTables = null
export function setCrossTables(map) { _crossTables = map || null }

// Lấy giá trị 1 ô của BẢNG NGOÀI (raw / formula-nội-bảng / computed). KHÔNG cho cross
// lồng cross ở v1 (resolver bảng ngoài truyền cross=null) → tránh vòng lặp liên bảng.
function resolveOtherCell(row, col, columns) {
  if (col.dataType === 'formula') {
    const { value } = evaluateFormula(col.computedConfig?.expression, makeResolver(row, columns, null))
    return value
  }
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
    return computeDays(col, row)
  }
  if (col.dataType === 'link' || col.dataType === 'file') return null
  const v = row.data?.[col.colKey]
  if (v == null || v === '') return null
  return col.dataType === 'number' ? Number(v) : v
}

function makeResolver(row, columns, cross = null) {
  const byKey = {}
  for (const c of columns) byKey[c.colKey] = c
  const stack = new Set()
  function resolve(key) {
    // Liên bảng {defId!col_key} → mảng cả cột của bảng kia
    if (typeof key === 'string' && key.includes('!')) {
      if (!cross) return undefined                       // v1: không cho cross lồng cross → #REF
      const { table, col } = splitRef(key)
      const t = cross[table]
      if (!t) return undefined                           // bảng không có/không nạp → #REF
      const cdef = t.columns.find((c) => c.colKey === col)
      if (!cdef) return undefined                        // cột lạ → #REF
      return t.rows.map((r) => resolveOtherCell(r, cdef, t.columns))
    }
    const col = byKey[key]
    if (!col) return undefined                          // → #REF
    if (col.dataType === 'formula') {
      if (stack.has(key)) { const e = new Error('cycle'); e.__formulaError = '#CYCLE'; throw e }
      stack.add(key)
      const { value, error } = evaluateFormula(col.computedConfig?.expression, resolve)
      stack.delete(key)
      if (error) { const e = new Error(error); e.__formulaError = error; throw e }
      return value
    }
    if (col.dataType === 'computed') {
      if (col.computedType === 'status_threshold') return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
      return computeDays(col, row)
    }
    if (col.dataType === 'link' || col.dataType === 'file') return null   // không tham chiếu được
    const v = row.data?.[key]
    if (v == null || v === '') return null
    if (col.dataType === 'number') return Number(v)
    return v
  }
  return resolve
}
function evalFormula(col, row, columns) {
  // Chỉ số dòng hiện tại (theo THỨ TỰ BẢNG) — cho hàm ISLAST/ROW chống trùng.
  // Tìm chính dòng này trong mảng rows của bảng nó (self nằm trong _crossTables theo tableKey).
  let rowIndex = -1
  if (_crossTables) for (const t of Object.values(_crossTables)) { const i = t.rows.indexOf(row); if (i !== -1) { rowIndex = i; break } }
  return evaluateFormula(col.computedConfig?.expression, makeResolver(row, columns, _crossTables), { rowIndex })
}
function formatFormulaValue(v) {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000)
  return String(v)
}
function isFormulaNumber(col) { return (col.computedConfig?.resultType ?? 'number') === 'number' }

// ── Định dạng số (phân cách nghìn kiểu VN) — CHỈ khi cột bật options.thousands ────
function fmtNumberVN(v) {
  const n = Number(v)
  return Number.isNaN(n) ? String(v ?? '') : n.toLocaleString('vi-VN', { maximumFractionDigits: 4 })
}
// Hiển thị ô Số (không phải lúc nhập). Bật thousands → 200000 → "200.000".
function displayNumberCell(col, v) {
  if (v == null || v === '') return ''
  return col.options?.thousands ? fmtNumberVN(v) : String(v)
}
// Hiển thị giá trị công thức: format số nếu cột bật thousands, ngược lại như cũ.
function formatFormulaDisplay(col, value) {
  if (typeof value === 'number' && col.options?.thousands) return fmtNumberVN(value)
  return formatFormulaValue(value)
}

// ── Link helpers ──────────────────────────────────────────────────────────────
function asLinks(v) { return Array.isArray(v) ? v.filter((l) => l && l.url) : [] }
function linksText(v) { return asLinks(v).map((l) => l.label || l.url).join(', ') }

// ── Type-driven helpers (docs/018) ────────────────────────────────────────────
function columnFilterType(col) {
  if (col.colKey === '__stt') return 'none'   // STT: chỉ sắp xếp, không lọc giá trị
  if (col.dataType === 'computed') {
    return col.computedType === 'status_threshold' ? 'enum' : 'numberRange'
  }
  if (col.dataType === 'formula') return isFormulaNumber(col) ? 'numberRange' : 'text'
  if (col.dataType === 'file')   return 'none'   // file: không lọc theo giá trị
  if (col.dataType === 'link')   return 'text'
  if (col.dataType === 'select') return 'enum'
  if (col.dataType === 'date')   return 'dateRange'
  if (col.dataType === 'number') return 'numberRange'
  return 'text'
}
function displayLabel(row, col, columns = []) {
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).label
    }
    const v = computeDays(col, row)
    return v != null ? String(v) : '(Trống)'
  }
  if (col.dataType === 'formula') {
    const { value, error } = evalFormula(col, row, columns)
    if (error) return error
    return value == null || value === '' ? '(Trống)' : formatFormulaValue(value)
  }
  if (col.dataType === 'link') { const t = linksText(row.data?.[col.colKey]); return t || '(Trống)' }
  const v = row.data?.[col.colKey]
  if (v == null || v === '') return '(Trống)'
  if (col.dataType === 'date') return fmtDate(v)
  return String(v)
}
function numericValue(row, col, columns = []) {
  if (col.dataType === 'computed') return computeDays(col, row)
  if (col.dataType === 'formula') {
    const { value, error } = evalFormula(col, row, columns)
    if (error || value == null) return null
    const n = Number(value); return Number.isNaN(n) ? null : n
  }
  const v = row.data?.[col.colKey]
  return v == null || v === '' ? null : Number(v)
}
function sortKey(row, col, columns = []) {
  if (col.colKey === '__stt') return typeof row.position === 'number' ? row.position : 0   // STT = thứ tự thủ công (position, cho phép kéo thả)
  if (col.dataType === 'computed') {
    if (col.computedType === 'status_threshold') {
      return STATUS_ORDER[resolveBucket(col.computedConfig, row.data?.[col.computedConfig?.source_col]).tone] ?? 9
    }
    return computeDays(col, row) ?? Number.MAX_SAFE_INTEGER
  }
  if (col.dataType === 'formula') {
    const { value, error } = evalFormula(col, row, columns)
    if (isFormulaNumber(col)) { const n = Number(value); return error || value == null || Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n }
    return error || String(value ?? '').toLowerCase()
  }
  if (col.dataType === 'link') return linksText(row.data?.[col.colKey]).toLowerCase()
  const v = row.data?.[col.colKey]
  if (col.dataType === 'number') return v == null || v === '' ? Number.MAX_SAFE_INTEGER : Number(v)
  if (col.dataType === 'date')   return v ?? ''
  return String(v ?? '').toLowerCase()
}

// ── Column-header filter sub-sections ─────────────────────────────────────────
function EnumSection({ col, columns, allRows, currentFilter, onChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set(); const out = []
    for (const r of allRows) { const l = displayLabel(r, col, columns); if (!seen.has(l)) { seen.add(l); out.push(l) } }
    return out.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [allRows, col, columns])
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
          <DateBox value={from} className={s.hdldDdDateBox}
            onChange={(value) => { setFrom(value); apply(value, to) }} /></div>
        <div className={s.hdldDdRangeRow}><span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <DateBox value={to} className={s.hdldDdDateBox}
            onChange={(value) => { setTo(value); apply(from, value) }} /></div>
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
function ColumnFilterDropdown({ col, columns, allRows, currentFilter, sortState, onSort, onChange, onClose, style }) {
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
  const isStt = col.colKey === '__stt'
  const ascLabel  = isStt ? '↑  Cũ nhất → Mới nhất' : '↑  Sắp xếp A → Z'
  const descLabel = isStt ? '↓  Mới nhất → Cũ nhất' : '↓  Sắp xếp Z → A'
  return (
    <div ref={ref} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${asc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.colKey, 'asc')}>{ascLabel}</button>
        <button className={`${s.hdldDdSortBtn} ${desc ? s.hdldDdSortBtnActive : ''}`} onClick={() => onSort(col.colKey, 'desc')}>{descLabel}</button>
      </div>
      {ft === 'enum'        && <EnumSection col={col} columns={columns} allRows={allRows} currentFilter={currentFilter} onChange={onChange} onClose={onClose} />}
      {ft === 'text'        && <TextSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'dateRange'   && <DateRangeSection currentFilter={currentFilter} onChange={onChange} />}
      {ft === 'numberRange' && <NumberRangeSection currentFilter={currentFilter} onChange={onChange} />}
    </div>
  )
}

// ── Inline editable cell ──────────────────────────────────────────────────────
// Ô nhập điều khiển bởi cha (active) — hỗ trợ Tab/Shift+Tab/Enter/Esc để nhập liền mạch như Excel
function EditableCell({ col, value, canEdit, active, onActivate, onSave, onNavigate }) {
  const [local, setLocal] = useState(value ?? '')
  const ref = useRef(null)
  // Text tự do (bao gồm cột không set dataType) → dùng textarea, hỗ trợ xuống dòng + điều hướng mép ô
  const isTextType = !['number', 'date', 'select', 'computed'].includes(col.dataType)
  useEffect(() => { setLocal(value ?? '') }, [value])
  useEffect(() => {
    if (!active || !ref.current) return
    ref.current.focus()
    if (isTextType && ref.current.setSelectionRange) {
      const end = String(ref.current.value ?? '').length
      ref.current.setSelectionRange(end, end)
    }
    if (isTextType) {
      ref.current.style.height = '0px'
      ref.current.style.height = `${ref.current.scrollHeight}px`
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [active, col.dataType, isTextType])

  function commit(val) {
    const next = val !== undefined ? val : (col.dataType === 'date' ? local : String(local).replace(/[ \t]+$/gm, '').trim())
    if (String(next ?? '') === String(value ?? '')) return
    onSave(next === '' ? null : next)
  }
  // Con trỏ có đang ở mép ô không → dùng để quyết định phím mũi tên di chuyển ô hay di chuyển trong text
  const atStart     = (el) => el.selectionStart === 0 && el.selectionEnd === 0
  const atEnd       = (el) => el.selectionStart === el.value.length && el.selectionEnd === el.value.length
  const atFirstLine = (el) => el.value.slice(0, el.selectionStart).indexOf('\n') === -1
  const atLastLine  = (el) => el.value.slice(el.selectionEnd).indexOf('\n') === -1

  function insertNewline(el) {
    const start = el.selectionStart ?? String(local).length
    const end   = el.selectionEnd ?? String(local).length
    const nv = String(local).slice(0, start) + '\n' + String(local).slice(end)
    setLocal(nv)
    requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = start + 1 } catch { /* ignore */ } })
  }

  function handleKey(e) {
    const el = ref.current
    if (e.key === 'Enter') {
      // Alt+Enter / Shift+Enter → xuống dòng trong ô (chỉ với text). Enter thường → lưu + xuống ô dưới.
      if (isTextType && (e.altKey || e.shiftKey)) { e.preventDefault(); insertNewline(el); return }
      e.preventDefault(); commit(); onNavigate?.('down'); return
    }
    if (e.key === 'Tab')    { e.preventDefault(); commit(); onNavigate?.(e.shiftKey ? 'prev' : 'next'); return }
    if (e.key === 'Escape') { setLocal(value ?? ''); onNavigate?.('cancel'); return }

    // Điều hướng ô bằng phím mũi tên (như Excel).
    // - text: chỉ nhảy ô khi con trỏ ở mép; giữa text vẫn di chuyển con trỏ.
    // - date/number: input không cho đọc vị trí con trỏ và tự "nuốt" mũi tên (đổi ngày / tăng-giảm số),
    //   nên cho mũi tên LUÔN chuyển ô để không bị kẹt (giống Excel: mũi tên = di chuyển ô).
    const arrowDir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'downCell' }[e.key]
    if (arrowDir && el) {
      if (isTextType) {
        const ok = arrowDir === 'left' ? atStart(el)
          : arrowDir === 'right' ? atEnd(el)
          : arrowDir === 'up' ? atFirstLine(el)
          : atLastLine(el)
        if (ok) { e.preventDefault(); commit(); onNavigate?.(arrowDir) }
      } else if (col.dataType === 'date' || col.dataType === 'number') {
        e.preventDefault(); commit(); onNavigate?.(arrowDir)
      }
      // select: giữ mũi tên native (lên/xuống đổi lựa chọn) — dùng Tab/Enter để rời ô.
    }
  }

  if (!canEdit) {
    if (col.dataType === 'select') return <td>{value || <span className={s.archInlineEmpty}>—</span>}</td>
    return <td>{(value == null || value === '') ? <span className={s.archInlineEmpty}>—</span> : (col.dataType === 'date' ? fmtDate(value) : <span className={s.ctblMultiline}>{col.dataType === 'number' ? displayNumberCell(col, value) : String(value)}</span>)}</td>
  }

  if (col.dataType === 'select') {
    return (
      <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
        {active ? (
          <select ref={ref} className={s.archInlineEditInput} value={value ?? ''}
            onChange={(e) => { onSave(e.target.value || null); onNavigate?.('cancel') }}
            onBlur={() => onNavigate?.('cancel')} onKeyDown={handleKey}>
            <option value=""></option>
            {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          value || <span className={s.archInlineEmpty}>—</span>
        )}
      </td>
    )
  }

  if (col.dataType === 'date') {
    return (
      <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`} onClick={onActivate}>
        {active ? (
          <DateBox
            value={local ? String(local).slice(0, 10) : ''}
            className={s.locDateBox}
            onChange={(next) => { setLocal(next); commit(next); onNavigate?.('cancel') }}
          />
        ) : (
          value ? fmtDate(value) : <span className={s.archInlineEmpty}>—</span>
        )}
      </td>
    )
  }

  return (
    <td className={`${s.archInlineTdEditable} ${active ? s.ctblCellActive : ''}`}
      onClick={onActivate}>
      {active ? (
        isTextType ? (
          <textarea ref={ref} rows={1} wrap="soft"
            value={local} className={`${s.archInlineEditInput} ${s.ctblTextarea}`}
            onChange={(e) => {
              setLocal(e.target.value)
              e.target.style.height = '0px'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onBlur={() => { commit(); onNavigate?.('cancel') }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKey} />
        ) : (
          <input ref={ref} type="number"
            value={local} className={s.archInlineEditInput}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={() => { commit(); onNavigate?.('cancel') }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKey} />
        )
      ) : (
        (value == null || value === '')
          ? <span className={s.archInlineEmpty}>—</span>
          : (col.dataType === 'date' ? fmtDate(value) : <span className={s.ctblMultiline}>{col.dataType === 'number' ? displayNumberCell(col, value) : String(value)}</span>)
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

// ── Link cell (kiểu 'link' — 1..n link) ───────────────────────────────────────
function LinkCell({ col, value, canEdit, active, onActivate, onSave }) {
  const links = asLinks(value)
  const multiple = col.options?.multiple !== false
  const [local, setLocal] = useState(links)
  // Chỉ đồng bộ từ server khi KHÔNG đang sửa → tránh reset mất chữ đang gõ giữa các ô
  useEffect(() => { if (!active) setLocal(asLinks(value)) }, [value, active])

  if (!canEdit || !active) {
    return (
      <td className={canEdit ? s.archInlineTdEditable : undefined} onClick={canEdit ? onActivate : undefined}>
        {links.length === 0
          ? <span className={s.archInlineEmpty}>—</span>
          : (
            <div className={s.ctblLinkChips}>
              {links.map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                  className={s.ctblLinkChip} onClick={(e) => e.stopPropagation()} title={l.url}>
                  <ExternalLink size={11} /> {l.label || l.url}
                </a>
              ))}
            </div>
          )}
      </td>
    )
  }
  const commit = (list) => onSave(list.filter((l) => l.url && l.url.trim()))
  const setAt = (i, key, val) => setLocal((p) => p.map((l, j) => (j === i ? { ...l, [key]: val } : l)))
  const removeAt = (i) => { const nx = local.filter((_, j) => j !== i); setLocal(nx); commit(nx) }
  return (
    <td className={`${s.archInlineTdEditable} ${s.ctblCellActive}`} onClick={(e) => e.stopPropagation()}>
      <div className={s.ctblLinkEditor}>
        {local.map((l, i) => (
          <div key={i} className={s.ctblLinkEditorRow}>
            <input className={s.archInlineEditInput} placeholder="https://..." value={l.url}
              autoFocus={i === local.length - 1 && !l.url}
              onChange={(e) => setAt(i, 'url', e.target.value)} onBlur={() => commit(local)} />
            <input className={s.archInlineEditInput} placeholder="Nhãn (tuỳ chọn)" value={l.label}
              onChange={(e) => setAt(i, 'label', e.target.value)} onBlur={() => commit(local)} />
            <button className={s.ctblIconBtn} title="Xoá link" onClick={() => removeAt(i)}><X size={12} /></button>
          </div>
        ))}
        {(multiple || local.length === 0) && (
          <button className={s.ctblLinkAddBtn} onClick={() => setLocal((p) => [...p, { url: '', label: '' }])}>
            <Plus size={12} /> Thêm link
          </button>
        )}
      </div>
    </td>
  )
}

// ── File cell (kiểu 'file' — dùng lại hệ attachments) ──────────────────────────
function FileCell({ col, row, files, canEdit, onChanged, addToast }) {
  const multiple = col.options?.multiple !== false
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const list = files ?? []

  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) { addToast('File vượt quá 5MB', 'error'); return }
    setBusy(true)
    try {
      if (!multiple) { for (const f of list) await deleteFile(f.id) }   // 1 file → thay thế
      await uploadFile('company_table_row', row.id, file, { fieldKey: col.colKey })
      onChanged()
    } catch (err) { addToast(err.response?.data?.error?.message ?? 'Không tải file lên được', 'error') }
    finally { setBusy(false) }
  }
  async function remove(f) {
    setBusy(true)
    try { await deleteFile(f.id); onChanged() }
    catch { addToast('Không xoá được file', 'error') }
    finally { setBusy(false) }
  }
  return (
    <td>
      <div className={s.ctblFileCell}>
        {list.map((f) => (
          <span key={f.id} className={s.ctblFileChip}>
            <button className={s.ctblFileName} title={`${f.fileName} · ${formatSize(f.sizeBytes)}`}
              onClick={() => downloadFile(f.id, f.fileName)}>
              <Paperclip size={11} /> {f.fileName}
            </button>
            {canPreview(f.mimeType) && (
              <button className={s.ctblIconBtn} title="Xem trước" onClick={() => setPreviewFile(f)}><Eye size={11} /></button>
            )}
            {canEdit && <button className={s.ctblIconBtn} title="Xoá file" onClick={() => remove(f)}><X size={11} /></button>}
          </span>
        ))}
        {canEdit && (multiple || list.length === 0) && (
          <button className={s.ctblFileAddBtn} disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 size={12} className={s.spin} /> : <FileUp size={12} />} Tải lên
          </button>
        )}
        {list.length === 0 && !canEdit && <span className={s.archInlineEmpty}>—</span>}
        <input ref={inputRef} type="file" accept={ACCEPT_ATTR} style={{ display: 'none' }} onChange={pick} />
      </div>
      {previewFile && (
        <AttachmentPreviewModal file={previewFile} title={previewFile.fileName} onClose={() => setPreviewFile(null)} />
      )}
    </td>
  )
}

// Kiểu cột read-only (tính động) hoặc "giàu" (thao tác trực tiếp) → KHÔNG tham gia
// điều hướng phím Tab/Enter và KHÔNG nhập qua Excel.
const NON_SIMPLE_TYPES = ['computed', 'formula', 'file', 'link']

const PAGE_SIZE = 20

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomTableTab({ def, company, onDefUpdated, clusterDefs = [] }) {
  const confirmDelete = useDeleteConfirm()
  const companyId = company.id
  const user     = useAuthStore((st) => st.user)
  const addToast = useToastStore((st) => st.toast)
  const isAdmin  = user?.role === 'admin'
  const canEdit  = isAdmin || company.assignedStaffId === user?.id

  const [rows, setRows]                 = useState([])
  const [companyCols, setCompanyCols]   = useState([])
  const [files, setFiles]               = useState([])   // file của cột kiểu 'file' (gộp cả bảng)
  const [loading, setLoading]           = useState(true)
  const [colFilters, setColFilters]     = useState({})
  const [sortState, setSortState]       = useState({ col: '__stt', dir: 'asc' })  // mặc định: thứ tự thủ công (kéo thả được)
  const [filterPopup, setFilterPopup]   = useState(null)
  const [page, setPage]                 = useState(1)
  const [deletingRow, setDeletingRow]   = useState(null)
  const [showExport, setShowExport]     = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [syncing, setSyncing]           = useState(false)   // đồng bộ nhóm (pivot)
  const [pageSize, setPageSize]         = useState(PAGE_SIZE)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  // Nhập bằng phím (Tab/Enter) — ô đang mở để nhập; và focus dòng vừa thêm
  const [activeCell, setActiveCell]     = useState(null)   // { rowId, colKey }
  const [pendingFocus, setPendingFocus] = useState(null)   // { rowId, colKey } — focus sau khi render
  const tabRef = useRef(null)
  // Kéo thả hàng
  const [dragRowId, setDragRowId]       = useState(null)
  const [dragOverId, setDragOverId]     = useState(null)

  useEffect(() => {
    if (!activeCell) return undefined
    function handleOutsidePointer(e) {
      if (tabRef.current?.contains(e.target)) return
      window.setTimeout(() => setActiveCell(null), 0)
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [activeCell])

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
      // Cho phép cột co nhỏ hơn tiêu đề: header sẽ tự xuống dòng, chỉ giữ
      // ngưỡng kỹ thuật đủ chỗ cho filter và tay nắm resize.
      const w = Math.max(48, (prev[col.colKey] ?? col.width ?? 160) + dx)
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

  // ── Liên bảng: các bảng được công thức của bảng này tham chiếu (trong cụm cha–con) ──
  // Token liên bảng dùng MÃ BẢNG (table_key), vd {nsnn!col} → dễ đọc, bền khi đổi tên.
  const [otherTables, setOtherTables] = useState({})   // { [tableKey]: { rows, columns } }
  const referencedKeys = useMemo(() => {
    const clusterKeys = new Set((clusterDefs || []).map((d) => d.tableKey))
    const keys = new Set()
    for (const c of (def.columns || [])) {
      if (c.dataType !== 'formula') continue
      for (const ref of extractRefs(c.computedConfig?.expression)) {
        const { table } = splitRef(ref)
        if (table && table !== def.tableKey && clusterKeys.has(table)) keys.add(table)
      }
    }
    return [...keys]
  }, [def.columns, def.tableKey, clusterDefs])

  useEffect(() => {
    if (referencedKeys.length === 0) { setOtherTables({}); return undefined }
    let cancelled = false
    const byKey = {}
    for (const d of (clusterDefs || [])) byKey[d.tableKey] = d
    Promise.all(referencedKeys.map((k) => {
      const d = byKey[k]
      if (!d) return Promise.resolve({ key: k, rows: [], columns: [] })
      return api.listRows(companyId, d.id)
        .then((r) => ({ key: k, rows: r, columns: (d.columns || []).filter((c) => c.isActive !== false) }))
        .catch(() => ({ key: k, rows: [], columns: [] }))
    })).then((list) => {
      if (cancelled) return
      const map = {}
      for (const { key, rows: r, columns: cols } of list) map[key] = { rows: r, columns: cols }
      setOtherTables(map)
    })
    return () => { cancelled = true }
  }, [companyId, referencedKeys, clusterDefs])

  // Đưa dữ liệu bảng ngoài vào holder module-level TRƯỚC khi các helper (displayLabel/
  // sortKey/render cell) chạy trong render này. Chỉ 1 CustomTableTab mount nên an toàn.
  // GỒM CẢ chính bảng này (self) → cho phép công thức gộp CHÉO DÒNG cùng bảng: {tableKey!col}
  // (vd SUMIFS trên cột của chính bảng). resolveOtherCell chặn cross-lồng-cross nên không recursion.
  setCrossTables({ ...otherTables, [def.tableKey]: { rows, columns } })

  // Có cột 'file' không → mới cần tải danh sách file (tránh gọi thừa)
  const defHasFile = useMemo(
    () => (def.columns || []).some((c) => c.dataType === 'file') || def.allowCompanyColumns,
    [def.columns, def.allowCompanyColumns])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.listRows(companyId, def.id),
      def.allowCompanyColumns ? api.listCompanyColumns(companyId, def.id) : Promise.resolve([]),
      defHasFile ? api.listDefFiles(companyId, def.id) : Promise.resolve([]),
    ])
      .then(([r, cc, ff]) => { if (!cancelled) { setRows(r); setCompanyCols(cc); setFiles(ff); setSelectedIds(new Set()) } })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // setSelectedIds là setter ổn định của hook; load chạy sau khi render hoàn tất.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, def.id, def.allowCompanyColumns, defHasFile])

  useEffect(() => load(), [load])

  // Tải lại danh sách file sau khi upload/xoá (dùng bởi FileCell)
  const reloadFiles = useCallback(() => {
    api.listDefFiles(companyId, def.id).then(setFiles).catch(() => {})
  }, [companyId, def.id])

  // ── Pivot: đồng bộ dòng nhóm từ bảng cha ─────────────────────────────────────
  const isPivot = !!def.groupConfig?.enabled
  async function handleSyncGroups(silent = false) {
    setSyncing(true)
    try {
      const { added, removed } = await api.syncGroups(companyId, def.id)
      const list = await api.listRows(companyId, def.id)
      setRows(list)
      if (!silent) addToast(`Đồng bộ nhóm: thêm ${added}${removed ? `, xoá ${removed}` : ''} dòng`, 'success')
    } catch (e) {
      if (!silent) addToast(e.response?.data?.error?.message ?? 'Không đồng bộ được nhóm', 'error')
    } finally { setSyncing(false) }
  }
  // Tự động đồng bộ khi mở tab (nếu bật autoSync). Ref chặn chạy 2 lần (StrictMode dev / re-render).
  const autoSyncedRef = useRef(null)
  useEffect(() => {
    if (!def.groupConfig?.enabled || !def.groupConfig?.autoSync) return
    if (autoSyncedRef.current === def.id) return
    autoSyncedRef.current = def.id
    handleSyncGroups(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id])

  // Nhóm file theo ô "rowId|colKey" — tránh N+1 khi render
  const filesByCell = useMemo(() => {
    const m = {}
    for (const f of files) (m[`${f.rowId}|${f.colKey}`] ??= []).push(f)
    return m
  }, [files])
  useEffect(() => { setPage(1) }, [colFilters, sortState, pageSize])

  // ── Client filter + sort + pagination ───────────────────────────────────────
  const displayed = useMemo(() => {
    let result = [...rows]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const col = columns.find((c) => c.colKey === colKey)
      if (!col) continue
      const ft = columnFilterType(col)
      if (ft === 'enum' && fv instanceof Set && fv.size > 0) {
        result = result.filter((r) => fv.has(displayLabel(r, col, columns)))
      } else if (ft === 'text' && typeof fv === 'string' && fv.trim()) {
        const q = fv.toLowerCase()
        result = result.filter((r) => displayLabel(r, col, columns).toLowerCase().includes(q))
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
          const n = numericValue(r, col, columns)
          if (n == null || isNaN(n)) return false
          if (fv.min !== '' && n < parseFloat(fv.min)) return false
          if (fv.max !== '' && n > parseFloat(fv.max)) return false
          return true
        })
      }
    }
    if (sortState.col) {
      const col = sortState.col === '__stt' ? { colKey: '__stt' } : columns.find((c) => c.colKey === sortState.col)
      if (col) result.sort((a, b) => {
        const ak = sortKey(a, col, columns), bk = sortKey(b, col, columns)
        if (typeof ak === 'number' && typeof bk === 'number') return sortState.dir === 'asc' ? ak - bk : bk - ak
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, columns, colFilters, sortState, otherTables])

  const totalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const pageRows   = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)

  // Dòng TỔNG (Σ) — cộng theo cột bật options.showTotal, trên TOÀN BỘ dòng đã lọc (không chỉ trang).
  const totalCols = useMemo(
    () => columns.filter((c) => c.options?.showTotal && (c.dataType === 'number' || c.dataType === 'formula')),
    [columns])
  const totals = useMemo(() => {
    if (totalCols.length === 0) return null
    const acc = {}
    for (const col of totalCols) {
      let sum = 0
      for (const r of displayed) { const n = numericValue(r, col, columns); if (n != null && !Number.isNaN(n)) sum += n }
      acc[col.colKey] = sum
    }
    return acc
  }, [totalCols, displayed, columns])

  // Phân trang → footer trang (thay copyright), đồng bộ Companies/Tasks
  useCompanyFooter(loading || columns.length === 0 ? null : {
    total: displayed.length,
    from: displayed.length ? (safePage - 1) * pageSize + 1 : 0,
    to: Math.min(safePage * pageSize, displayed.length),
    page: safePage, pageSize, totalPages,
    itemLabel: 'dòng',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  const {
    selectedIds,
    setSelectedIds,
    allSelected: allPageSelected,
    someSelected: somePageSelected,
    toggle: toggleSelect,
    toggleAll: toggleSelectAll,
  } = useRowSelection({ rows: pageRows })

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
  const isDefaultSort = sortState.col === '__stt' && sortState.dir === 'asc'
  // Kéo thả hàng chỉ hợp lệ khi đang ở thứ tự thủ công (không lọc cột, không sắp theo cột khác)
  const canReorder = canEdit && colFilterCount === 0 && sortState.col === '__stt' && sortState.dir === 'asc'

  // ── Row mutations ────────────────────────────────────────────────────────────
  async function addRow() {
    try {
      const row = await api.createRow(companyId, def.id, {})
      // Backend gán position = cuối → thêm vào cuối danh sách (giống Excel thêm dòng dưới cùng)
      setRows((p) => [...p, row])
      setColFilters({})
      setSortState({ col: '__stt', dir: 'asc' })  // về thứ tự thủ công để thấy dòng mới
      return row
    } catch { addToast('Không thể thêm dòng', 'error'); return null }
  }
  // Thêm dòng rồi đặt con trỏ nhập vào ô đầu (dùng cho Enter/Tab ở cuối bảng)
  async function addRowAndFocus(colKey) {
    const row = await addRow()
    if (row) setPendingFocus({ rowId: row.id, colKey })
  }

  // Cột điều hướng bằng phím (Tab/Enter) — chỉ ô ĐƠN GIẢN (bỏ computed/formula/file/link).
  const editableCols = useMemo(() => columns.filter((c) => !NON_SIMPLE_TYPES.includes(c.dataType)), [columns])

  // Điều hướng ô bằng phím: next=Tab, prev=Shift+Tab, down=Enter, cancel=Esc
  function navigateCell(rowId, colKey, dir) {
    if (dir === 'cancel') { setActiveCell(null); return }
    if (!editableCols.length) return
    const rIdx = displayed.findIndex((r) => r.id === rowId)
    const cIdx = editableCols.findIndex((c) => c.colKey === colKey)
    if (rIdx < 0 || cIdx < 0) { setActiveCell(null); return }

    const goTo = (targetRowId, targetColKey) => {
      const idx = displayed.findIndex((r) => r.id === targetRowId)
      if (idx >= 0) {
        const tp = Math.floor(idx / pageSize) + 1
        if (tp !== safePage) setPage(tp)
      }
      setActiveCell({ rowId: targetRowId, colKey: targetColKey })
    }

    if (dir === 'next') {
      if (cIdx < editableCols.length - 1) return goTo(rowId, editableCols[cIdx + 1].colKey)
      if (rIdx < displayed.length - 1)    return goTo(displayed[rIdx + 1].id, editableCols[0].colKey)
      return addRowAndFocus(editableCols[0].colKey)          // cuối bảng → thêm dòng
    }
    if (dir === 'prev') {
      if (cIdx > 0)      return goTo(rowId, editableCols[cIdx - 1].colKey)
      if (rIdx > 0)      return goTo(displayed[rIdx - 1].id, editableCols[editableCols.length - 1].colKey)
      return                                                  // ô đầu tiên → giữ nguyên
    }
    if (dir === 'down') {
      if (rIdx < displayed.length - 1) return goTo(displayed[rIdx + 1].id, colKey)
      return addRowAndFocus(colKey)                           // dòng cuối → thêm dòng mới
    }
    // ── Điều hướng bằng phím mũi tên (như Excel): thuần lưới, KHÔNG wrap, KHÔNG thêm dòng ──
    if (dir === 'left'  && cIdx > 0)                     return goTo(rowId, editableCols[cIdx - 1].colKey)
    if (dir === 'right' && cIdx < editableCols.length - 1) return goTo(rowId, editableCols[cIdx + 1].colKey)
    if (dir === 'up'    && rIdx > 0)                     return goTo(displayed[rIdx - 1].id, colKey)
    if (dir === 'downCell' && rIdx < displayed.length - 1) return goTo(displayed[rIdx + 1].id, colKey)
  }

  // Sau khi thêm dòng: chuyển đúng trang + mở ô nhập của dòng mới
  useEffect(() => {
    if (!pendingFocus) return
    const idx = displayed.findIndex((r) => r.id === pendingFocus.rowId)
    if (idx < 0) return
    setPage(Math.floor(idx / pageSize) + 1)
    setActiveCell({ rowId: pendingFocus.rowId, colKey: pendingFocus.colKey ?? editableCols[0]?.colKey })
    setPendingFocus(null)
  }, [pendingFocus, displayed, pageSize, editableCols])

  // ── Kéo thả sắp xếp hàng ─────────────────────────────────────────────────────
  function handleRowDrop(targetId) {
    setDragOverId(null)
    const srcId = dragRowId
    setDragRowId(null)
    if (!srcId || srcId === targetId || !canReorder) return
    const order = displayed.map((r) => r.id)          // thứ tự thủ công hiện tại (position asc, toàn bộ)
    const from = order.indexOf(srcId), to = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    order.splice(to, 0, order.splice(from, 1)[0])
    // Cập nhật position cục bộ ngay (optimistic) rồi lưu server
    setRows((prev) => {
      const rank = new Map(order.map((id, i) => [id, i]))
      return prev.map((r) => (rank.has(r.id) ? { ...r, position: rank.get(r.id) } : r))
    })
    api.reorderRows(companyId, def.id, order).catch(() => { addToast('Không thể lưu thứ tự', 'error'); load() })
  }
  async function saveCell(row, colKey, value) {
    try {
      const updated = await api.updateRow(companyId, def.id, row.id, { [colKey]: value })
      setRows((p) => p.map((r) => r.id === updated.id ? updated : r))
    } catch { addToast('Không thể lưu', 'error') }
  }

  async function handleTablePaste(event) {
    if (!canEdit || !activeCell || !editableCols.length) return
    const startColumnIndex = editableCols.findIndex((column) => column.colKey === activeCell.colKey)
    const startRowIndex = displayed.findIndex((row) => row.id === activeCell.rowId)
    if (startColumnIndex < 0 || startRowIndex < 0) return

    const clipboardText = event.clipboardData?.getData('text/plain') ?? ''
    const grid = parseClipboardGrid(clipboardText)
    const isRangePaste = grid.length > 1 || (grid[0]?.length ?? 0) > 1
    const startColumn = editableCols[startColumnIndex]
    // Text/number/select một ô vẫn dùng paste native của editor. DateBox không có input text hiển thị,
    // nên phải bắt clipboard tại table để chuẩn hóa ngày.
    if (!isRangePaste && startColumn.dataType !== 'date') return

    event.preventDefault()
    event.stopPropagation()
    const maxClipboardColumns = Math.max(0, ...grid.map((row) => row.length))
    const targetColumns = editableCols.slice(startColumnIndex, startColumnIndex + maxClipboardColumns)
    if (!targetColumns.length) return
    const normalized = normalizeClipboardGrid(grid, targetColumns)
    if (normalized.errors.length) {
      const remaining = normalized.errors.length - 1
      addToast(`${normalized.errors[0]}${remaining > 0 ? ` (+${remaining} lỗi khác)` : ''}`, 'error')
      return
    }

    setActiveCell(null)
    let nextRows = [...rows]
    let changed = 0
    let created = 0
    let lastTarget = null
    try {
      for (let rowOffset = 0; rowOffset < normalized.values.length; rowOffset += 1) {
        const values = normalized.values[rowOffset]
        const payload = {}
        values.forEach((value, columnOffset) => {
          const column = targetColumns[columnOffset]
          if (column) payload[column.colKey] = value
        })
        if (!Object.keys(payload).length) continue

        const existing = displayed[startRowIndex + rowOffset]
        let saved
        if (existing) {
          saved = await api.updateRow(companyId, def.id, existing.id, payload)
          nextRows = nextRows.map((row) => row.id === saved.id ? saved : row)
        } else {
          saved = await api.createRow(companyId, def.id, payload)
          nextRows.push(saved)
          created += 1
        }
        changed += 1
        lastTarget = { rowId: saved.id, colKey: targetColumns[Math.min(values.length, targetColumns.length) - 1].colKey }
      }
      setRows(nextRows)
      if (created > 0) {
        setColFilters({})
        setSortState({ col: '__stt', dir: 'asc' })
      }
      if (lastTarget) setPendingFocus(lastTarget)
      addToast(`Đã dán dữ liệu vào ${changed} dòng${created ? `, tạo mới ${created} dòng` : ''}`, 'success')
    } catch (error) {
      setRows(nextRows)
      addToast(error.response?.data?.error?.message ?? `Chỉ lưu được ${changed}/${normalized.values.length} dòng`, 'error')
    }
  }
  async function removeRow(row) {
    setDeletingRow(row.id)
    try { await api.deleteRow(companyId, def.id, row.id); setRows((p) => p.filter((r) => r.id !== row.id)) }
    catch { addToast('Không thể xoá dòng', 'error') }
    finally { setDeletingRow(null) }
  }

  // ── Row multi-select + bulk delete ───────────────────────────────────────────
  async function bulkDelete() {
    if (!selectedIds.size) return
    if (!(await confirmDelete({ title: 'Xóa dòng dữ liệu', message: <>Bạn có chắc chắn muốn xóa <strong>{selectedIds.size}</strong> dòng đã chọn?</>, confirmLabel: `Xóa ${selectedIds.size} mục` }))) return
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
  // Import: bỏ cột computed/formula/file (không nhập được). Link nhập dạng text (1 URL).
  const importCols = useMemo(() => {
    const cols = columns.filter((c) => !['computed', 'formula', 'file'].includes(c.dataType)).map((c) => ({
      key: c.colKey, label: c.label, required: c.required,
      type: c.dataType === 'number' ? 'number' : c.dataType === 'date' ? 'date' : 'text',
      example: '',
    }))
    // Cột "ID dòng" (tùy chọn) — dùng khi cập nhật theo ID; thêm mới thì để trống
    cols.push({ key: '__id', label: 'ID dòng', required: false, type: 'text', example: '' })
    return cols
  }, [columns])
  // matchKey (khoá đối chiếu upsert) chỉ hợp lý với cột vô hướng
  const matchKeyOptions = useMemo(
    () => columns.filter((c) => !NON_SIMPLE_TYPES.includes(c.dataType)).map((c) => ({ value: c.colKey, label: c.label })),
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

  const colSpan = columns.length + 2 + (canEdit ? 2 : 0) // [drag]+[check] + STT + columns + actions

  return (
    <div ref={tabRef}>
      {/* Toolbar */}
      <div className={s.hdldToolbar}>
        {!loading && (
          <span className={s.hdldToolbarCount}>
            {displayed.length}{displayed.length < rows.length && `/${rows.length}`} dòng
            {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
            {!isDefaultSort && ' · đang sắp xếp'}
          </span>
        )}
        {(colFilterCount > 0 || !isDefaultSort) && (
          <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`}
            onClick={() => { setColFilters({}); setSortState({ col: '__stt', dir: 'asc' }) }}>
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
          {canEdit && isPivot && (
            <button className={`${s.btnOutline} ${s.hdldToolbarBtn}`} onClick={() => handleSyncGroups(false)}
              disabled={syncing} title="Sinh dòng theo các nhóm (Chương/Tiểu mục…) khác nhau ở bảng cha">
              {syncing ? <Loader2 size={13} className={s.spin} /> : <RefreshCw size={13} />} Đồng bộ nhóm
            </button>
          )}
          <button className={`${s.btnOutline} ${s.hdldToolbarBtn} ${s.hdldExportBtn}`} onClick={() => setShowExport(true)} disabled={loading || rows.length === 0}>
            <Download size={13} /> Xuất Excel
          </button>
          {canEdit && columns.length > 0 && (
            <button className={`${s.btnOutline} ${s.hdldToolbarBtn} ${s.hdldImportBtn}`} onClick={() => setShowImport(true)}>
              <Upload size={13} /> Nhập Excel
            </button>
          )}
          {canEdit && (
            <button className={`${s.btnNavy} ${s.hdldToolbarBtn} ${s.hdldAddRowBtn}`} onClick={() => addRowAndFocus(editableCols[0]?.colKey)}>
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
            <table className={`${s.table} ${s.hdldTable}`} onPaste={handleTablePaste}>
              <thead>
                <tr>
                  {canEdit && <DragHeaderCell className={s.ctblDragTh} />}
                  {canEdit && (
                    <SelectionHeaderCell
                      className={s.hdldThStt}
                      allSelected={allPageSelected}
                      someSelected={somePageSelected}
                      onToggle={toggleSelectAll}
                    />
                  )}
                  <th className={`${s.hdldThStt} ${s.ctblTh}`}>
                    <div className={s.hdldThInner}>
                      <span className={s.hdldThLabel}>STT</span>
                      <button data-hdld-filter-btn
                        className={`${s.hdldFilterBtn} ${sortState.col === '__stt' && !isDefaultSort ? s.hdldFilterBtnActive : ''}`}
                        onClick={(e) => openFilter('__stt', e)} title="Sắp xếp theo thứ tự">
                        <Filter size={10} />
                      </button>
                    </div>
                  </th>
                  {columns.map((col) => {
                    const active = hasColFilter(col.colKey) || sortState.col === col.colKey
                    const w = colWidths[col.colKey] ?? col.width ?? undefined
                    return (
                      <th
                        key={col.colKey}
                        className={`${s.ctblTh} ${s.ctblThResizable}`}
                        style={w ? {
                          '--hdld-col-w': `${w}px`,
                          width: `${w}px`,
                          minWidth: `${w}px`,
                          maxWidth: `${w}px`,
                        } : undefined}
                      >
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
                {totals && displayed.length > 0 && (
                  <tr className={s.ctblTotalRow}>
                    {canEdit && <td className={s.ctblDragTd} />}
                    {canEdit && <td className={s.hdldCellStt} />}
                    <td className={s.hdldCellStt}>Tổng</td>
                    {columns.map((col) => (
                      <td key={col.colKey} className={s.ctblTotalCell}>
                        {totals[col.colKey] != null
                          ? <strong>{col.options?.thousands ? fmtNumberVN(totals[col.colKey]) : String(totals[col.colKey])}</strong>
                          : ''}
                      </td>
                    ))}
                    <td />
                  </tr>
                )}
                {displayed.length === 0 ? (
                  <tr><td colSpan={colSpan} className={s.hdldEmptyRow}>
                    {(colFilterCount > 0) ? 'Không có dòng khớp bộ lọc.' : 'Chưa có dữ liệu. Nhấn "Thêm dòng".'}
                  </td></tr>
                ) : pageRows.map((row, idx) => (
                  <tr key={row.id}
                    className={`${dragOverId === row.id ? s.ctblRowDragOver : ''} ${dragRowId === row.id ? s.ctblRowDragging : ''}`}
                    onDragOver={canReorder ? (e) => { e.preventDefault(); if (dragOverId !== row.id) setDragOverId(row.id) } : undefined}
                    onDrop={canReorder ? () => handleRowDrop(row.id) : undefined}
                  >
                    {canEdit && (
                      <DragRowCell
                        className={s.ctblDragTd}
                        enabled={canReorder}
                        enabledClassName={s.ctblDragHandle}
                        disabledClassName={s.ctblDragHandleOff}
                        handleProps={{
                          draggable: true,
                          onDragStart: () => setDragRowId(row.id),
                          onDragEnd: () => { setDragRowId(null); setDragOverId(null) },
                        }}
                      />
                    )}
                    {canEdit && (
                      <SelectionRowCell
                        className={s.hdldCellStt}
                        checked={selectedIds.has(row.id)}
                        onToggle={() => toggleSelect(row.id)}
                      />
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
                      if (col.dataType === 'formula') {
                        const { value, error } = evalFormula(col, row, columns)
                        return (
                          <td key={col.colKey} className={s.ctblFormulaCell}>
                            {error
                              ? <span className={s.ctblFormulaErr} title="Lỗi công thức">{error}</span>
                              : (value == null || value === '')
                                ? <span className={s.archInlineEmpty}>—</span>
                                : formatFormulaDisplay(col, value)}
                          </td>
                        )
                      }
                      if (col.dataType === 'link') {
                        return (
                          <LinkCell key={col.colKey} col={col} value={row.data?.[col.colKey]} canEdit={canEdit}
                            active={canEdit && activeCell?.rowId === row.id && activeCell?.colKey === col.colKey}
                            onActivate={() => canEdit && setActiveCell({ rowId: row.id, colKey: col.colKey })}
                            onSave={(val) => saveCell(row, col.colKey, val)} />
                        )
                      }
                      if (col.dataType === 'file') {
                        return (
                          <FileCell key={col.colKey} col={col} row={row}
                            files={filesByCell[`${row.id}|${col.colKey}`]}
                            canEdit={canEdit} onChanged={reloadFiles} addToast={addToast} />
                        )
                      }
                      return (
                        <EditableCell key={col.colKey} col={col} value={row.data?.[col.colKey]}
                          canEdit={canEdit}
                          active={canEdit && activeCell?.rowId === row.id && activeCell?.colKey === col.colKey}
                          onActivate={() => canEdit && setActiveCell({ rowId: row.id, colKey: col.colKey })}
                          onNavigate={(dir) => navigateCell(row.id, col.colKey, dir)}
                          onSave={(val) => saveCell(row, col.colKey, val)} />
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

        </div>
      )}

      {filterPopup && (() => {
        const col = filterPopup.colKey === '__stt'
          ? { colKey: '__stt', label: 'STT' }
          : columns.find((c) => c.colKey === filterPopup.colKey)
        if (!col) return null
        return (
          <ColumnFilterDropdown
            col={col} columns={columns} allRows={rows}
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
        <ExportModal def={def} columns={columns} rows={rows} company={company}
          filesByCell={filesByCell} clusterDefs={clusterDefs} companyId={companyId} addToast={addToast}
          onClose={() => setShowExport(false)} />
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
