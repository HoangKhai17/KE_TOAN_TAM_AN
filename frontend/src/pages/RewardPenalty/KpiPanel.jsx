import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Lock, LockOpen, ChevronRight, Users, ChevronDown, Check, Award, Clock, CheckCircle2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import { getKpiDetail, getKpiUserTasks, closeKpiMonth, reopenKpiMonth, getKpiPerformance } from '../../api/kpi'
import { listUserOptions } from '../../api/users'
import PeriodPicker from '../Tasks/PeriodPicker'
import s from './rewardPenalty.module.css'

const ROLE_FILTERS = [['all', 'Tất cả'], ['staff', 'Nhân viên'], ['admin', 'Quản trị']]
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

  // Mức trễ để bày cột Lũy tuyến: CHỈ hiện mức thực sự có việc (động theo dữ liệu), không cố định đủ cấu hình.
  const allDelayLevels = data?.delayLevels || []
  const maxLvl = allDelayLevels.reduce((m, l) => Math.max(m, l.monthsLate), 0)
  const delayLevels = allDelayLevels.filter((lv) => (data?.rows || []).some((r) => (r.lateByLevel?.[lv.monthsLate]?.count || 0) > 0))
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
            <div className={`${s.kpiCard} ${s.kpiBlue}`}>
              <div className={s.kpiCardInner}>
                <div className={s.kpiIcon}><Users size={20} /></div>
                <div className={s.kpiText}>
                  <div className={s.kpiK}>Nhân viên có KPI</div>
                  <div className={s.kpiV}>{summary.n}</div>
                  <div className={s.kpiSub}>{periodLabel}</div>
                </div>
              </div>
            </div>
            <div className={`${s.kpiCard} ${s.kpiAmber}`}>
              <div className={s.kpiCardInner}>
                <div className={s.kpiIcon}><Award size={20} /></div>
                <div className={s.kpiText}>
                  <div className={s.kpiK}>Tổng điểm khối lượng</div>
                  <div className={s.kpiV}>{fmtMoney(summary.sumVol)} <small>đ</small></div>
                  <div className={s.kpiSub}>Định kỳ <strong>{summary.sumVolRec}</strong> · Khác <strong>{summary.sumVolOther}</strong></div>
                </div>
              </div>
            </div>
            <div className={`${s.kpiCard} ${s.kpiCyan}`}>
              <div className={s.kpiCardInner}>
                <div className={s.kpiIcon}><Clock size={20} /></div>
                <div className={s.kpiText}>
                  <div className={s.kpiK}>Tỉ lệ đúng hạn TB</div>
                  <div className={s.kpiV}>{summary.avgPct == null ? '—' : summary.avgPct}<small>%</small></div>
                  <div className={s.kpiSub}>{summary.sumOnTime}/{summary.sumAssigned} việc đúng hạn</div>
                </div>
              </div>
            </div>
            <div className={`${s.kpiCard} ${s.kpiGreen}`}>
              <div className={s.kpiCardInner}>
                <div className={s.kpiIcon}><CheckCircle2 size={20} /></div>
                <div className={s.kpiText}>
                  <div className={s.kpiK}>Tỉ lệ hoàn thành</div>
                  <div className={s.kpiV}>{(data.taskTotal || 0) === 0 ? '—' : Math.round(((data.completedCount || 0) * 100) / data.taskTotal)}<small>%</small></div>
                  <div className={s.kpiSub}>{data.completedCount || 0}/{data.taskTotal || 0} việc hoàn thành</div>
                </div>
              </div>
            </div>
          </div>

          {/* === BẢNG CHI TIẾT NHÂN VIÊN (ngay dưới thẻ tổng) === */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '4px 2px 8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-extrabold)', color: 'var(--color-text-strong)' }}>Bảng chi tiết nhân viên</span>
          </div>

          {(
          <>
          {/* Bảng chi tiết — bấm 1 dòng để mở chi tiết */}
          <div className={s.tableWrap}>
            <table className={`${s.table} ${s.kpiTable}`}>
              <thead>
                <tr>
                  <th className={s.colStt} rowSpan={3}>STT</th>
                  <th className={s.stickyNv} rowSpan={3}>Nhân viên</th>
                  <th colSpan={6} style={{ textAlign: 'center', borderLeft: '1.5px solid var(--color-border)' }} title="Việc theo lịch định kỳ ĐẾN HẠN trong tháng này">Việc định kỳ (tháng này)</th>
                  <th colSpan={3} style={{ textAlign: 'center', borderLeft: '1.5px solid var(--color-border)' }} title="Việc nguồn khác (giao tay, khách, …) — không tính điểm">Việc khác</th>
                  <th colSpan={delayLevels.length * 5 + 1} style={{ textAlign: 'center', borderLeft: '1.5px solid var(--color-border)' }} title="Việc CŨ (đến hạn tháng trước) làm bù trong tháng này → bị giảm điểm theo lũy tuyến, tách theo số tháng trễ">Lũy tuyến · việc cũ (làm bù)</th>
                  <th colSpan={5} style={{ textAlign: 'center', borderLeft: '1.5px solid var(--color-border)' }} title="Tổng điểm = điểm tháng này + điểm việc cũ">Tổng</th>
                  <th className={s.colDetail} rowSpan={3} style={{ borderLeft: '1.5px solid var(--color-border)' }}>Chi tiết</th>
                </tr>
                <tr>
                  {/* Việc định kỳ (tháng này) — sub rowSpan 2 */}
                  <th className={s.num} rowSpan={2} style={{ borderLeft: '1.5px solid var(--color-border)' }} title="Số việc định kỳ đến hạn tháng này">Giao</th>
                  <th className={s.num} rowSpan={2} title="Số việc định kỳ đã hoàn thành">Làm</th>
                  <th className={s.num} rowSpan={2} title="% hoàn thành việc = Làm / Giao">% HT</th>
                  <th className={s.num} rowSpan={2} title="Điểm đạt được từ việc tháng này">Đạt</th>
                  <th className={s.num} rowSpan={2} title="Tổng điểm gốc việc tháng này">Tổng</th>
                  <th className={s.num} rowSpan={2} title="% đạt điểm = Đạt / Tổng">% Đạt</th>
                  {/* Việc khác */}
                  <th className={s.num} rowSpan={2} style={{ borderLeft: '1.5px solid var(--color-border)' }} title="Số việc nguồn khác đến hạn tháng này">Giao</th>
                  <th className={s.num} rowSpan={2} title="Số việc nguồn khác đã hoàn thành">Làm</th>
                  <th className={s.num} rowSpan={2} title="% hoàn thành việc khác = Làm / Giao">% HT</th>
                  {/* Lũy tuyến — nhóm theo mức trễ (row 2 = nhãn mức, row 3 = số việc/điểm mất) */}
                  {delayLevels.map((lv, idx) => (
                    <th key={lv.monthsLate} className={s.num} colSpan={5} style={{ textAlign: 'center', borderLeft: idx === 0 ? '1.5px solid var(--color-border)' : '1px solid var(--color-border-muted)' }}
                        title={`Việc cũ trễ ${lv.monthsLate} tháng → hệ số ${lv.factorPct}% (điểm thực nhận = điểm gốc × ${lv.factorPct}%)`}>
                      Trễ {lv.monthsLate === maxLvl ? `≥${lv.monthsLate}` : lv.monthsLate} tháng
                      <br /><small style={{ fontWeight: 400, opacity: 0.75 }}>hệ số {lv.factorPct}%</small>
                    </th>
                  ))}
                  <th className={s.num} rowSpan={2} style={{ borderLeft: '1.5px solid var(--color-border)' }} title="Số việc KHÁC (ngoài định kỳ) cũ làm bù trong kỳ — không tính điểm">Việc khác<br /><small style={{ fontWeight: 400, opacity: 0.75 }}>(cũ)</small></th>
                  {/* Tổng */}
                  <th className={s.num} rowSpan={2} style={{ borderLeft: '1.5px solid var(--color-border)' }} title="Điểm việc định kỳ tháng này (đúng lịch)">Tháng này</th>
                  <th className={s.num} rowSpan={2} title="Điểm việc cũ làm bù (sau lũy tuyến)">Việc cũ</th>
                  <th className={s.num} rowSpan={2} title="TỔNG điểm khối lượng = Tháng này + Việc cũ">Tổng điểm</th>
                  <th className={s.num} rowSpan={2} title="% việc hoàn thành đúng hạn">% đúng hạn</th>
                  <th className={s.num} rowSpan={2} title="Điểm KPI theo % đúng hạn">Điểm KPI</th>
                </tr>
                <tr>
                  {delayLevels.map((lv, idx) => [
                    <th key={`${lv.monthsLate}-c`} className={s.num} style={{ borderLeft: idx === 0 ? '1.5px solid var(--color-border)' : '1px solid var(--color-border-muted)' }} title="Số việc hoàn thành ở mức trễ này">Số việc</th>,
                    <th key={`${lv.monthsLate}-g`} className={s.num} title="Tổng điểm gốc của số việc đó">Điểm gốc</th>,
                    <th key={`${lv.monthsLate}-p`} className={s.num} title="Hệ số lũy tuyến (khớp cấu hình ở tab Quy đổi xếp loại) — điểm thực nhận = điểm gốc × hệ số">Hệ số</th>,
                    <th key={`${lv.monthsLate}-l`} className={s.num} title="Số điểm bị trừ">Điểm mất</th>,
                    <th key={`${lv.monthsLate}-n`} className={s.num} title="Điểm còn lại sau khi trừ (được cộng vào tổng)">Còn lại</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const recDue = r.recDue ?? 0, recDone = r.recDone ?? 0
                  const htPct = recDue > 0 ? Math.round((recDone / recDue) * 100) : null
                  const ptMonth = r.ptMonth ?? 0
                  const ptOld = r.ptOld ?? 0
                  const total = r.volumeRecurring ?? (ptMonth + ptOld)
                  const poss = r.volumePossible ?? 0
                  const achPct = poss > 0 ? Math.round((ptMonth / poss) * 100) : null
                  const othDue = r.otherDue ?? 0, othDone = r.otherDone ?? 0
                  const othPct = othDue > 0 ? Math.round((othDone / othDue) * 100) : null
                  const lbl = r.lateByLevel || {}
                  const grp = { borderLeft: '1.5px solid var(--color-border)' }
                  const sub = { borderLeft: '1px solid var(--color-border-muted)' }
                  const zero = <span className={s.zero}>—</span>
                  return (
                  <tr key={r.userId} className={s.kpiRowClick} onClick={() => openDetail(r)}>
                    <td className={s.colStt}>{i + 1}</td>
                    <td className={s.stickyNv} title={`${r.userName}${r.jobTitle ? ' · ' + r.jobTitle : ''}`}>{shortName(r.userName)}</td>
                    {/* Việc định kỳ (tháng này) */}
                    <td className={s.num} style={grp}>{recDue || zero}</td>
                    <td className={s.num}>{recDone || zero}</td>
                    <td className={s.num}>{htPct == null ? zero : <span style={{ color: pctColor(htPct), fontWeight: 600 }}>{htPct}%</span>}</td>
                    <td className={s.num}><strong>{ptMonth}</strong></td>
                    <td className={s.num} style={{ color: 'var(--color-muted)' }}>{poss}</td>
                    <td className={s.num}>{achPct == null ? zero : <span style={{ color: pctColor(achPct), fontWeight: 600 }}>{achPct}%</span>}</td>
                    {/* Việc khác */}
                    <td className={s.num} style={grp}>{othDue || zero}</td>
                    <td className={s.num}>{othDone || zero}</td>
                    <td className={s.num}>{othPct == null ? zero : <span style={{ color: pctColor(othPct), fontWeight: 600 }}>{othPct}%</span>}</td>
                    {/* Lũy tuyến · việc cũ — tách theo mức trễ (Số việc · Điểm gốc · Trừ % · Điểm mất · Còn lại) */}
                    {delayLevels.map((lv, idx) => {
                      const b = lbl[lv.monthsLate]
                      const cnt = b?.count ?? 0, gross = b?.gross ?? 0, lost = b?.lost ?? 0
                      const net = gross - lost, hs = lv.factorPct
                      return [
                        <td key={`${lv.monthsLate}-c`} className={s.num} style={idx === 0 ? grp : sub}>{cnt > 0 ? cnt : zero}</td>,
                        <td key={`${lv.monthsLate}-g`} className={s.num} style={{ color: 'var(--color-muted)' }}>{cnt > 0 ? gross : zero}</td>,
                        <td key={`${lv.monthsLate}-p`} className={s.num}>{cnt > 0 ? <span style={{ color: hs < 0 ? 'var(--color-danger-text)' : 'var(--color-text-soft)', fontWeight: 600 }}>{hs}%</span> : zero}</td>,
                        <td key={`${lv.monthsLate}-l`} className={s.num}>{cnt > 0 ? (lost !== 0 ? <span style={{ color: 'var(--color-danger-text)', fontWeight: 600 }}>−{lost}</span> : <span className={s.zero}>0</span>) : zero}</td>,
                        <td key={`${lv.monthsLate}-n`} className={s.num}>{cnt > 0 ? <strong>{net}</strong> : zero}</td>,
                      ]
                    })}
                    <td className={s.num} style={grp}>{(r.otherOldCount ?? 0) > 0 ? r.otherOldCount : zero}</td>
                    {/* Tổng */}
                    <td className={s.num} style={grp}>{ptMonth || zero}</td>
                    <td className={s.num}>{ptOld ? <span style={{ color: 'var(--color-warning-text)', fontWeight: 600 }}>{ptOld}</span> : zero}</td>
                    <td className={s.num} style={{ background: 'var(--color-bg-soft)' }}><strong style={{ fontSize: 'var(--fs-xs)' }}>{total}</strong></td>
                    <td className={s.num}>{r.onTimePct == null ? zero : <span style={{ color: pctColor(r.onTimePct), fontWeight: 600 }}>{r.onTimePct}%</span>}</td>
                    <td className={s.num}>{fmtSigned(r.kpiPoints)}</td>
                    <td className={s.colDetail} style={grp}><button type="button" className={s.viewDetail} onClick={(e) => { e.stopPropagation(); openDetail(r) }}>Chi tiết <ChevronRight size={12} /></button></td>
                  </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={s.stickyFootL} colSpan={2}>TỔNG · {summary.n} NV</td>
                  {/* Việc định kỳ (tháng này) */}
                  <td className={s.num} style={{ borderLeft: '1.5px solid var(--color-border)' }}>{data.rows.reduce((a, r) => a + (r.recDue || 0), 0)}</td>
                  <td className={s.num}>{data.rows.reduce((a, r) => a + (r.recDone || 0), 0)}</td>
                  <td className={s.num}>—</td>
                  <td className={s.num}>{data.rows.reduce((a, r) => a + (r.ptMonth || 0), 0)}</td>
                  <td className={s.num}>{data.rows.reduce((a, r) => a + (r.volumePossible || 0), 0)}</td>
                  <td className={s.num}>—</td>
                  {/* Việc khác */}
                  <td className={s.num} style={{ borderLeft: '1.5px solid var(--color-border)' }}>{data.rows.reduce((a, r) => a + (r.otherDue || 0), 0)}</td>
                  <td className={s.num}>{data.rows.reduce((a, r) => a + (r.otherDone || 0), 0)}</td>
                  <td className={s.num}>—</td>
                  {/* Lũy tuyến · việc cũ — tổng theo mức trễ (Số việc · Điểm gốc · Trừ% · Điểm mất · Còn lại) */}
                  {delayLevels.map((lv, idx) => {
                    const c = data.rows.reduce((a, r) => a + (r.lateByLevel?.[lv.monthsLate]?.count || 0), 0)
                    const g = data.rows.reduce((a, r) => a + (r.lateByLevel?.[lv.monthsLate]?.gross || 0), 0)
                    const l = data.rows.reduce((a, r) => a + (r.lateByLevel?.[lv.monthsLate]?.lost || 0), 0)
                    return [
                      <td key={`${lv.monthsLate}-c`} className={s.num} style={{ borderLeft: idx === 0 ? '1.5px solid var(--color-border)' : '1px solid var(--color-border-muted)' }}>{c || '—'}</td>,
                      <td key={`${lv.monthsLate}-g`} className={s.num}>{g || '—'}</td>,
                      <td key={`${lv.monthsLate}-p`} className={s.num}>—</td>,
                      <td key={`${lv.monthsLate}-l`} className={s.num}>{l ? `−${l}` : '—'}</td>,
                      <td key={`${lv.monthsLate}-n`} className={s.num}><strong>{g - l || '—'}</strong></td>,
                    ]
                  })}
                  <td className={s.num} style={{ borderLeft: '1.5px solid var(--color-border)' }}>{data.rows.reduce((a, r) => a + (r.otherOldCount || 0), 0)}</td>
                  {/* Tổng */}
                  <td className={s.num} style={{ borderLeft: '1.5px solid var(--color-border)' }}>{data.rows.reduce((a, r) => a + (r.ptMonth || 0), 0)}</td>
                  <td className={s.num}>{data.rows.reduce((a, r) => a + (r.ptOld || 0), 0)}</td>
                  <td className={s.num} style={{ background: 'var(--color-bg-soft)' }}><strong>{summary.sumVol}</strong></td>
                  <td className={s.num}>{summary.avgPct == null ? '—' : `${summary.avgPct}%`}</td>
                  <td className={s.num}>—</td>
                  <td className={s.colDetail} style={{ borderLeft: '1.5px solid var(--color-border)' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className={s.cardFoot}>ℹ️ <strong>Việc định kỳ (tháng này)</strong> — Giao (đến hạn tháng này) · Làm (đã xong) · %HT = Làm/Giao · Đạt (điểm việc tháng này) · Tổng (điểm gốc tháng này) · %Đạt = Đạt/Tổng. <strong>Việc khác</strong> — Giao · Làm · %HT (không tính điểm). <strong>Lũy tuyến · việc cũ (làm bù)</strong> — việc tháng TRƯỚC hoàn thành trong tháng này, <strong>tách theo số tháng trễ</strong> (chỉ hiện mức có việc). Mỗi mức đủ 5 cột: <strong>Số việc · Điểm gốc · Hệ số · Điểm mất · Còn lại</strong> (Hệ số khớp cấu hình ở tab <em>Quy đổi xếp loại</em>; Còn lại = Điểm gốc × Hệ số = Điểm gốc − Điểm mất, được cộng vào "Việc cũ" ở khối Tổng). Cột "Việc khác (cũ)" đếm việc ngoài định kỳ làm bù (không tính điểm). <strong>Tổng</strong> — Tháng này + Việc cũ = <strong>Tổng điểm</strong> khối lượng của tháng, rồi %đúng hạn → Điểm KPI. Bấm 1 dòng để xem từng công việc. (Xếp loại &amp; tiền thưởng/phạt xem ở tab <strong>Tổng hợp theo nhân viên</strong>.)</div>
          </>
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
            const lateTasks = (detail.tasks || []).filter((t) => t.isRecurring && t.monthsLate > 0)
            const lostPoints = lateTasks.reduce((a, t) => a + ((t.grossPoints || 0) - (t.points || 0)), 0)
            const tasks = detail.tasks || []
            return (
              <>
                {lateTasks.length > 0 && (
                  <div style={{ margin: '0 0 10px', padding: '7px 11px', borderRadius: 8, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', fontSize: 'var(--fs-2xs)', fontWeight: 600 }}>
                    ⏳ {lateTasks.length} việc định kỳ hoàn thành TRỄ tháng → bị lũy tuyến <strong>giảm {lostPoints}đ</strong> trong kỳ (xem cột Điểm bên dưới).
                  </div>
                )}
                {tasks.length === 0 ? (
                  <div className={s.empty} style={{ padding: 12 }}>Không có công việc trong kỳ.</div>
                ) : (
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead><tr>
                        <th className={s.colStt}>STT</th>
                        <th>Công việc</th>
                        <th>Công ty / Loại</th>
                        <th>Nguồn</th>
                        <th className={s.num}>Hạn</th>
                        <th className={s.num}>Hoàn thành</th>
                        <th>Trạng thái</th>
                        <th className={s.num}>Điểm</th>
                      </tr></thead>
                      <tbody>
                        {tasks.map((t, i) => {
                          const stLabel = t.status === 'completed' ? (t.onTime ? 'Đúng hạn' : 'Trễ') : (t.notDueYet ? 'Chưa tới hạn' : 'Quá hạn chưa xong')
                          const stCls   = t.status === 'completed' ? (t.onTime ? s.kpiStOk : s.kpiStLate) : (t.notDueYet ? '' : s.kpiStLate)
                          const srcLbl  = t.source === 'auto' ? 'Định kỳ' : getLabel('task_source', t.source, t.source)
                          return (
                            <tr key={t.taskId}>
                              <td className={s.colStt}>{i + 1}</td>
                              <td>
                                <div style={{ fontWeight: 600 }} title={t.title}>{t.title}</div>
                                {t.isRecurring && t.monthsLate > 0 && (
                                  <span style={{ fontSize: 'var(--fs-3xs)', fontWeight: 700, color: 'var(--color-warning-text)' }} title={`Hoàn thành trễ ${t.monthsLate} tháng → lũy tuyến ${t.grossPoints}đ → ${t.points}đ`}>
                                    ⏳ Trễ {t.monthsLate} th · {t.grossPoints}→{t.points}đ
                                  </span>
                                )}
                              </td>
                              <td>
                                {t.companyName || '—'}
                                {t.typeName && <div style={{ fontSize: 'var(--fs-3xs)', color: 'var(--color-muted)' }}>{t.typeName}</div>}
                              </td>
                              <td>{srcLbl}</td>
                              <td className={s.num}>{t.dueDate ? fmtDate(t.dueDate) : '—'}</td>
                              <td className={s.num}>{t.completedAt ? fmtDate(t.completedAt) : '—'}</td>
                              <td><span className={`${s.kpiSt} ${stCls}`} style={stCls ? undefined : { background: 'var(--color-surface-muted)', color: 'var(--color-muted)' }}>{stLabel}</span></td>
                              <td className={`${s.num} ${t.points > 0 ? s.kpiPos : ''}`}>{t.points > 0 ? `+${t.points}` : t.points}đ</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}
