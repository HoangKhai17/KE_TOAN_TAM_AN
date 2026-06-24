import { useState, useEffect, useMemo } from 'react'
import { Download, Loader2, LayoutGrid, AlertTriangle, Check, FileSpreadsheet } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useCompanyOptions, useStaffOptions } from '../../hooks/useReferenceData'
import { useProgressTaskTypes, useProgressYears, useProgressSources } from '../../hooks/useProgressMatrixData'
import {
  getMatrix, getByCompany, getByStaff, exportReport,
} from '../../api/progressMatrix'
import s from './ProgressMatrix.module.css'

const NOW = new Date()
const CUR_MONTH = NOW.getMonth() + 1
const CUR_YEAR = NOW.getFullYear()

const TABS = [
  { id: 'matrix',  label: 'Theo quy trình' },
  { id: 'company', label: 'Theo công ty' },
  { id: 'staff',   label: 'Theo nhân viên' },
]

const STATUS_CLASS = {
  pending: s.stPending, in_progress: s.stProgress, on_hold: s.stHold,
  pending_review: s.stReview, needs_revision: s.stRevision, completed: s.stDone,
}

// Cột tùy chọn cho popup xuất (theo view) — Tên-KH/Quy-trình/Công-ty là cột cố định luôn có
const EXPORT_OPTIONAL_COLS = {
  matrix:  [{ key: 'taxCode', label: 'Mã số thuế' }, { key: 'assignee', label: 'NV quản lý' }],
  company: [{ key: 'source', label: 'Nguồn' }, { key: 'assignee', label: 'NV phụ trách' }, { key: 'progress', label: 'Tiến độ' }, { key: 'status', label: 'Trạng thái' }, { key: 'dueDate', label: 'Hết hạn' }],
  staff:   [{ key: 'source', label: 'Nguồn' }, { key: 'taskType', label: 'Quy trình' }, { key: 'progress', label: 'Tiến độ' }, { key: 'status', label: 'Trạng thái' }, { key: 'dueDate', label: 'Hết hạn' }],
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Matrix table (Theo quy trình) ───────────────────────────────────────────────
function MatrixTable({ matrix }) {
  const columns = matrix.columns
  return (
    <div className={s.tableWrap}>
      <table className={s.matrix}>
        <thead>
          <tr>
            <th className={`${s.th} ${s.colName}`}>Tên khách hàng</th>
            <th className={`${s.th} ${s.colTax}`}>Mã số thuế</th>
            <th className={`${s.th} ${s.colStaff}`}>NV quản lý</th>
            {columns.map((c) => (
              <th key={c.stepOrder + c.stepText} className={`${s.th} ${s.thStep}`}>{c.stepText}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.taskId} className={s.tr}>
              <td className={`${s.td} ${s.colName} ${s.tdName}`}>{r.companyName}</td>
              <td className={`${s.td} ${s.colTax} ${s.tdMuted}`}>{r.taxCode || '—'}</td>
              <td className={`${s.td} ${s.colStaff}`}>{r.assigneeName || '—'}</td>
              {r.cells.map((cell, i) => (
                <td key={i} className={`${s.td} ${s.tdCell} ${cell.done ? s.cellDone : ''}`}
                  title={cell.done && cell.completedAt ? `Hoàn thành: ${fmtDate(cell.completedAt)}` : undefined}>
                  {cell.done && <Check size={14} className={s.checkIcon} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Summary table (Theo công ty / Theo nhân viên) ───────────────────────────────
function SummaryTable({ data }) {
  const isCompany = data.view === 'company'
  return (
    <div className={s.tableWrap}>
      <table className={s.summary}>
        <thead>
          <tr>
            <th className={s.th}>{isCompany ? 'Quy trình' : 'Công ty'}</th>
            <th className={s.th}>Nguồn</th>
            <th className={s.th}>{isCompany ? 'NV phụ trách' : 'Quy trình'}</th>
            <th className={s.th}>Tiến độ</th>
            <th className={s.th}>Trạng thái</th>
            <th className={s.th}>Hết hạn</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => {
            const pct = r.percent ?? 0
            return (
              <tr key={r.taskId} className={s.tr}>
                <td className={`${s.td} ${s.tdName}`}>{isCompany ? r.taskTypeName : r.companyName}</td>
                <td className={s.td}><span className={s.sourceChip}>{r.sourceLabel}</span></td>
                <td className={s.td}>{isCompany ? (r.assigneeName || '—') : r.taskTypeName}</td>
                <td className={s.td}>
                  <div className={s.progressCell}>
                    <div className={s.progressBar}>
                      <div className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`} style={{ '--pm-pct': `${pct}%` }} />
                    </div>
                    <span className={s.progressText}>
                      {r.hasChecklist ? `${r.doneSteps}/${r.totalSteps} · ${pct}%` : `${pct}%`}
                    </span>
                  </div>
                </td>
                <td className={s.td}>
                  <span className={`${s.statusBadge} ${STATUS_CLASS[r.status] ?? ''}`}>{r.statusLabel}</span>
                </td>
                <td className={`${s.td} ${s.tdMuted}`}>{fmtDate(r.dueDate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Export review modal ─────────────────────────────────────────────────────────
function ExportModal({ view, filters, data, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const optionalCols = EXPORT_OPTIONAL_COLS[view]
  const [selected, setSelected] = useState(() => new Set(optionalCols.map((c) => c.key)))
  const [exporting, setExporting] = useState(false)

  function toggle(key) {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Preview (5 dòng đầu)
  const previewRows = (data?.rows ?? []).slice(0, 5)
  const fixedHeader = view === 'matrix' ? 'Tên khách hàng' : view === 'company' ? 'Quy trình' : 'Công ty'

  async function handleExport() {
    setExporting(true)
    try {
      const body = { view, month: filters.month, year: filters.year, source: filters.source, columns: [...selected] }
      if (view === 'matrix') body.taskTypeId = filters.taskTypeId
      if (view === 'company') body.companyId = filters.companyId
      if (view === 'staff') body.staffId = filters.staffId
      const { blob, filename } = await exportReport(body)
      downloadBlob(blob, filename)
      addToast('Đã xuất Excel', 'success')
      onClose()
    } catch {
      addToast('Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal title="Xuất Excel" onClose={() => !exporting && onClose()} wide>
      <div className={s.modalBody}>
        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Chọn cột đưa vào file</div>
          <div className={s.colChecks}>
            <label className={`${s.colCheck} ${s.colCheckFixed}`}>
              <input type="checkbox" checked disabled />
              <span>{fixedHeader} <em className={s.fixedTag}>(luôn có)</em></span>
            </label>
            {view === 'matrix' && (
              <label className={`${s.colCheck} ${s.colCheckFixed}`}>
                <input type="checkbox" checked disabled />
                <span>Tất cả các bước checklist <em className={s.fixedTag}>(luôn có)</em></span>
              </label>
            )}
            {optionalCols.map((c) => (
              <label key={c.key} className={s.colCheck}>
                <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={s.modalSection}>
          <div className={s.modalSectionTitle}>Xem trước ({Math.min(5, data?.rows?.length ?? 0)} / {data?.rows?.length ?? 0} dòng)</div>
          <div className={s.previewWrap}>
            <table className={s.previewTable}>
              <thead>
                <tr>
                  <th>{fixedHeader}</th>
                  {view === 'matrix' && <th>Bước</th>}
                  {optionalCols.filter((c) => selected.has(c.key)).map((c) => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    <td>{view === 'matrix' ? r.companyName : view === 'company' ? r.taskTypeName : r.companyName}</td>
                    {view === 'matrix' && <td>{r.cells.filter((c) => c.done).length}/{r.cells.length}</td>}
                    {optionalCols.filter((c) => selected.has(c.key)).map((c) => (
                      <td key={c.key}>{previewCell(view, r, c.key)}</td>
                    ))}
                  </tr>
                ))}
                {previewRows.length === 0 && (
                  <tr><td colSpan={6} className={s.previewEmpty}>Không có dòng nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={s.modalActions}>
          <button className={s.btnOutline} onClick={onClose} disabled={exporting}>Huỷ</button>
          <button className={s.btnPrimary} onClick={handleExport} disabled={exporting || !data?.rows?.length}>
            {exporting ? <Loader2 size={14} className={s.spin} /> : <Download size={14} />}
            Xuất Excel
          </button>
        </div>
      </div>
    </Modal>
  )
}
function previewCell(view, r, key) {
  if (key === 'taxCode')  return r.taxCode || '—'
  if (key === 'assignee') return r.assigneeName || '—'
  if (key === 'taskType') return r.taskTypeName
  if (key === 'source')   return r.sourceLabel
  if (key === 'progress') return r.hasChecklist ? `${r.doneSteps}/${r.totalSteps} (${r.percent}%)` : `${r.percent}%`
  if (key === 'status')   return r.statusLabel
  if (key === 'dueDate')  return fmtDate(r.dueDate)
  return ''
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function ProgressMatrix() {
  const addToast = useToastStore((st) => st.toast)
  const isAdmin = useAuthStore((st) => st.user?.role === 'admin')

  const [tab, setTab] = useState('matrix')
  const [month, setMonth] = useState(CUR_MONTH)
  const [year, setYear] = useState(CUR_YEAR)
  // Dữ liệu tham chiếu — React Query (cache + gộp request dùng chung giữa các trang)
  const { data: taskTypes = [] } = useProgressTaskTypes()
  const { data: yearsData = [] } = useProgressYears()
  const { data: sources = [] }   = useProgressSources()
  const { data: companies = [] } = useCompanyOptions()
  const { data: staffList = [] } = useStaffOptions({ enabled: isAdmin })
  const availableYears = yearsData.length ? yearsData : [CUR_YEAR]

  const [taskTypeId, setTaskTypeId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')   // '' = tất cả nguồn

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showExport, setShowExport] = useState(false)

  // Đặt lựa chọn mặc định khi dữ liệu tham chiếu về (chỉ set lần đầu, không ghi đè lựa chọn của user)
  useEffect(() => {
    if (taskTypes.length && !taskTypeId) {
      const def = taskTypes.find((t) => t.stepCount > 0) ?? taskTypes[0]
      if (def) setTaskTypeId(def.id)
    }
  }, [taskTypes, taskTypeId])
  useEffect(() => {
    if (companies.length && !companyId) setCompanyId(companies[0].id)
  }, [companies, companyId])
  useEffect(() => {
    if (isAdmin && staffList.length && !staffId) setStaffId(staffList[0].id)
  }, [isAdmin, staffList, staffId])
  useEffect(() => {
    if (availableYears.length && !availableYears.includes(year)) setYear(availableYears[0])
  }, [availableYears, year])

  const subjectId = tab === 'matrix' ? taskTypeId : tab === 'company' ? companyId : staffId
  const canLoad = tab === 'staff' ? (isAdmin ? !!staffId : true) : !!subjectId

  // Tải dữ liệu của tab đang xem
  useEffect(() => {
    if (!canLoad) { setData(null); return }
    let cancelled = false
    setLoading(true)
    const src = sourceFilter || undefined
    const fetcher = tab === 'matrix'
      ? getMatrix({ taskTypeId, month, year, source: src })
      : tab === 'company'
        ? getByCompany({ companyId, month, year, source: src })
        : getByStaff({ staffId: staffId || undefined, month, year, source: src })
    fetcher
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) { setData(null); addToast('Không tải được dữ liệu', 'error') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tab, taskTypeId, companyId, staffId, month, year, sourceFilter, canLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = useMemo(() => {
    const map = new Map()
    for (const tt of taskTypes) { const g = tt.groupName || 'Khác'; if (!map.has(g)) map.set(g, []); map.get(g).push(tt) }
    return [...map.entries()]
  }, [taskTypes])

  // `data` của tab cũ có thể còn sót trong lúc fetch tab mới → chỉ dùng khi khớp tab
  const dataView = data ? (data.view ?? 'matrix') : null
  const ready = dataView === tab
  const rows = ready ? (data.rows ?? []) : []
  const hasNoColumns = ready && tab === 'matrix' && (data.columns?.length ?? 0) === 0
  const titleLine = !ready ? '' : tab === 'matrix'
    ? `BẢNG THEO DÕI TIẾN ĐỘ ${data.taskType.name.toUpperCase()} VỚI KH — ${data.period.label}`
    : tab === 'company'
      ? `TIẾN ĐỘ CÔNG VIỆC — ${data.subject.name} — ${data.period.label}`
      : `TIẾN ĐỘ CÔNG VIỆC — NV ${data.subject.name} — ${data.period.label}`

  const filters = { taskTypeId, companyId, staffId: staffId || undefined, month, year, source: sourceFilter || undefined }

  return (
    <AppLayout>
      <div className={s.page}>
        {/* Toolbar */}
        <div className={s.toolbar}>
          <div className={s.titleGroup}>
            <span className={s.titleIcon}><LayoutGrid size={18} /></span>
            <div>
              <h1 className={s.title}>BC Tiến độ CV</h1>
              <p className={s.subtitle}>Theo dõi tiến độ quy trình theo khách hàng / nhân viên</p>
            </div>
          </div>
          <button className={s.btnExport} onClick={() => setShowExport(true)} disabled={loading || !rows.length}>
            <FileSpreadsheet size={14} /> Xuất Excel
          </button>
        </div>

        {/* Tabs */}
        <div className={s.tabBar}>
          {TABS.map((t) => (
            <button key={t.id} className={`${s.tabBtn} ${tab === t.id ? s.tabBtnActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className={s.filterBar}>
          {tab === 'matrix' && (
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Quy trình</label>
              <select className={s.select} value={taskTypeId} onChange={(e) => setTaskTypeId(e.target.value)}>
                {grouped.map(([g, items]) => (
                  <optgroup key={g} label={g}>
                    {items.map((tt) => (
                      <option key={tt.id} value={tt.id}>{tt.name}{tt.stepCount === 0 ? ' (chưa có bước)' : ` · ${tt.stepCount} bước`}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          {tab === 'company' && (
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Khách hàng</label>
              <select className={s.select} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {tab === 'staff' && isAdmin && (
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Nhân viên</label>
              <select className={s.select} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
          <div className={s.filterGroup}>
            <label className={s.filterLabel}>Nguồn</label>
            <select className={s.select} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="">Tất cả nguồn</option>
              {sources.map((sc) => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
            </select>
          </div>
          <div className={s.filterGroup}>
            <label className={s.filterLabel}>Tháng</label>
            <select className={s.select} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
          </div>
          <div className={s.filterGroup}>
            <label className={s.filterLabel}>Năm</label>
            <select className={s.select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {availableYears.map((y) => <option key={y} value={y}>Năm {y}</option>)}
            </select>
          </div>
        </div>

        {/* Title line */}
        {data && !hasNoColumns && rows.length > 0 && <h2 className={s.matrixTitle}>{titleLine}</h2>}

        {/* Content */}
        {!canLoad ? (
          <div className={s.stateBox}>
            <LayoutGrid size={22} className={s.emptyIcon} />
            Hãy chọn {tab === 'matrix' ? 'quy trình' : tab === 'company' ? 'khách hàng' : 'nhân viên'} để xem.
          </div>
        ) : loading || !ready ? (
          <div className={s.stateBox}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : hasNoColumns ? (
          <div className={s.stateBox}>
            <AlertTriangle size={20} className={s.warnIcon} />
            Quy trình này chưa cấu hình bước công việc (checklist). Vào <strong>Cài đặt → Loại công việc</strong> để thêm các bước.
          </div>
        ) : rows.length === 0 ? (
          <div className={s.stateBox}>
            <LayoutGrid size={22} className={s.emptyIcon} />
            Không có dữ liệu trong {data?.period?.label ?? 'kỳ đã chọn'}.
          </div>
        ) : tab === 'matrix' ? (
          <MatrixTable matrix={data} />
        ) : (
          <SummaryTable data={data} />
        )}

        {showExport && ready && (
          <ExportModal view={tab} filters={filters} data={data} onClose={() => setShowExport(false)} />
        )}
      </div>
    </AppLayout>
  )
}
