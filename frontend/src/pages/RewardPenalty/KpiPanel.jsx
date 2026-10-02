import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Lock, LockOpen, ChevronRight, Users, ChevronDown, Check } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { getKpiDetail, getKpiUserTasks, closeKpiMonth, reopenKpiMonth, getKpiPerformance } from '../../api/kpi'
import { listUserOptions } from '../../api/users'
import s from './rewardPenalty.module.css'

const ROLE_FILTERS = [['staff', 'Chỉ nhân viên'], ['all', 'Tất cả'], ['admin', 'Chỉ quản trị']]
const FILTER_LS_KEY = 'kpi_overview_filter_v1'
function loadFilter() {
  try {
    const o = JSON.parse(localStorage.getItem(FILTER_LS_KEY) || '{}')
    return { role: o.role ?? 'staff', userIds: Array.isArray(o.userIds) ? o.userIds : [], sources: Array.isArray(o.sources) ? o.sources : [] }
  } catch { return { role: 'staff', userIds: [], sources: [] } }
}

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
// Màu cho từng NGUỒN task (stacked bar đa nguồn). Nguồn lạ → màu dự phòng xoay vòng.
const SOURCE_COLOR = {
  auto:     'var(--color-primary)',
  manual:   'var(--color-success-text)',
  customer: 'var(--color-warning-text)',
  reques:   '#8b5cf6',
  out:      'var(--color-muted)',
}
const FALLBACK_COLORS = ['#0ea5e9', '#f97316', '#14b8a6', '#ec4899', '#a3a3a3']
const srcColor = (key, i) => SOURCE_COLOR[key] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
const ON_TIME_TARGET = 90
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—')
// Tên ngắn cho nhãn biểu đồ: lấy 2 từ CUỐI = phần tên gọi (vd "Bùi Thị Thanh Thảo" → "Thanh Thảo").
const shortName = (nm) => (nm || '').trim().split(/\s+/).slice(-2).join(' ')

