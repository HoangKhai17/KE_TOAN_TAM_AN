import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Lock, LockOpen } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import { listKpi, getKpiDetail, closeKpiMonth, reopenKpiMonth, getKpiPerformance } from '../../api/kpi'
import s from './rewardPenalty.module.css'

const now = new Date()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN')
const fmtSigned = (n) => { const v = Number(n) || 0; return v > 0 ? `+${v}` : `${v}` }
const gradeCls = (sort) => (sort != null ? s[`gradeC${sort}`] : '')

export default function KpiPanel({ isAdmin, slot, years = [now.getFullYear()] }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmAction = useDeleteConfirm()

  const [sub, setSub]     = useState('progress')   // progress | grade
  const [year, setYear]   = useState(years[0] ?? now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState({ closed: false, rows: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]   = useState(false)
  const [detail, setDetail] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    const fetcher = sub === 'grade' ? getKpiPerformance(year, month) : listKpi(year, month)
    fetcher.then(setData)
      .catch(() => { setData({ closed: false, rows: [] }); addToast('Không tải được KPI', 'error') })
      .finally(() => setLoading(false))
  }, [year, month, sub]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  async function handleClose() {
    if (!(await confirmAction({
      title: 'Chốt sổ KPI tháng', confirmLabel: 'Chốt sổ',
      warning: 'Sau khi chốt, số liệu tháng này được khóa (có thể Mở lại để tính lại).',
      message: <>Chốt sổ KPI <strong>Tháng {month}/{year}</strong>? Số liệu sẽ được lưu &amp; khóa lại.</>,
    }))) return
    setBusy(true)
    try { const r = await closeKpiMonth(year, month); addToast(`Đã chốt sổ ${r.users} nhân viên`, 'success'); load() }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Không thể chốt sổ', 'error') }
    finally { setBusy(false) }
  }
  async function handleReopen() {
    if (!(await confirmAction({
      title: 'Mở lại sổ KPI', confirmLabel: 'Mở lại',
      warning: 'Snapshot đã chốt của tháng này sẽ bị xoá; KPI quay lại tính động (live).',
      message: <>Mở lại KPI <strong>Tháng {month}/{year}</strong> để tính lại?</>,
    }))) return
    setBusy(true)
    try { await reopenKpiMonth(year, month); addToast('Đã mở lại sổ', 'success'); load() }
    catch (e) { addToast(e.response?.data?.error?.message ?? 'Không thể mở lại', 'error') }
    finally { setBusy(false) }
  }
  async function openDetail(row) {
    setDetail({ user: row, data: null })
    try { const d = await getKpiDetail(row.userId, year, month); setDetail({ user: row, data: d }) }
    catch { setDetail({ user: row, data: { byCompany: [], byType: [] } }) }
  }

  const toolbar = (
    <div className={s.toolbar}>
      <label className={s.toolField}>Tháng <select className={s.select} value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}</select></label>
      <label className={s.toolField}>Năm <select className={s.select} value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
      <span className={`${s.gradeBadge} ${data.closed ? s.gradeC2 : s.gradeC4}`}>{data.closed ? <><Lock size={12} /> Đã chốt</> : <><LockOpen size={12} /> Đang mở</>}</span>
      {isAdmin && (data.closed
        ? <button className={s.btnSecondary} onClick={handleReopen} disabled={busy}>Mở lại sổ</button>
        : <button className={s.btnPrimary} onClick={handleClose} disabled={busy}>{busy ? <Loader2 size={13} className={s.spin} /> : <Lock size={13} />} Chốt sổ tháng</button>
      )}
    </div>
  )

  return (
    <div className={s.card}>
      {slot && createPortal(toolbar, slot)}
      <div className={s.tabLinks} role="tablist" style={{ marginBottom: 12, alignSelf: 'flex-start' }}>
        <button className={`${s.tab} ${sub === 'progress' ? s.tabActive : ''}`} onClick={() => setSub('progress')}>Tiến độ</button>
        <button className={`${s.tab} ${sub === 'grade' ? s.tabActive : ''}`} onClick={() => setSub('grade')}>Xếp loại &amp; thưởng</button>
      </div>

      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
        <div className={s.tableWrap}>
          {data.rows.length === 0 ? <div className={s.empty}>Chưa có dữ liệu KPI cho tháng này.</div>
          : sub === 'progress' ? (
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Điểm khối lượng</th><th className={s.num}>Đúng hạn</th><th className={s.num}>Tỉ lệ đúng hạn</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td title={r.jobTitle || undefined}>{r.userName}</td>
                    <td className={s.num}><strong>{r.volumePoints}</strong> đ</td>
                    <td className={s.num}>{r.onTimeCount}/{r.assignedCount}</td>
                    <td className={s.num}>{r.onTimePct == null ? <span className={s.zero}>—</span> : `${r.onTimePct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Đúng hạn</th><th className={s.num}>Điểm KPI</th>
                <th className={s.num}>Thưởng/phạt</th><th className={s.num}>Tổng điểm</th>
                <th>Xếp loại</th><th className={s.num}>Thưởng/phạt (đ)</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td title={r.jobTitle || undefined}>{r.userName}</td>
                    <td className={s.num}>{r.onTimePct == null ? <span className={s.zero}>—</span> : `${r.onTimePct}%`}</td>
                    <td className={s.num}>{fmtSigned(r.kpiPoints)}</td>
                    <td className={s.num}>{fmtSigned(r.rewardPenaltyNet)}</td>
                    <td className={s.num}><strong>{fmtSigned(r.totalPoints)}</strong></td>
                    <td>{r.gradeCode ? <span className={`${s.gradeBadge} ${gradeCls(r.gradeSort)}`} title={r.gradeLabel}>{r.gradeCode}{r.gradeLabel ? ` · ${r.gradeLabel}` : ''}</span> : <span className={s.zero}>—</span>}</td>
                    <td className={s.num}>{r.amount ? fmtMoney(r.amount) : <span className={s.zero}>—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {sub === 'grade' && (
        <div className={s.cardFoot}>ℹ️ <strong>Điểm KPI</strong> quy từ <strong>% đúng hạn</strong> theo mốc (tab <strong>Quy đổi xếp loại</strong>). <strong>Tổng điểm</strong> = Điểm KPI + Thưởng/phạt → dò xếp loại → ra tiền.</div>
      )}

      {detail && (
        <Modal title={`KPI — ${detail.user.userName} · Tháng ${month}/${year}`} onClose={() => setDetail(null)} width="min(680px, calc(100vw - 40px))">
          {!detail.data ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Theo công ty</th><th className={s.num}>Điểm</th></tr></thead>
                <tbody>
                  {detail.data.byCompany.length === 0 ? <tr><td colSpan={2} className={s.empty}>Chưa có điểm.</td></tr>
                    : detail.data.byCompany.map((x) => <tr key={x.key}><td>{x.label}</td><td className={s.num}>{x.volumePoints} đ</td></tr>)}
                </tbody>
              </table>
              <table className={s.table} style={{ marginTop: 12 }}>
                <thead><tr><th>Theo loại công việc</th><th className={s.num}>Điểm</th></tr></thead>
                <tbody>
                  {detail.data.byType.length === 0 ? <tr><td colSpan={2} className={s.empty}>Chưa có điểm.</td></tr>
                    : detail.data.byType.map((x) => <tr key={x.key}><td>{x.label}</td><td className={s.num}>{x.volumePoints} đ</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
