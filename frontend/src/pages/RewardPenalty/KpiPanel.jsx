import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Lock, LockOpen, ChevronRight, Users, ChevronDown, Check } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { getKpiDetail, getKpiUserTasks, closeKpiMonth, reopenKpiMonth, getKpiPerformance } from '../../api/kpi'
import { listUserOptions } from '../../api/users'
import PeriodPicker from '../Tasks/PeriodPicker'
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
const CUR_YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1
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
// Màu theo ĐỘ KHÓ — theo THỨ TỰ enum (dễ→khó = xanh→đỏ), KHÔNG neo theo key cứng.
const DIFF_COLORS = ['var(--color-success-text)', 'var(--color-warning-text)', 'var(--color-danger-text)', '#8b5cf6', '#be123c']
const diffColor = (i) => DIFF_COLORS[i % DIFF_COLORS.length]
// Màu theo TRẠNG THÁI task — theo THỨ TỰ enum (index), KHÔNG neo key cứng.
const STATUS_COLORS = ['var(--color-muted)', 'var(--color-primary)', 'var(--color-danger-text)', 'var(--color-success-text)', 'var(--color-warning-text)', '#8b5cf6']
const statusColor = (i) => STATUS_COLORS[i % STATUS_COLORS.length]
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
  const [from, setFrom]   = useState('')   // khoảng ngày tùy chọn (YYYY-MM-DD) — ưu tiên hơn năm/tháng
  const [to, setTo]       = useState('')
  const hasRange = !!(from || to)
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
    if (!hasRange && (!year || !month)) { setData({ closed: false, rows: [] }); setLoading(false); return }   // cần năm+tháng HOẶC khoảng ngày
    setLoading(true)
    const filters = { sources: sourcesF, from, to, ...(isAdmin ? { role: roleF === 'all' ? null : roleF, userIds: userIdsF } : {}) }
    getKpiPerformance(year, month, filters)
      .then(setData)
      .catch(() => { setData({ closed: false, rows: [] }); addToast('Không tải được KPI', 'error') })
      .finally(() => setLoading(false))
  }, [year, month, from, to, roleF, userIdsF, sourcesF, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const sumVolRec = rows.reduce((a, r) => a + (Number(r.volumeRecurring) || 0), 0)
    const sumVolOther = rows.reduce((a, r) => a + (Number(r.volumeOther) || 0), 0)
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
    return { n, sumVol, sumVolRec, sumVolOther, sumAssigned, sumOnTime, avgPct, sumAmount, rewardCnt, penaltyCnt, gradeDist, graded, volTop, volMax, otRows }
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
        segs: srcSet.map((k) => ({ source: k, count: map.get(k)?.taskCount || 0, onTime: map.get(k)?.onTimeCount || 0, vol: map.get(k)?.volumePoints || 0 })),
      }
    }).filter((u) => u.total > 0).sort((a, b) => b.total - a.total).slice(0, 12)
    const maxTotal = Math.max(1, ...perUser.map((u) => u.total))
    return { srcSet, colors, perUser, maxTotal, hasData: perUser.length > 0 }
  }, [data])

  async function handleClose() {
    if (!(await confirmAction({
      title: 'Chốt sổ KPI tháng', confirmLabel: 'Chốt sổ', tone: 'primary',
      confirmIcon: <Lock size={13} />, loadingLabel: 'Đang chốt…',
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
      title: 'Mở lại sổ KPI', confirmLabel: 'Mở lại', tone: 'primary',
      confirmIcon: <LockOpen size={13} />, loadingLabel: 'Đang mở…',
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
      getKpiDetail(row.userId, year, month, { from, to }),
      getKpiUserTasks(row.userId, year, month, { from, to }),
    ])
    setDetail({
      user: row,
      data: d.status === 'fulfilled' ? d.value : { byCompany: [], byType: [] },
      tasks: t.status === 'fulfilled' ? t.value : [],
    })
  }

  // Phân bố theo ĐỘ KHÓ checklist (việc định kỳ) — dùng chung cho Tổng quan & popup. Nhãn/thứ tự theo ENUM.
  const renderDifficulty = (report) => {
    const diffOpts = getOptions('checklist_difficulty') || []
    const map = new Map((report || []).map((d) => [d.difficulty, d]))
    const keys = diffOpts.length ? diffOpts.map((o) => o.key) : [...map.keys()]
    const rowsD = keys.map((k, i) => {
      const d = map.get(k) || {}
      return {
        key: k, label: getLabel('checklist_difficulty', k, k), color: diffColor(i),
        stepCount: d.stepCount || 0, totalPoints: d.totalPoints || 0,
        doneCount: d.doneCount || 0, donePoints: d.donePoints || 0,
      }
    }).filter((r) => r.stepCount > 0 || r.totalPoints > 0)
    if (rowsD.length === 0) return <div className={s.empty} style={{ padding: 12 }}>Chưa có việc định kỳ chấm điểm checklist trong kỳ.</div>
    const sumTotal = rowsD.reduce((a, r) => a + r.totalPoints, 0)
    const sumDone = rowsD.reduce((a, r) => a + r.donePoints, 0)
    const sumSteps = rowsD.reduce((a, r) => a + r.stepCount, 0)
    return (
      <div className={s.kpiDiff}>
        <div className={`${s.kpiDiffRow} ${s.kpiDiffHd}`}>
          <span>Mức độ</span><span /><span className={s.num}>Số checklist</span><span className={s.num}>Điểm (đạt/tổng)</span>
        </div>
        {rowsD.map((r) => {
          const pct = r.totalPoints > 0 ? Math.round((r.donePoints / r.totalPoints) * 100) : 0
          const sharePct = sumSteps > 0 ? Math.round((r.stepCount / sumSteps) * 100) : 0
          return (
            <div className={s.kpiDiffRow} key={r.key}>
              <span className={s.kpiDiffNm}><span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, flexShrink: 0 }} />{r.label}</span>
              <span className={s.kpiDiffTrk} title={`${r.donePoints}/${r.totalPoints}đ · ${pct}% điểm`}><span className={s.kpiDiffFill} style={{ width: `${pct}%`, background: r.color }} /></span>
              <span className={s.kpiDiffCnt}>{r.stepCount} <small>checklist · {sharePct}%</small></span>
              <span className={s.kpiDiffVal}>{r.donePoints} / {r.totalPoints} <small>đ</small></span>
            </div>
          )
        })}
        <div className={s.kpiDiffFoot}>Tổng: <b>{sumSteps} checklist</b> · <b>{sumDone} / {sumTotal}đ</b> ({sumTotal > 0 ? Math.round((sumDone / sumTotal) * 100) : 0}% điểm hoàn thành)</div>
      </div>
    )
  }

  // Thống kê theo TRẠNG THÁI task — dùng chung Tổng quan & popup. Thứ tự/nhãn theo ENUM (không hardcode).
  const renderStatus = (report, overdue) => {
    const opts = getOptions('task_status') || []
    const map = new Map((report || []).map((x) => [x.status, x]))
    const keys = opts.length ? opts.map((o) => o.key) : [...map.keys()]
    for (const x of (report || [])) if (!keys.includes(x.status)) keys.push(x.status)   // trạng thái lạ (nếu có) xếp cuối
    const rowsS = keys.map((k, i) => ({ key: k, label: getLabel('task_status', k, k), color: statusColor(i), count: map.get(k)?.count || 0 }))
      .filter((r) => r.count > 0)
    const total = rowsS.reduce((a, r) => a + r.count, 0)
    if (total === 0) return <div className={s.empty} style={{ padding: 12 }}>Không có công việc đến hạn trong kỳ.</div>
    return (
      <div>
        <div className={s.kpiStatBar}>
          {rowsS.map((r) => (
            <span key={r.key} title={`${r.label}: ${r.count} (${Math.round((r.count / total) * 100)}%)`} style={{ width: `${(r.count / total) * 100}%`, background: r.color }} />
          ))}
        </div>
        <div className={s.kpiStatLegend}>
          {rowsS.map((r) => (
            <span key={r.key} className={s.kpiStatLg}>
              <span className={s.kpiStatSw} style={{ background: r.color }} />{r.label} <b>{r.count}</b> <small>· {Math.round((r.count / total) * 100)}%</small>
            </span>
          ))}
        </div>
        {overdue > 0 && (
          <div className={s.kpiOverdue} title="Task đã qua hạn mà chưa có mốc hoàn thành">
            Quá hạn chưa hoàn thành: <b>{overdue}</b> việc
          </div>
        )}
      </div>
    )
  }

  // Nhãn kỳ để hiển thị (thẻ tổng, popup): khoảng ngày → "dd/mm – dd/mm", không thì "Tháng m/yyyy".
  const periodLabel = hasRange
    ? `${from ? fmtDate(from) : '…'} – ${to ? fmtDate(to) : '…'}`
    : `Tháng ${month}/${year}`

  // Preset "Kỳ" — KPI theo THÁNG nên "Tháng này"/"Tháng trước" chọn 1 tháng cụ thể;
  // "Năm nay"/"Tất cả" để trống tháng → hiện nhắc chọn tháng (không gộp nhiều tháng).
  function applyPeriodPreset(key) {
    setFrom(''); setTo('')   // preset theo tháng → bỏ khoảng ngày tùy chọn
    if (key === 'tm') { setYear(String(CUR_YEAR)); setMonth(String(CUR_MONTH)); return }
    if (key === 'lm') { let y = CUR_YEAR, m = CUR_MONTH - 1; if (m < 1) { m = 12; y -= 1 }; setYear(String(y)); setMonth(String(m)); return }
    if (key === 'ty') { setYear(String(CUR_YEAR)); setMonth(''); return }
    if (key === 'all') { setYear(''); setMonth(''); return }
  }

  const toolbar = (
    <div className={s.toolbar}>
      <span className={s.toolField} style={{ minWidth: 220 }}>
        <span>Kỳ</span>
        <PeriodPicker
          year={year ? String(year) : ''}
          month={month ? String(month) : ''}
          from={from}
          to={to}
          availableYears={years}
          align="right"
          fullRangeLabel
          onYear={(v) => { setYear(v); if (!v) setMonth('') }}
          onMonth={(v) => setMonth(v)}
          onFrom={(v) => setFrom(v || '')}
          onTo={(v) => setTo(v || '')}
          onPreset={applyPeriodPreset}
        />
      </span>
      <span className={`${s.stBadge} ${hasRange ? s.stRange : data.closed ? s.stClosed : s.stOpen}`}>{hasRange ? 'Khoảng ngày' : data.closed ? <><Lock size={12} />Đã chốt</> : <><LockOpen size={12} />Đang mở</>}</span>
      {isAdmin && month && !hasRange && (data.closed
        ? <button className={s.btnReopen} onClick={handleReopen} disabled={busy}>{busy ? <Loader2 size={13} className={s.spin} /> : <LockOpen size={13} />} Mở lại sổ</button>
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

      {(!month && !hasRange) ? <div className={s.empty}>Hãy chọn một <strong>tháng</strong> hoặc một <strong>khoảng ngày</strong> ở bộ lọc “Kỳ” để xem KPI.</div>
      : loading ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div>
      : data.rows.length === 0 ? <div className={s.empty}>Chưa có dữ liệu KPI cho tháng này.</div>
      : (
        <>
          {/* Thẻ tổng */}
          <div className={s.kpiCards}>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Nhân viên có KPI</div>
              <div className={s.kpiV}>{summary.n}</div>
              <div className={s.kpiSub}>{periodLabel}</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tổng điểm khối lượng</div>
              <div className={s.kpiV}>{fmtMoney(summary.sumVol)} <small>đ</small></div>
              <div className={s.kpiSub}>Định kỳ <strong>{summary.sumVolRec}</strong> · Khác <strong>{summary.sumVolOther}</strong></div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tỉ lệ đúng hạn TB</div>
              <div className={s.kpiV}>{summary.avgPct == null ? '—' : summary.avgPct}<small>%</small></div>
              <div className={s.kpiSub}>{summary.sumOnTime}/{summary.sumAssigned} việc đúng hạn</div>
            </div>
            <div className={s.kpiCard}>
              <div className={s.kpiK}>Tỉ lệ hoàn thành</div>
              <div className={s.kpiV}>{(data.taskTotal || 0) === 0 ? '—' : Math.round(((data.completedCount || 0) * 100) / data.taskTotal)}<small>%</small></div>
              <div className={s.kpiSub}>{data.completedCount || 0}/{data.taskTotal || 0} việc hoàn thành</div>
            </div>
          </div>

          {/* === BẢNG CHI TIẾT NHÂN VIÊN (ngay dưới thẻ tổng) === */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '4px 2px 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-extrabold)', color: 'var(--color-text-strong)' }}>Bảng chi tiết nhân viên</span>
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
                            const vol = b?.volumePoints || 0
                            if (!b || (b.dueCount === 0 && vol === 0)) return <td key={k} className={s.num}><span className={s.zero}>—</span></td>
                            const pct = b.dueCount > 0 ? Math.round((b.onTimeCount * 100) / b.dueCount) : null
                            return <td key={k} className={s.num} title={`${b.taskCount} việc (đến hạn ${b.dueCount}) · ${vol}đ`}>
                              <div>{b.dueCount > 0 ? `${b.onTimeCount}/${b.dueCount}` : '—'}</div>
                              {pct != null && <div style={{ fontSize: 'var(--fs-3xs)', fontWeight: 700, color: pctColor(pct) }}>{pct}%</div>}
                              <div style={{ fontSize: 'var(--fs-3xs)', color: 'var(--color-primary)', fontWeight: 700 }}>{vol}đ</div>
                            </td>
                          })}
                          <td className={s.num}><strong>{r.onTimeCount}/{r.assignedCount}</strong>{r.onTimePct != null ? <div style={{ fontSize: 'var(--fs-3xs)', fontWeight: 700, color: pctColor(r.onTimePct) }}>{r.onTimePct}%</div> : null}<div style={{ fontSize: 'var(--fs-3xs)', color: 'var(--color-primary)', fontWeight: 700 }}>{r.volumePoints || 0}đ</div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className={s.cardFoot}>ℹ️ Mỗi ô: <strong>đúng hạn / đã đến hạn</strong> + % + <strong style={{ color: 'var(--color-primary)' }}>điểm khối lượng</strong> theo nguồn (định kỳ = điểm cấu hình; nguồn khác = 1đ/bước). Bấm 1 dòng để xem chi tiết.</div>
            </>
          ) : (
          <>
          {/* Bảng gộp — bấm 1 dòng để mở chi tiết */}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr>
                <th className={s.colStt}>STT</th><th>Nhân viên</th>
                <th className={s.num}>Điểm khối lượng</th><th className={s.num}>Đúng hạn</th><th>% đúng hạn</th>
                <th className={s.num}>Điểm KPI</th><th></th>
              </tr></thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td title={r.jobTitle || undefined}>{r.userName}</td>
                    <td className={s.num}><strong>{r.volumePoints}</strong><div style={{ fontSize: 'var(--fs-3xs)', color: 'var(--color-muted)', fontWeight: 400 }}>ĐK {r.volumeRecurring ?? 0} · Khác {r.volumeOther ?? 0}</div></td>
                    <td className={s.num}>{r.onTimeCount}/{r.assignedCount}</td>
                    <td>{r.onTimePct == null ? <span className={s.zero}>—</span> : (
                      <span className={s.kpiMini}><span className={s.kpiMiniTrack}><span className={s.kpiMiniFill} style={{ width: `${r.onTimePct}%`, background: pctColor(r.onTimePct) }} /></span><span className={s.num}>{r.onTimePct}%</span></span>
                    )}</td>
                    <td className={s.num}>{fmtSigned(r.kpiPoints)}</td>
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
                  <td className={s.num}>—</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={s.cardFoot}>ℹ️ Bấm 1 dòng để xem <strong>chi tiết từng công việc</strong> &amp; điểm theo công ty/loại/nguồn/độ khó/trạng thái. <strong>Điểm KPI</strong> quy từ % đúng hạn. (Xếp loại &amp; tiền thưởng/phạt xem ở tab <strong>Tổng hợp theo nhân viên</strong>.)</div>
          </>
          )}

          {/* Biểu đồ */}
          <div className={s.kpiCharts}>
            <div className={s.kpiPanel}>
              <h4>Điểm khối lượng theo nhân viên</h4>
              <div className={s.kpiHint}>Đạt / tổng điểm trong kỳ (phần xám = chưa xong). Thanh tách: <strong>Định kỳ</strong> (điểm cấu hình) + <strong>Task khác</strong> (1đ/bước).</div>
              <div style={{ display: 'flex', gap: 14, margin: '6px 0 2px', fontSize: 'var(--fs-2xs)', color: 'var(--color-text-soft)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--color-primary)' }} />Định kỳ (điểm cấu hình)</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--color-success-text)' }} />Task khác (1đ/bước)</span>
              </div>
              {summary.sumVol === 0 ? (
                <div className={s.empty} style={{ padding: 12 }}>Chưa có điểm khối lượng trong kỳ — việc định kỳ chưa chấm điểm checklist & chưa hoàn thành bước nào ở task khác.</div>
              ) : (
                <div className={s.kpiBars}>
                  {summary.volTop.map((r) => {
                    const got = r.volumePoints || 0
                    const poss = r.volumePossible || 0
                    const rec = r.volumeRecurring || 0
                    const oth = r.volumeOther || 0
                    const recPct = poss > 0 ? (rec / poss) * 100 : 0
                    const othPct = poss > 0 ? (oth / poss) * 100 : 0
                    return (
                    <div className={s.kpiBarRow} key={r.userId}>
                      <span className={s.kpiNm} title={r.userName}>{shortName(r.userName)}</span>
                      <span className={s.kpiTrack} style={{ display: 'flex' }} title={`Định kỳ ${rec} · Khác ${oth} = ${got} / ${poss}`}>
                        <span style={{ width: `${recPct}%`, background: 'var(--color-primary)' }} />
                        <span style={{ width: `${othPct}%`, background: 'var(--color-success-text)' }} />
                      </span>
                      <span className={s.kpiVal}>{got} <small style={{ color: 'var(--color-muted)', fontWeight: 'var(--fw-regular, 400)' }}>/ {poss}</small></span>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={s.kpiPanel}>
              <h4>% đúng hạn theo nhân viên</h4>
              <div className={s.kpiHint}>Tỉ lệ việc hoàn thành đúng hạn mỗi nhân viên (đường mục tiêu {ON_TIME_TARGET}%).</div>
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

          {/* Trạng thái công việc trong kỳ */}
          {(data.statusReport || []).some((x) => (x.count || 0) > 0) && (
            <div className={s.kpiPanel} style={{ marginBottom: 14 }}>
              <h4>Trạng thái công việc trong kỳ</h4>
              <div className={s.kpiHint}>Số việc đến hạn trong kỳ theo trạng thái. “Quá hạn chưa hoàn thành” = đã qua hạn mà chưa xong (gồm cả việc còn ở trạng thái khác).</div>
              {renderStatus(data.statusReport, data.overdueCount)}
            </div>
          )}

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
                        <span key={sg.source} title={`${getLabel('task_source', sg.source, sg.source)}: ${sg.count} việc · đúng hạn ${sg.onTime} · ${sg.vol}đ`}
                          style={{ width: `${Math.round((sg.count / u.total) * 100)}%`, background: sourceReport.colors[sg.source] }} />
                      ))}
                    </span>
                    <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 'var(--fw-bold)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phân bố theo độ khó checklist — chỉ việc định kỳ (auto) */}
          {(data.difficultyReport || []).some((d) => (d.totalPoints || 0) > 0 || (d.stepCount || 0) > 0) && (
            <div className={s.kpiPanel} style={{ marginBottom: 14 }}>
              <h4>Phân bố điểm theo độ khó · việc định kỳ</h4>
              <div className={s.kpiHint}>Điểm checklist theo mức độ (đạt / tổng). Chỉ tính công việc định kỳ — nguồn khác không gắn độ khó.</div>
              {renderDifficulty(data.difficultyReport)}
            </div>
          )}

        </>
      )}

      {detail && (
        <Modal title={`KPI — ${detail.user.userName} · ${periodLabel}`} onClose={() => setDetail(null)} wide>
          {/* Header 1 hàng: tên + các chỉ số gộp chung */}
          <div className={s.kpiDHead}>
            <div className={s.kpiDHid}>
              <div className={s.kpiDnm}>{detail.user.userName}</div>
              <div className={s.kpiDjt}>{detail.user.jobTitle || 'Nhân viên'} · {periodLabel}</div>
            </div>
            <div className={s.kpiDmetrics}>
              <div className={s.kpiDm}><span>Điểm KL — ĐK {detail.user.volumeRecurring ?? 0} · Khác {detail.user.volumeOther ?? 0}</span><b>{detail.user.volumePoints ?? 0} / {detail.user.volumePossible ?? (detail.user.volumePoints ?? 0)}</b></div>
              <div className={s.kpiDm}><span>% đúng hạn</span><b>{detail.user.onTimePct == null ? '—' : `${detail.user.onTimePct}%`}</b></div>
              <div className={s.kpiDm}><span>Đến hạn / đúng hạn</span><b>{detail.user.assignedCount ?? 0} / {detail.user.onTimeCount ?? 0}</b></div>
              <div className={s.kpiDm}><span>Điểm KPI</span><b>{detail.user.kpiPoints != null ? fmtSigned(detail.user.kpiPoints) : '—'}</b></div>
            </div>
          </div>

          {!detail.data ? <div className={s.loading}><Loader2 size={14} className={s.spin} /> Đang tải…</div> : (() => {
            const TABS = [
              ['company', `Theo công ty (${detail.data.byCompany?.length || 0})`],
              ['type',    `Theo loại CV (${detail.data.byType?.length || 0})`],
              ['source',  `Theo nguồn${detail.tasks ? ` · ${detail.tasks.length} việc` : ''}`],
              ['difficulty', `Theo độ khó (${detail.data.byDifficulty?.length || 0})`],
              ['status',  `Theo trạng thái (${detail.data.byStatus?.length || 0})`],
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

                {dTab === 'difficulty' && renderDifficulty(detail.data.byDifficulty)}
                {dTab === 'status' && renderStatus(detail.data.byStatus, detail.data.overdueCount)}
              </>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
