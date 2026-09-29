import { useState, useEffect, useCallback } from 'react'
import { Target, Loader2, Lock, LockOpen, Building2, Tag, X } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { listKpi, getKpiDetail, closeKpiMonth, reopenKpiMonth } from '../../api/kpi'
import s from './kpi.module.css'

const now = new Date()
const YEARS = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function Kpi() {
  const isAdmin  = useAuthStore((st) => st.user?.role === 'admin')
  const addToast = useToastStore((st) => st.toast)
  const confirmAction = useDeleteConfirm()

  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState({ closed: false, rows: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]   = useState(false)
  const [detail, setDetail] = useState(null)   // { user, data }

  const load = useCallback(() => {
    setLoading(true)
    listKpi(year, month)
      .then(setData)
      .catch(() => { setData({ closed: false, rows: [] }); addToast('Không tải được KPI', 'error') })
      .finally(() => setLoading(false))
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleClose() {
    if (!(await confirmAction({
      title: 'Chốt sổ KPI tháng', confirmLabel: 'Chốt sổ',
      warning: 'Sau khi chốt, số liệu tháng này được khóa (có thể Mở lại để tính lại).',
      message: <>Chốt sổ KPI <strong>Tháng {month}/{year}</strong>? Số liệu sẽ được lưu &amp; khóa lại (đổi điểm/checklist về sau không ảnh hưởng tháng này).</>,
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

  return (
    <AppLayout>
      <div className={s.page}>
        <div className={s.headerRow}>
          <div className={s.titleGroup}>
            <span className={s.titleIcon}><Target size={18} /></span>
            <div>
              <h1 className={s.title}>KPI nhân viên</h1>
              <p className={s.subtitle}>Điểm khối lượng (theo checklist) &amp; đúng hạn theo tháng</p>
            </div>
          </div>
          <div className={s.actions}>
            <select className={s.select} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select className={s.select} value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className={`${s.statusBadge} ${data.closed ? s.statusClosed : s.statusOpen}`}>
              {data.closed ? <><Lock size={12} /> Đã chốt sổ</> : <><LockOpen size={12} /> Đang mở</>}
            </span>
            {isAdmin && (data.closed
              ? <button className={s.btnSecondary} onClick={handleReopen} disabled={busy}>Mở lại sổ</button>
              : <button className={s.btnPrimary} onClick={handleClose} disabled={busy}>{busy ? <Loader2 size={13} className={s.spin} /> : <Lock size={13} />} Chốt sổ tháng</button>
            )}
          </div>
        </div>

        <div className={s.card}>
          {loading ? (
            <div className={s.loadingBox}><Loader2 size={18} className={s.spin} /> Đang tải...</div>
          ) : data.rows.length === 0 ? (
            <div className={s.empty}>Chưa có dữ liệu KPI cho tháng này.</div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.colStt}>STT</th>
                  <th>Nhân viên</th>
                  <th className={s.num}>Điểm khối lượng</th>
                  <th className={s.num}>Đúng hạn</th>
                  <th className={s.num}>Tỉ lệ đúng hạn</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId} className={s.rowClickable} onClick={() => openDetail(r)}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td>
                      <div className={s.nvName}>{r.userName}</div>
                      {r.jobTitle && <div className={s.nvJob}>{r.jobTitle}</div>}
                    </td>
                    <td className={s.num}><strong className={s.volume}>{r.volumePoints}</strong> đ</td>
                    <td className={s.num}>{r.onTimeCount}/{r.assignedCount}</td>
                    <td className={s.num}>
                      {r.onTimePct == null ? <span className={s.muted}>—</span>
                        : <span className={r.onTimePct >= 80 ? s.pctGood : r.onTimePct >= 50 ? s.pctMid : s.pctLow}>{r.onTimePct}%</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {detail && (
          <Modal title={`KPI — ${detail.user.userName} · Tháng ${month}/${year}`} onClose={() => setDetail(null)} width="min(680px, calc(100vw - 40px))">
            {!detail.data ? (
              <div className={s.loadingBox}><Loader2 size={16} className={s.spin} /> Đang tải...</div>
            ) : (
              <div className={s.detailWrap}>
                <div className={s.detailStats}>
                  <div className={s.stat}><span className={s.statLabel}>Điểm khối lượng</span><span className={s.statValue}>{detail.user.volumePoints} đ</span></div>
                  <div className={s.stat}><span className={s.statLabel}>Đúng hạn</span><span className={s.statValue}>{detail.user.onTimeCount}/{detail.user.assignedCount}{detail.user.onTimePct != null ? ` (${detail.user.onTimePct}%)` : ''}</span></div>
                </div>
                <div className={s.detailCols}>
                  <div className={s.detailCol}>
                    <div className={s.detailColHead}><Building2 size={13} /> Theo công ty</div>
                    {detail.data.byCompany.length === 0 ? <div className={s.detailEmpty}>Chưa có điểm.</div>
                      : detail.data.byCompany.map((x) => (
                        <div key={x.key} className={s.detailItem}><span className={s.detailItemLabel}>{x.label}</span><span className={s.detailItemVal}>{x.volumePoints} đ</span></div>
                      ))}
                  </div>
                  <div className={s.detailCol}>
                    <div className={s.detailColHead}><Tag size={13} /> Theo loại công việc</div>
                    {detail.data.byType.length === 0 ? <div className={s.detailEmpty}>Chưa có điểm.</div>
                      : detail.data.byType.map((x) => (
                        <div key={x.key} className={s.detailItem}><span className={s.detailItemLabel}>{x.label}</span><span className={s.detailItemVal}>{x.volumePoints} đ</span></div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </Modal>
        )}
      </div>
    </AppLayout>
  )
}