export default function KpiPanel({ isAdmin, slot, years = [now.getFullYear()] }) {
  const addToast = useToastStore((st) => st.toast)
  const confirmAction = useDeleteConfirm()
  const getLabel = useEnumsStore((st) => st.getLabel)
  const getOptions = useEnumsStore((st) => st.getOptions)

  const [year, setYear]   = useState(years[0] ?? now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [data, setData]   = useState({ closed: false, rows: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]   = useState(false)
  const [detail, setDetail] = useState(null)
  const [dTab, setDTab]   = useState('company')   // tab trong popup chi tiết NV
  const [srcOpen, setSrcOpen] = useState(null)    // nguồn đang bung xem công việc (tab Theo nguồn)
  const [tableMode, setTableMode] = useState('merged')   // merged | bySource

  // Bộ lọc Tổng quan (chỉ admin) — vai trò + nhân viên cụ thể. Nhớ qua localStorage.
  const initF = loadFilter()
  const [roleF, setRoleF]   = useState(isAdmin ? initF.role : 'all')
  const [userIdsF, setUserIdsF] = useState(isAdmin ? initF.userIds : [])
  const [sourcesF, setSourcesF] = useState(initF.sources)
  const [userOpts, setUserOpts] = useState([])   // [{id,name,role}]
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSrcMenu, setShowSrcMenu] = useState(false)
  const sourceOpts = getOptions('task_source') || []

  useEffect(() => {
    if (!isAdmin) return
    listUserOptions({ status: 'active' }).then((r) => setUserOpts(r.users || [])).catch(() => setUserOpts([]))
  }, [isAdmin])
  useEffect(() => {
    try { localStorage.setItem(FILTER_LS_KEY, JSON.stringify({ role: roleF, userIds: userIdsF, sources: sourcesF })) } catch { /* ignore */ }
  }, [roleF, userIdsF, sourcesF])

  const load = useCallback(() => {
    setLoading(true)
    const filters = { sources: sourcesF, ...(isAdmin ? { role: roleF === 'all' ? null : roleF, userIds: userIdsF } : {}) }
    getKpiPerformance(year, month, filters)
      .then(setData)
      .catch(() => { setData({ closed: false, rows: [] }); addToast('Không tải được KPI', 'error') })
      .finally(() => setLoading(false))
  }, [year, month, roleF, userIdsF, sourcesF, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  const toggleSource = (k) => setSourcesF((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])

  // Options NV cho dropdown (lọc theo vai trò đang chọn)
  const userMenuOpts = useMemo(() => {
    if (roleF === 'staff') return userOpts.filter((u) => u.role === 'staff')
    if (roleF === 'admin') return userOpts.filter((u) => u.role === 'admin')
    return userOpts
  }, [userOpts, roleF])
  const toggleUser = (id) => setUserIdsF((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

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

  // Báo cáo ĐA NGUỒN: mỗi NV tách số việc theo nguồn (stacked bar).
  const sourceReport = useMemo(() => {
    const rows = data.rows || []
    // Tập nguồn = theo ENUM task_source (đủ & đúng thứ tự). Enum chưa tải → lấy nguồn có trong data.
    const enumKeys = (sourceOpts || []).map((o) => o.key)
    const srcSet = enumKeys.length ? enumKeys : (() => {
      const s = []; for (const r of rows) for (const b of (r.bySource || [])) if (b.taskCount > 0 && !s.includes(b.source)) s.push(b.source); return s
    })()
    const colors = {}; srcSet.forEach((k, i) => { colors[k] = srcColor(k, i) })
    const perUser = rows.map((r) => {
      const map = new Map((r.bySource || []).map((b) => [b.source, b]))
      const total = (r.bySource || []).reduce((a, b) => a + (b.taskCount || 0), 0)
      return {
        userId: r.userId, name: r.userName, total,
        segs: srcSet.map((k) => ({ source: k, count: map.get(k)?.taskCount || 0, onTime: map.get(k)?.onTimeCount || 0 })),
      }
    }).filter((u) => u.total > 0).sort((a, b) => b.total - a.total).slice(0, 12)
    const maxTotal = Math.max(1, ...perUser.map((u) => u.total))
    return { srcSet, colors, perUser, maxTotal, hasData: perUser.length > 0 }
  }, [data])

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
    setSrcOpen(null)
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
    <div className={s.card} style={{ padding: '14px 16px' }}>
      {slot && createPortal(toolbar, slot)}

      {/* Bộ lọc (admin): vai trò + nhân viên cụ thể */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <Users size={15} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
          <div className={s.tabLinks} role="tablist">
            {ROLE_FILTERS.map(([k, lbl]) => (
              <button key={k} className={`${s.tab} ${roleF === k ? s.tabActive : ''}`} onClick={() => { setRoleF(k); setUserIdsF([]) }}>{lbl}</button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowUserMenu((v) => !v)}
              style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-primary-bg-strong)', background: 'var(--color-white)', color: userIdsF.length ? 'var(--color-primary)' : 'var(--color-text-soft)', fontSize: 'var(--fs-2xs)', fontWeight: 600, cursor: 'pointer' }}>
              {userIdsF.length ? `${userIdsF.length} nhân viên đã chọn` : 'Tất cả nhân viên'} <ChevronDown size={13} />
            </button>
            {showUserMenu && (
              <>
                <div onClick={() => setShowUserMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 21, minWidth: 220, maxHeight: 280, overflowY: 'auto', background: 'var(--color-white)', border: '1px solid var(--color-border-muted)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-floating, 0 8px 24px rgba(0,0,0,.12))', padding: 6 }}>
                  {userMenuOpts.length === 0 ? <div style={{ padding: 8, fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>Không có nhân viên</div>
                    : userMenuOpts.map((u) => (
                    <div key={u.id} role="button" tabIndex={0} onClick={() => toggleUser(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-2xs)', userSelect: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid var(--color-primary-bg-strong)', background: userIdsF.includes(u.id) ? 'var(--color-primary)' : 'var(--color-white)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {userIdsF.includes(u.id) && <Check size={11} color="#fff" />}
                      </span>
                      <span>{u.name}{u.role === 'admin' ? ' · QTV' : ''}</span>
                    </div>
                  ))}
                  {userIdsF.length > 0 && <button type="button" onClick={() => setUserIdsF([])} style={{ width: '100%', marginTop: 4, padding: '6px', border: 'none', background: 'var(--color-surface-muted)', borderRadius: 6, fontSize: 'var(--fs-2xs)', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>Bỏ chọn tất cả</button>}
                </div>
              </>
            )}
          </div>

          {/* Lọc theo NGUỒN task */}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setShowSrcMenu((v) => !v)}
              style={{ height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-primary-bg-strong)', background: 'var(--color-white)', color: sourcesF.length ? 'var(--color-primary)' : 'var(--color-text-soft)', fontSize: 'var(--fs-2xs)', fontWeight: 600, cursor: 'pointer' }}>
              {sourcesF.length ? `${sourcesF.length} nguồn` : 'Mọi nguồn CV'} <ChevronDown size={13} />
            </button>
            {showSrcMenu && (
              <>
                <div onClick={() => setShowSrcMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 21, minWidth: 200, background: 'var(--color-white)', border: '1px solid var(--color-border-muted)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-floating, 0 8px 24px rgba(0,0,0,.12))', padding: 6 }}>
                  {sourceOpts.length === 0 ? <div style={{ padding: 8, fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>Chưa tải nguồn</div>
                    : sourceOpts.map((o) => (
                    <div key={o.key} role="button" tabIndex={0} onClick={() => toggleSource(o.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-2xs)', userSelect: 'none' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-bg)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ width: 15, height: 15, borderRadius: 4, border: '1.5px solid var(--color-primary-bg-strong)', background: sourcesF.includes(o.key) ? 'var(--color-primary)' : 'var(--color-white)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {sourcesF.includes(o.key) && <Check size={11} color="#fff" />}
                      </span>
                      <span>{o.label}</span>
                    </div>
                  ))}
                  {sourcesF.length > 0 && <button type="button" onClick={() => setSourcesF([])} style={{ width: '100%', marginTop: 4, padding: '6px', border: 'none', background: 'var(--color-surface-muted)', borderRadius: 6, fontSize: 'var(--fs-2xs)', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>Bỏ lọc nguồn</button>}
                </div>
              </>
            )}
          </div>

          <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>· {summary.n} NV</span>
          {sourcesF.length > 0 && (
            <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 600, color: 'var(--color-warning-text)', background: 'var(--color-warning-bg)', padding: '2px 8px', borderRadius: 999 }}>
              Đang xem nguồn: {sourcesF.map((k) => getLabel('task_source', k, k)).join(', ')} (điểm/đúng hạn chỉ tính các nguồn này)
            </span>
          )}
        </div>
      )}

      {loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div>
      : data.rows.length === 0 ? <div className={s.empty}>Chưa có dữ liệu KPI cho tháng này.</div>
      : (
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
              <div className={s.kpiHint}>Điểm đã đạt / tổng điểm có thể đạt của công việc trong kỳ (phần xám = bước chưa hoàn thành).</div>
              {summary.sumVol === 0 ? (
                <div className={s.empty} style={{ padding: 12 }}>Chưa có điểm khối lượng trong kỳ — công việc chưa chấm điểm checklist (hoặc đang lọc nguồn không có điểm).</div>
              ) : (
                <div className={s.kpiBars}>
                  {summary.volTop.map((r) => {
                    const got = r.volumePoints || 0
                    const poss = r.volumePossible || 0
                    const pct = poss > 0 ? Math.round((got / poss) * 100) : 0
                    return (
                    <div className={s.kpiBarRow} key={r.userId}>
                      <span className={s.kpiNm} title={r.userName}>{shortName(r.userName)}</span>
                      <span className={s.kpiTrack} title={`Đạt ${got} / ${poss} điểm (${pct}%)`}><span className={s.kpiFill} style={{ width: `${pct}%` }} /></span>
                      <span className={s.kpiVal}>{got} <small style={{ color: 'var(--color-muted)', fontWeight: 'var(--fw-regular, 400)' }}>/ {poss}</small></span>
                    </div>
                    )
                  })}
                </div>
              )}
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

          {/* Đa nguồn: số việc theo nguồn mỗi NV (stacked bar) */}
          {sourceReport.hasData && (
            <div className={s.kpiPanel} style={{ marginBottom: 14 }}>
              <h4>Số việc theo nguồn · mỗi nhân viên</h4>
              <div className={s.kpiHint}>Mỗi thanh = tổng việc đến hạn trong kỳ, tách màu theo nguồn.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', margin: '8px 0 10px' }}>
                {sourceReport.srcSet.map((k) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-2xs)', color: 'var(--color-text-soft)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: sourceReport.colors[k] }} />
                    {getLabel('task_source', k, k)}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sourceReport.perUser.map((u) => (
                  <div key={u.userId} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 40px', alignItems: 'center', gap: 9 }}>
                    <span title={u.name} style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-text-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName(u.name)}</span>
                    <span style={{ display: 'flex', height: 11, borderRadius: 6, overflow: 'hidden', background: 'var(--color-surface-muted)', width: `${Math.round((u.total / sourceReport.maxTotal) * 100)}%`, minWidth: 2 }}>
                      {u.segs.filter((sg) => sg.count > 0).map((sg) => (
                        <span key={sg.source} title={`${getLabel('task_source', sg.source, sg.source)}: ${sg.count} việc · đúng hạn ${sg.onTime}`}
                          style={{ width: `${Math.round((sg.count / u.total) * 100)}%`, background: sourceReport.colors[sg.source] }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 'var(--fw-bold)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggle kiểu bảng: Gộp ↔ Tách nguồn */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '4px 2px 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--color-muted)' }}>Bảng chi tiết nhân viên</span>
            {sourceReport.srcSet.length > 0 && (
              <div className={s.tabLinks} role="tablist">
                <button className={`${s.tab} ${tableMode === 'merged' ? s.tabActive : ''}`} onClick={() => setTableMode('merged')}>Gộp</button>
                <button className={`${s.tab} ${tableMode === 'bySource' ? s.tabActive : ''}`} onClick={() => setTableMode('bySource')}>Tách theo nguồn</button>
              </div>
            )}
          </div>

          {tableMode === 'bySource' && sourceReport.srcSet.length > 0 ? (
            <>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th className={s.colStt}>STT</th><th>Nhân viên</th>
                      {sourceReport.srcSet.map((k) => (
                        <th key={k} className={s.num} title={getLabel('task_source', k, k)}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: sourceReport.colors[k] }} />
                            {getLabel('task_source', k, k)}
                          </span>
                        </th>
                      ))}
                      <th className={s.num}>Tổng đúng hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => {
                      const map = new Map((r.bySource || []).map((b) => [b.source, b]))
                      return (
                        <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
                          <td className={s.colStt}>{i + 1}</td>
                          <td title={r.jobTitle || undefined}>{r.userName}</td>
                          {sourceReport.srcSet.map((k) => {
                            const b = map.get(k)
                            if (!b || b.dueCount === 0) return <td key={k} className={s.num}><span className={s.zero}>—</span></td>
                            const pct = Math.round((b.onTimeCount * 100) / b.dueCount)
                            return <td key={k} className={s.num} title={`${b.taskCount} việc (đến hạn ${b.dueCount})`}>
                              <div>{b.onTimeCount}/{b.dueCount}</div>
                              <div style={{ fontSize: 'var(--fs-3xs)', fontWeight: 700, color: pctColor(pct) }}>{pct}%</div>
                            </td>
                          })}
                          <td className={s.num}><strong>{r.onTimeCount}/{r.assignedCount}</strong>{r.onTimePct != null ? <div style={{ fontSize: 'var(--fs-3xs)', fontWeight: 700, color: pctColor(r.onTimePct) }}>{r.onTimePct}%</div> : null}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className={s.cardFoot}>ℹ️ Mỗi ô: <strong>đúng hạn / đã đến hạn</strong> + % theo nguồn. Bấm 1 dòng để xem chi tiết. Điểm KPI/xếp loại tính trên <strong>tổng</strong> (tất cả nguồn, hoặc các nguồn đang lọc).</div>
            </>
          ) : (
          <>
          {/* Bảng gộp — bấm 1 dòng để mở chi tiết */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Điểm khối lượng</th><th className={s.num}>Đúng hạn</th><th>% đúng hạn</th>
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
          <div className={s.cardFoot}>ℹ️ Bấm 1 dòng để xem <strong>chi tiết từng công việc</strong> &amp; điểm theo công ty/loại/nguồn. <strong>Điểm KPI</strong> quy từ % đúng hạn → <strong>Tổng điểm</strong> = Điểm KPI + Thưởng/phạt → xếp loại → tiền.</div>
          </>
          )}
        </>
      )}

      {detail && (
        <Modal title={`KPI — ${detail.user.userName} · Tháng ${month}/${year}`} onClose={() => setDetail(null)} wide>
          {/* Header 1 hàng: tên + các chỉ số gộp chung */}
          <div className={s.kpiDHead}>
            <div className={s.kpiDHid}>
              <div className={s.kpiDnm}>{detail.user.userName}</div>
              <div className={s.kpiDjt}>{detail.user.jobTitle || 'Nhân viên'} · Tháng {month}/{year}</div>
              <div className={s.kpiDbadges}>
                {detail.user.gradeCode && <span className={`${s.gradeBadge} ${gradeCls(detail.user.gradeSort)}`} style={{ background: 'var(--color-white)', color: 'var(--color-primary)' }}>{detail.user.gradeCode}{detail.user.gradeLabel ? ` · ${detail.user.gradeLabel}` : ''}</span>}
                {detail.user.amount != null && <span className={s.kpiDamt}>{detail.user.amount > 0 ? '+' : ''}{fmtMoney(detail.user.amount)} đ</span>}
              </div>
            </div>
            <div className={s.kpiDmetrics}>
              <div className={s.kpiDm}><span>Điểm khối lượng</span><b>{detail.user.volumePoints ?? 0} / {detail.user.volumePossible ?? (detail.user.volumePoints ?? 0)}</b></div>
              <div className={s.kpiDm}><span>% đúng hạn</span><b>{detail.user.onTimePct == null ? '—' : `${detail.user.onTimePct}%`}</b></div>
              <div className={s.kpiDm}><span>Đến hạn / đúng hạn</span><b>{detail.user.assignedCount ?? 0} / {detail.user.onTimeCount ?? 0}</b></div>
              <div className={s.kpiDm}><span>Thưởng/phạt (net)</span><b>{detail.user.rewardPenaltyNet != null ? fmtSigned(detail.user.rewardPenaltyNet) : '—'}</b></div>
            </div>
          </div>

          {!detail.data ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (() => {
            const TABS = [
              ['company', `Theo công ty (${detail.data.byCompany?.length || 0})`],
              ['type',    `Theo loại CV (${detail.data.byType?.length || 0})`],
              ['source',  `Theo nguồn${detail.tasks ? ` · ${detail.tasks.length} việc` : ''}`],
            ]
            // Thẻ 1 công việc (dùng trong nhóm nguồn khi bung).
            const renderTask = (t) => (
              <div className={s.kpiTask} key={t.taskId}>
                <div className={s.kpiT1}>
                  <b title={t.title}>{t.title}</b>
                  <span className={`${s.kpiPt} ${t.points > 0 ? s.kpiPos : ''}`}>{t.points > 0 ? `+${t.points}` : t.points}đ</span>
                </div>
                <div className={s.kpiT2}>
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
            )
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

                {dTab === 'source' && (() => {
                  const bySrc = new Map((detail.data.bySource || []).map((x) => [x.source, x]))
                  const opts = getOptions('task_source') || []
                  const keys = opts.length ? opts.map((o) => o.key) : [...bySrc.keys()]
                  if (keys.length === 0) return <div className={s.empty} style={{ padding: 10 }}>Không có công việc trong kỳ.</div>
                  return (
                    <div className={s.kpiSrcList}>
                      <div className={`${s.kpiSrcRow} ${s.kpiSrcHd}`}>
                        <span>Nguồn</span><span className={s.num}>Số việc</span><span className={s.num}>Đến hạn</span><span className={s.num}>Đúng hạn</span><span className={s.num}>% ĐH</span><span className={s.num}>Điểm KL</span>
                      </div>
                      {keys.map((key, i) => {
                        const x = bySrc.get(key)
                        const taskCount = x?.taskCount || 0, dueCount = x?.dueCount || 0, onTimeCount = x?.onTimeCount || 0, vol = x?.volumePoints || 0
                        const pct = dueCount > 0 ? Math.round((onTimeCount * 100) / dueCount) : null
                        const open = srcOpen === key
                        const tasksOfSrc = (detail.tasks || []).filter((t) => t.source === key)
                        const lbl = key === 'auto' ? 'Định kỳ (tự sinh)' : getLabel('task_source', key, key)
                        return (
                          <div key={key}>
                            <div className={`${s.kpiSrcRow} ${s.kpiSrcClick} ${open ? s.kpiSrcOpen : ''}`} role="button" onClick={() => setSrcOpen(open ? null : key)}>
                              <span className={s.kpiSrcNm}>
                                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span style={{ width: 9, height: 9, borderRadius: 2, background: srcColor(key, i), flexShrink: 0 }} />
                                {lbl}
                              </span>
                              <span className={s.num}>{taskCount}</span>
                              <span className={s.num}>{dueCount}</span>
                              <span className={s.num}>{onTimeCount}</span>
                              <span className={s.num}>{pct == null ? <span className={s.zero}>—</span> : `${pct}%`}</span>
                              <span className={s.num}>{vol}đ</span>
                            </div>
                            {open && (
                              <div className={s.kpiSrcTasks}>
                                {tasksOfSrc.length === 0
                                  ? <div className={s.empty} style={{ padding: 8 }}>Không có công việc nguồn này trong kỳ.</div>
                                  : <div className={s.kpiTasks}>{tasksOfSrc.map(renderTask)}</div>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
