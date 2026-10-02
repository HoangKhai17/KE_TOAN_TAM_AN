import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Lock, LockOpen, ChevronRight } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { listKpi, getKpiDetail, getKpiUserTasks, closeKpiMonth, reopenKpiMonth, getKpiPerformance } from '../../api/kpi'
import s from './rewardPenalty.module.css'

const now = new Date()
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN')
const fmtSigned = (n) => { const v = Number(n) || 0; return v > 0 ? `+${v}` : `${v}` }
const gradeCls = (sort) => (sort != null ? s[`gradeC${sort}`] : '')
// Màu đặc cho slice donut / cột theo hạng (sort 0=E … 5=S) — bám palette hệ thống.
const gradeColor = (sort) => ([
  'var(--color-danger-text)', 'var(--color-warning-text)', 'var(--color-muted)',
  'var(--color-primary-soft, #60a5fa)', 'var(--color-success-text)', 'var(--color-primary)',
][sort] ?? 'var(--color-muted)')
const pctColor = (p) => (p == null ? 'var(--color-muted)' : p >= 90 ? 'var(--color-success-text)' : p >= 80 ? 'var(--color-warning-text)' : 'var(--color-danger-text)')
const ON_TIME_TARGET = 90
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—')

export default function KpiPanel({ isAdmin, slot, years = [now.getFullYear()] }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmAction = useDeleteConfirm()
  const getLabel = useEnumsStore((st) => st.getLabel)

  const [sub, setSub]     = useState('overview')   // overview | progress | grade
  const [year, setYear]   = useState(years[0] ?? now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState({ closed: false, rows: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]   = useState(false)
  const [detail, setDetail] = useState(null)
  const [dTab, setDTab]   = useState('company')   // tab trong popup chi tiết NV

  // Tab Tổng quan & Xếp loại dùng chung getKpiPerformance (đủ mọi cột). Tiến độ dùng listKpi (nhẹ).
  const load = useCallback(() => {
    setLoading(true)
    const fetcher = sub === 'progress' ? listKpi(year, month) : getKpiPerformance(year, month)
    fetcher.then(setData)
      .catch(() => { setData({ closed: false, rows: [] }); addToast('Không tải được KPI', 'error') })
      .finally(() => setLoading(false))
  }, [year, month, sub]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  // ── Tổng hợp toàn NV cho thẻ tổng + biểu đồ ─────────────────────────────────
  const summary = useMemo(() => {
    const rows = data.rows || []
    const n = rows.length
    const sumVol = rows.reduce((a, r) => a + (Number(r.volumePoints) || 0), 0)
    const sumAssigned = rows.reduce((a, r) => a + (Number(r.assignedCount) || 0), 0)
    const sumOnTime = rows.reduce((a, r) => a + (Number(r.onTimeCount) || 0), 0)
    const avgPct = sumAssigned > 0 ? Math.round((sumOnTime * 100) / sumAssigned) : null
    const sumAmount = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)
    const rewardCnt = rows.filter((r) => (Number(r.amount) || 0) > 0).length
    const penaltyCnt = rows.filter((r) => (Number(r.amount) || 0) < 0).length
    // Phân bố xếp loại
    const gm = new Map()
    for (const r of rows) {
      if (!r.gradeCode) continue
      const g = gm.get(r.gradeCode) || { code: r.gradeCode, label: r.gradeLabel, sort: r.gradeSort ?? 0, count: 0 }
      g.count += 1; gm.set(r.gradeCode, g)
    }
    const gradeDist = [...gm.values()]
    const graded = gradeDist.reduce((a, g) => a + g.count, 0)
    const volTop = [...rows].sort((a, b) => (b.volumePoints || 0) - (a.volumePoints || 0)).slice(0, 10)
    const volMax = Math.max(1, ...volTop.map((r) => r.volumePoints || 0))
    const otRows = [...rows].sort((a, b) => (b.onTimePct ?? -1) - (a.onTimePct ?? -1)).slice(0, 12)
    return { n, sumVol, sumAssigned, sumOnTime, avgPct, sumAmount, rewardCnt, penaltyCnt, gradeDist, graded, volTop, volMax, otRows }
  }, [data])

  // conic-gradient cho donut (E→S để màu chạy đỏ→xanh)
  const donutBg = useMemo(() => {
    const asc = [...summary.gradeDist].sort((a, b) => a.sort - b.sort)
    const total = summary.graded || 1
    let acc = 0
    const stops = asc.map((g) => {
      const from = (acc / total) * 100; acc += g.count; const to = (acc / total) * 100
      return `${gradeColor(g.sort)} ${from}% ${to}%`
    })
    return stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--color-surface-muted)'
  }, [summary])

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
    setDTab('company')
    setDetail({ user: row, data: null, tasks: null })
    const [d, t] = await Promise.allSettled([
      getKpiDetail(row.userId, year, month),
      getKpiUserTasks(row.userId, year, month),
    ])
    setDetail({
      user: row,
      data: d.status === 'fulfilled' ? d.value : { byCompany: [], byType: [] },
      tasks: t.status === 'fulfilled' ? t.value : [],
    })
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
        <button className={`${s.tab} ${sub === 'overview' ? s.tabActive : ''}`} onClick={() => setSub('overview')}>Tổng quan</button>
        <button className={`${s.tab} ${sub === 'progress' ? s.tabActive : ''}`} onClick={() => setSub('progress')}>Tiến độ</button>
        <button className={`${s.tab} ${sub === 'grade' ? s.tabActive : ''}`} onClick={() => setSub('grade')}>Xếp loại &amp; thưởng</button>
      </div>

      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div>
      : data.rows.length === 0 ? <div className={s.empty}>Chưa có dữ liệu KPI cho tháng này.</div>
      : sub === 'overview' ? (
        <>
          {/* Thẻ tổng */}
          <div className={s.kpiCards}>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Nhân viên có KPI</div>
              <div className={s.kpiV}>{summary.n}</div>
              <div className={s.kpiSub}>Tháng {month}/{year}</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tổng điểm khối lượng</div>
              <div className={s.kpiV}>{fmtMoney(summary.sumVol)} <small>đ</small></div>
              <div className={s.kpiSub}>TB {summary.n ? Math.round(summary.sumVol / summary.n) : 0}đ / người</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tỉ lệ đúng hạn TB</div>
              <div className={s.kpiV}>{summary.avgPct == null ? '—' : summary.avgPct}<small>%</small></div>
              <div className={s.kpiSub}>{summary.sumOnTime}/{summary.sumAssigned} việc đúng hạn</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tổng thưởng/phạt</div>
              <div className={`${s.kpiV} ${summary.sumAmount >= 0 ? s.kpiPos : s.kpiNeg}`}>{summary.sumAmount > 0 ? '+' : ''}{fmtMoney(summary.sumAmount)}<small> đ</small></div>
              <div className={s.kpiSub}><span className={s.kpiPos}>{summary.rewardCnt} thưởng</span> · <span className={s.kpiNeg}>{summary.penaltyCnt} phạt</span></div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Đã xếp loại</div>
              <div className={s.kpiV}>{summary.graded}<small> / {summary.n}</small></div>
              <div className={s.kpiSub}>{summary.gradeDist.length} hạng xuất hiện</div>
            </div>
          </div>

          {/* Biểu đồ */}
          <div className={s.kpiCharts}>
            <div className={s.kpiPanel}>
              <h4>Điểm khối lượng theo nhân viên</h4>
              <div className={s.kpiHint}>Tổng điểm các bước checklist đã hoàn thành trong kỳ (top {summary.volTop.length}).</div>
              <div className={s.kpiBars}>
                {summary.volTop.map((r) => (
                  <div className={s.kpiBarRow} key={r.userId}>
                    <span className={s.kpiNm} title={r.userName}>{r.userName}</span>
                    <span className={s.kpiTrack}><span className={s.kpiFill} style={{ width: `${Math.round(((r.volumePoints || 0) / summary.volMax) * 100)}%` }} /></span>
                    <span className={s.kpiVal}>{r.volumePoints || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={s.kpiPanel}>
              <h4>Phân bố xếp loại</h4>
              <div className={s.kpiHint}>Số nhân viên theo hạng trong kỳ.</div>
              {summary.graded === 0 ? <div className={s.empty} style={{ padding: 12 }}>Chưa có xếp loại (cần cấu hình mốc &amp; xếp loại).</div> : (
                <div className={s.kpiDonutWrap}>
                  <div className={s.kpiDonut} style={{ background: donutBg }}>
                    <div className={s.kpiCenter}><b>{summary.graded}</b><span>nhân viên</span></div>
                  </div>
                  <div className={s.kpiLegend}>
                    {[...summary.gradeDist].sort((a, b) => b.sort - a.sort).map((g) => (
                      <div className={s.kpiLg} key={g.code}>
                        <span className={s.kpiSw} style={{ background: gradeColor(g.sort) }} />
                        <span className={s.kpiLbl}>{g.code}{g.label ? ` · ${g.label}` : ''}</span>
                        <span className={s.kpiCt}>{g.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className={s.kpiDsec} style={{ marginTop: 14 }}>% đúng hạn theo nhân viên</div>
              <div className={s.kpiOt}>
                <div className={s.kpiTarget} style={{ bottom: `${ON_TIME_TARGET}%` }}><span>Mục tiêu {ON_TIME_TARGET}%</span></div>
                {summary.otRows.map((r) => (
                  <div className={s.kpiOtBar} key={r.userId} title={`${r.userName}: ${r.onTimePct ?? '—'}%`}>
                    <span className={s.kpiPc}>{r.onTimePct ?? '—'}</span>
                    <span className={s.kpiCol} style={{ height: `${r.onTimePct ?? 0}%`, background: pctColor(r.onTimePct) }} />
                    <span className={s.kpiLb}>{(r.userName || '').split(' ').slice(-1)[0]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bảng gộp — bấm 1 dòng để mở chi tiết */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Điểm KL</th><th className={s.num}>Đúng hạn</th><th>% đúng hạn</th>
                <th className={s.num}>Điểm KPI</th><th className={s.num}>Thưởng/phạt</th><th className={s.num}>Tổng điểm</th>
                <th>Xếp loại</th><th className={s.num}>Tiền (đ)</th><th></th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td title={r.jobTitle || undefined}>{r.userName}</td>
                    <td className={s.num}><strong>{r.volumePoints}</strong></td>
                    <td className={s.num}>{r.onTimeCount}/{r.assignedCount}</td>
                    <td>{r.onTimePct == null ? <span className={s.zero}>—</span> : (
                      <span className={s.kpiMini}><span className={s.kpiMiniTrack}><span className={s.kpiMiniFill} style={{ width: `${r.onTimePct}%`, background: pctColor(r.onTimePct) }} /></span><span className={s.num}>{r.onTimePct}%</span></span>
                    )}</td>
                    <td className={s.num}>{fmtSigned(r.kpiPoints)}</td>
                    <td className={s.num}>{fmtSigned(r.rewardPenaltyNet)}</td>
                    <td className={s.num}><strong>{fmtSigned(r.totalPoints)}</strong></td>
                    <td>{r.gradeCode ? <span className={`${s.gradeBadge} ${gradeCls(r.gradeSort)}`} title={r.gradeLabel}>{r.gradeCode}</span> : <span className={s.zero}>—</span>}</td>
                    <td className={s.num}>{r.amount ? fmtMoney(r.amount) : <span className={s.zero}>—</span>}</td>
                    <td><ChevronRight size={15} style={{ color: 'var(--color-primary)' }} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>TỔNG · {summary.n} NV</td>
                  <td className={s.num}>{fmtMoney(summary.sumVol)}</td>
                  <td className={s.num}>{summary.sumOnTime}/{summary.sumAssigned}</td>
                  <td>{summary.avgPct == null ? '—' : `${summary.avgPct}%`}</td>
                  <td className={s.num}>—</td><td className={s.num}>—</td><td className={s.num}>—</td>
                  <td>—</td>
                  <td className={`${s.num} ${summary.sumAmount >= 0 ? s.kpiPos : s.kpiNeg}`}>{summary.sumAmount > 0 ? '+' : ''}{fmtMoney(summary.sumAmount)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={s.cardFoot}>ℹ️ Bấm 1 dòng để xem <strong>chi tiết từng công việc</strong> &amp; điểm theo công ty/loại. <strong>Điểm KPI</strong> quy từ % đúng hạn → <strong>Tổng điểm</strong> = Điểm KPI + Thưởng/phạt → xếp loại → tiền.</div>
        </>
      ) : (
        <div className={s.tableWrap}>
          {sub === 'progress' ? (
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Điểm khối lượng</th><th className={s.num}>Đúng hạn</th><th className={s.num}>Tỉ lệ đúng hạn</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
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
                  <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
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
      {sub === 'grade' && !loading && data.rows.length > 0 && (
        <div className={s.cardFoot}>ℹ️ <strong>Điểm KPI</strong> quy từ <strong>% đúng hạn</strong> theo mốc (tab <strong>Quy đổi xếp loại</strong>). <strong>Tổng điểm</strong> = Điểm KPI + Thưởng/phạt → dò xếp loại → ra tiền.</div>
      )}

      {detail && (
        <Modal title={`KPI — ${detail.user.userName} · Tháng ${month}/${year}`} onClose={() => setDetail(null)} wide>
          {/* Header màu */}
          <div className={s.kpiDrawerHead}>
            <div className={s.kpiDnm}>{detail.user.userName}</div>
            <div className={s.kpiDjt}>{detail.user.jobTitle || 'Nhân viên'} · Tháng {month}/{year}</div>
            <div className={s.kpiDrow}>
              {detail.user.gradeCode
                ? <span className={`${s.gradeBadge} ${gradeCls(detail.user.gradeSort)}`} style={{ background: '#fff', color: 'var(--color-primary)' }}>{detail.user.gradeCode}{detail.user.gradeLabel ? ` · ${detail.user.gradeLabel}` : ''}</span>
                : <span />}
              {detail.user.amount != null && <span className={s.kpiDamt}>{detail.user.amount > 0 ? '+' : ''}{fmtMoney(detail.user.amount)} đ</span>}
            </div>
          </div>

          {/* 4 chỉ số */}
          <div className={s.kpiStat4}>
            <div className={s.kpiStat}><div className={s.kpiK}>Điểm khối lượng</div><div className={s.kpiV}>{detail.user.volumePoints ?? 0} đ</div></div>
            <div className={s.kpiStat}><div className={s.kpiK}>% đúng hạn</div><div className={s.kpiV}>{detail.user.onTimePct == null ? '—' : `${detail.user.onTimePct}%`}</div></div>
            <div className={s.kpiStat}><div className={s.kpiK}>Đã đến hạn / đúng hạn</div><div className={s.kpiV}>{detail.user.assignedCount ?? 0} / {detail.user.onTimeCount ?? 0}</div></div>
            <div className={s.kpiStat}><div className={s.kpiK}>Thưởng/phạt (net)</div><div className={s.kpiV}>{detail.user.rewardPenaltyNet != null ? fmtSigned(detail.user.rewardPenaltyNet) : '—'}</div></div>
          </div>

          {!detail.data ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (() => {
            const TABS = [
              ['company', `Theo công ty (${detail.data.byCompany?.length || 0})`],
              ['type',    `Theo loại CV (${detail.data.byType?.length || 0})`],
              ['source',  `Theo nguồn (${detail.data.bySource?.length || 0})`],
              ['tasks',   `Từng công việc${detail.tasks ? ` (${detail.tasks.length})` : ''}`],
            ]
            const brk = (rows) => {
              if (!rows || rows.length === 0) return <div className={s.empty} style={{ padding: 10 }}>Chưa có dữ liệu.</div>
              const mx = Math.max(1, ...rows.map((x) => x.volumePoints || 0))
              return <div className={s.kpiBrk}>{rows.map((x, i) => (
                <div key={x.key ?? i}>
                  <div className={s.kpiBrkR}><span>{x.label}</span><b>{x.volumePoints}đ</b></div>
                  <div className={s.kpiBrkBar}><i style={{ width: `${Math.round(((x.volumePoints || 0) / mx) * 100)}%` }} /></div>
                </div>
              ))}</div>
            }
            return (
              <>
                <div className={s.tabLinks} role="tablist" style={{ margin: '4px 0 12px', alignSelf: 'flex-start' }}>
                  {TABS.map(([k, lbl]) => (
                    <button key={k} className={`${s.tab} ${dTab === k ? s.tabActive : ''}`} onClick={() => setDTab(k)}>{lbl}</button>
                  ))}
                </div>

                {dTab === 'company' && brk(detail.data.byCompany)}
                {dTab === 'type' && brk(detail.data.byType)}

                {dTab === 'source' && (
                  !detail.data.bySource || detail.data.bySource.length === 0
                    ? <div className={s.empty} style={{ padding: 10 }}>Không có công việc trong kỳ.</div>
                    : <div className={s.tableWrap}><table className={s.table}>
                        <thead><tr><th>Nguồn</th><th className={s.num}>Số việc</th><th className={s.num}>Đã đến hạn</th><th className={s.num}>Đúng hạn</th><th className={s.num}>% đúng hạn</th><th className={s.num}>Điểm KL</th></tr></thead>
                        <tbody>
                          {detail.data.bySource.map((x) => {
                            const lbl = x.source === 'auto' ? 'Định kỳ (tự sinh)' : getLabel('task_source', x.source, x.label)
                            const pct = x.dueCount > 0 ? Math.round((x.onTimeCount * 100) / x.dueCount) : null
                            return <tr key={x.key}>
                              <td>{lbl}</td>
                              <td className={s.num}>{x.taskCount}</td>
                              <td className={s.num}>{x.dueCount}</td>
                              <td className={s.num}>{x.onTimeCount}</td>
                              <td className={s.num}>{pct == null ? <span className={s.zero}>—</span> : `${pct}%`}</td>
                              <td className={s.num}>{x.volumePoints}đ</td>
                            </tr>
                          })}
                        </tbody>
                      </table></div>
                )}

                {dTab === 'tasks' && (
                  !detail.tasks ? <div className={s.loading}><Loader2 size={13} className={s.spin} /> Đang tải…</div>
                    : detail.tasks.length === 0 ? <div className={s.empty} style={{ padding: 10 }}>Không có công việc nào trong kỳ.</div> : (
                    <div className={s.kpiTasks}>
                      {detail.tasks.map((t) => (
                        <div className={s.kpiTask} key={t.taskId}>
                          <div className={s.kpiT1}>
                            <b title={t.title}>{t.title}</b>
                            <span className={`${s.kpiPt} ${t.points > 0 ? s.kpiPos : ''}`}>{t.points > 0 ? `+${t.points}` : t.points}đ</span>
                          </div>
                          <div className={s.kpiT2}>
                            <span className={s.kpiSt} style={{ background: 'var(--color-surface-muted)', color: 'var(--color-muted)' }}>
                              {t.source === 'auto' ? 'Định kỳ' : getLabel('task_source', t.source, t.source === 'manual' ? 'Tự tạo' : (t.source || 'Khác'))}
                            </span>
                            {t.companyName && <span>{t.companyName}</span>}
                            {t.typeName && <span>· {t.typeName}</span>}
                            {t.dueInPeriod && <>
                              <span>· Hạn {fmtDate(t.dueDate)}{t.completedAt ? ` · Xong ${fmtDate(t.completedAt)}` : ''}</span>
                              {t.status === 'completed'
                                ? <span className={`${s.kpiSt} ${t.onTime ? s.kpiStOk : s.kpiStLate}`}>{t.onTime ? 'Đúng hạn' : 'Trễ'}</span>
                                : t.notDueYet
                                  ? <span className={s.kpiSt} style={{ background: 'var(--color-surface-muted)', color: 'var(--color-muted)' }}>Chưa tới hạn</span>
                                  : <span className={`${s.kpiSt} ${s.kpiStLate}`}>Quá hạn chưa xong</span>}
                            </>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
