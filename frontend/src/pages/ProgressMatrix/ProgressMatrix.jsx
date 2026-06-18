import { useState, useEffect, useMemo } from 'react'
import { Download, Loader2, LayoutGrid, AlertTriangle, Check } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useToastStore } from '../../stores/toastStore'
import { getTaskTypes, getYears, getMatrix, exportMatrix } from '../../api/progressMatrix'
import s from './ProgressMatrix.module.css'

const NOW = new Date()
const CUR_MONTH = NOW.getMonth() + 1
const CUR_YEAR = NOW.getFullYear()

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ProgressMatrix() {
  const addToast = useToastStore((st) => st.toast)

  const [taskTypes, setTaskTypes] = useState([])
  const [taskTypeId, setTaskTypeId] = useState('')
  const [availableYears, setAvailableYears] = useState([])
  const [month, setMonth] = useState(CUR_MONTH)
  const [year, setYear] = useState(CUR_YEAR)

  const [matrix, setMatrix] = useState(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Load task types + năm có dữ liệu (từ DB) + chọn mặc định
  useEffect(() => {
    getTaskTypes()
      .then((tts) => {
        setTaskTypes(tts)
        const def = tts.find((t) => t.stepCount > 0) ?? tts[0]
        if (def) setTaskTypeId(def.id)
      })
      .catch(() => addToast('Không tải được danh sách quy trình', 'error'))

    getYears()
      .then((years) => {
        const list = years.length ? years : [CUR_YEAR]
        setAvailableYears(list)
        // Nếu năm hiện tại không có dữ liệu → mặc định năm mới nhất có dữ liệu
        if (!list.includes(CUR_YEAR)) setYear(list[0])
      })
      .catch(() => setAvailableYears([CUR_YEAR]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load matrix khi đổi tham số
  useEffect(() => {
    if (!taskTypeId) return
    let cancelled = false
    setLoading(true)
    getMatrix({ taskTypeId, month, year })
      .then((data) => { if (!cancelled) setMatrix(data) })
      .catch(() => { if (!cancelled) { setMatrix(null); addToast('Không tải được dữ liệu', 'error') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [taskTypeId, month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nhóm task type theo group_name cho <optgroup>
  const grouped = useMemo(() => {
    const map = new Map()
    for (const tt of taskTypes) {
      const g = tt.groupName || 'Khác'
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(tt)
    }
    return [...map.entries()]
  }, [taskTypes])

  async function handleExport() {
    if (!taskTypeId) return
    setExporting(true)
    try {
      const { blob, filename } = await exportMatrix({ taskTypeId, month, year })
      downloadBlob(blob, filename)
    } catch {
      addToast('Không thể xuất Excel', 'error')
    } finally {
      setExporting(false)
    }
  }

  const columns = matrix?.columns ?? []
  const rows = matrix?.rows ?? []
  const hasNoColumns = matrix && columns.length === 0

  return (
    <AppLayout>
      <div className={s.page}>
        {/* Toolbar */}
        <div className={s.toolbar}>
          <div className={s.titleGroup}>
            <span className={s.titleIcon}><LayoutGrid size={18} /></span>
            <div>
              <h1 className={s.title}>BC Tiến độ CV</h1>
              <p className={s.subtitle}>Ma trận theo dõi tiến độ quy trình theo khách hàng</p>
            </div>
          </div>
          <button className={s.btnExport} onClick={handleExport} disabled={exporting || loading || !rows.length}>
            {exporting ? <Loader2 size={14} className={s.spin} /> : <Download size={14} />}
            Xuất Excel
          </button>
        </div>

        {/* Filters */}
        <div className={s.filterBar}>
          <div className={s.filterGroup}>
            <label className={s.filterLabel}>Quy trình</label>
            <select className={s.select} value={taskTypeId} onChange={(e) => setTaskTypeId(e.target.value)}>
              {grouped.map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.name}{tt.stepCount === 0 ? ' (chưa có bước)' : ` · ${tt.stepCount} bước`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className={s.filterGroup}>
            <label className={s.filterLabel}>Tháng</label>
            <select className={s.select} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
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
        {matrix && !hasNoColumns && (
          <h2 className={s.matrixTitle}>
            BẢNG THEO DÕI TIẾN ĐỘ {matrix.taskType.name.toUpperCase()} VỚI KH — {matrix.period.label}
          </h2>
        )}

        {/* Content */}
        {loading ? (
          <div className={s.stateBox}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : hasNoColumns ? (
          <div className={s.stateBox}>
            <AlertTriangle size={20} className={s.warnIcon} />
            Quy trình này chưa cấu hình bước công việc (checklist). Vào <strong>Cài đặt → Loại công việc</strong> để thêm các bước.
          </div>
        ) : rows.length === 0 ? (
          <div className={s.stateBox}>
            <LayoutGrid size={22} className={s.emptyIcon} />
            Chưa có khách hàng nào phát sinh quy trình này trong {matrix?.period.label ?? 'kỳ đã chọn'}.
          </div>
        ) : (
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
                {rows.map((r) => (
                  <tr key={r.taskId} className={s.tr}>
                    <td className={`${s.td} ${s.colName} ${s.tdName}`}>{r.companyName}</td>
                    <td className={`${s.td} ${s.colTax} ${s.tdMuted}`}>{r.taxCode || '—'}</td>
                    <td className={`${s.td} ${s.colStaff}`}>{r.assigneeName || '—'}</td>
                    {r.cells.map((cell, i) => (
                      <td key={i} className={`${s.td} ${s.tdCell} ${cell.done ? s.cellDone : ''}`}
                        title={cell.done && cell.completedAt ? `Hoàn thành: ${new Date(cell.completedAt).toLocaleDateString('vi-VN')}` : undefined}>
                        {cell.done && <Check size={14} className={s.checkIcon} />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
