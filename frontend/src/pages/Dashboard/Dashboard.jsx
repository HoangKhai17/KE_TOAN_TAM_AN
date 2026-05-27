import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Building2, ClipboardList, AlertTriangle, CheckCircle2,
  TrendingUp, ArrowRight, Loader2,
  Maximize2, Minimize2, User, Calendar as CalendarIcon,
  FileText, Users, SendHorizonal,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { getDashboardSummary, getDashboardCharts } from '../../api/dashboard'
import { useDataSync } from '../../hooks/useDataSync'
import s from './Dashboard.module.css'

const DASHBOARD_COLORS = {
  primary: '#2563eb',
  primaryRing: '#93c5fd',
  grid: '#f1f5f9',
  axis: '#94a3b8',
  axisStrong: '#64748b',
  white: '#ffffff',
  orange: '#f97316',
  emerald: '#059669',
  indigo: '#4f46e5',
  indigoSoft: '#818cf8',
  emeraldSoft: '#34d399',
  amber: '#d97706',
  amberSoft: '#fbbf24',
  red: '#dc2626',
  redSoft: '#f87171',
  violet: '#7c3aed',
  violetSoft: '#a78bfa',
  cyan: '#0891b2',
  cyanSoft: '#22d3ee',
  orangeDark: '#ea580c',
  orangeSoft: '#fb923c',
  lime: '#65a30d',
  limeSoft: '#a3e635',
}

const PIE_GRADIENTS = [
  [DASHBOARD_COLORS.indigo, DASHBOARD_COLORS.indigoSoft],
  [DASHBOARD_COLORS.emerald, DASHBOARD_COLORS.emeraldSoft],
  [DASHBOARD_COLORS.amber, DASHBOARD_COLORS.amberSoft],
  [DASHBOARD_COLORS.red, DASHBOARD_COLORS.redSoft],
  [DASHBOARD_COLORS.violet, DASHBOARD_COLORS.violetSoft],
  [DASHBOARD_COLORS.cyan, DASHBOARD_COLORS.cyanSoft],
  [DASHBOARD_COLORS.orangeDark, DASHBOARD_COLORS.orangeSoft],
  [DASHBOARD_COLORS.lime, DASHBOARD_COLORS.limeSoft],
]

const CHART_MARGIN = {
  trend:    { top: 12, right: 16, left: -10, bottom: 0 },
  workload: { top: 12, right: 16, left: -10, bottom: 10 },
}
const CHART_TICK = {
  axis:      { fontSize: 11, fill: DASHBOARD_COLORS.axis },
  staffName: { fontSize: 10, fill: DASHBOARD_COLORS.axisStrong, fontWeight: 500 },
}
const CHART_LEGEND = {
  trend:    { fontSize: 12, paddingTop: 8 },
  workload: { fontSize: 12, paddingTop: 4 },
}
const BAR_RADIUS    = [4, 4, 0, 0]
const AREA_DOT      = { r: 5, fill: DASHBOARD_COLORS.primary, strokeWidth: 2, stroke: DASHBOARD_COLORS.white }
const AREA_ACTIVE_DOT = { r: 7 }

const PRIORITY_CLASS = {
  urgent: s.priUrgent,
  high:   s.priHigh,
  medium: s.priMedium,
  normal: s.priMedium,
  low:    s.priLow,
}
const PRIORITY_LABEL = { urgent: 'Khẩn', high: 'Cao', medium: 'TB', normal: 'Thường', low: 'Thấp' }

const STATUS_CLASS = {
  pending:         s.statusPending,
  in_progress:     s.statusInProgress,
  on_hold:         s.statusOnHold,
  pending_review:  s.statusPendingReview,
  needs_revision:  s.statusNeedsRevision,
  overdue:         s.statusOverdue,
}
const STATUS_LABEL = {
  pending:        'Chờ xử lý',
  in_progress:    'Đang làm',
  on_hold:        'Tạm dừng',
  pending_review: 'Chờ duyệt',
  needs_revision: 'Cần sửa',
  overdue:        'Quá hạn',
}

const RANGE_OPTIONS = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d',   label: '7 ngày'  },
  { key: '28d',  label: '28 ngày' },
]
const RANGE_SUB = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '28d': '4 tuần gần nhất' }

const TASK_TYPE_TABS = [
  { key: 'traditional', label: 'Truyền thống', icon: ClipboardList },
  { key: 'cdr',         label: 'Yêu cầu KH',  icon: FileText      },
  { key: 'ia',          label: 'Nội bộ',       icon: Users         },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRangeDates(range) {
  const to   = new Date()
  const from = new Date()
  if (range === '7d') {
    from.setDate(from.getDate() - 6)
  } else if (range === '28d') {
    from.setDate(from.getDate() - 27)
  }
  return {
    from: from.toISOString().slice(0, 10),
    to:   to.toISOString().slice(0, 10),
  }
}

function fmtWeek(dateStr) {
  if (!dateStr) return ''
  try { return format(parseISO(String(dateStr)), 'dd/MM', { locale: vi }) }
  catch { return String(dateStr).slice(5) }
}

function fmtDateShort(d) {
  if (!d) return '—'
  try { return format(parseISO(String(d).slice(0, 10)), 'dd/MM/yy') }
  catch { return String(d).slice(0, 10) }
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className={s.tooltip}>
      <p className={s.tooltipLabel}>{label}</p>
      {payload.map((p) => (
        <p
          key={p.name}
          className={s.tooltipItem}
          style={{ '--tooltip-item-color': p.color === DASHBOARD_COLORS.primary ? DASHBOARD_COLORS.primaryRing : p.color }}
        >
          {p.name}: <strong className={s.tooltipValue}>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── KPI card definitions per task type ───────────────────────────────────────
function buildKpiCards({ activeTaskType, summary, isStaff, loading, range, navigate }) {
  const val = (v) => loading ? null : (v ?? '—')

  if (activeTaskType === 'cdr') {
    return [
      {
        label: 'Tổng yêu cầu',
        value: val(summary?.totalItems),
        sub:   'hồ sơ được tạo',
        icon:  FileText,
        tone:  s.kpiBlue,
      },
      {
        label:  'Chờ cung cấp',
        value:  val(summary?.openTasks),
        sub:    'khách chưa nộp hồ sơ',
        icon:   ClipboardList,
        tone:   s.kpiAmber,
        urgent: (summary?.openTasks ?? 0) > 0,
      },
      {
        label:  'Quá hạn',
        value:  val(summary?.overdueTasks),
        sub:    'cần đôn đốc ngay',
        icon:   AlertTriangle,
        tone:   s.kpiRed,
        urgent: (summary?.overdueTasks ?? 0) > 0,
      },
      {
        label: 'Đã nhận',
        value: val(summary?.completedThisMonth),
        sub:   RANGE_SUB[range],
        icon:  CheckCircle2,
        tone:  s.kpiGreen,
      },
    ]
  }

  if (activeTaskType === 'ia') {
    const cards = [
      {
        label:  'Đang hoạt động',
        value:  val(summary?.openTasks),
        sub:    'phiếu đang thực hiện',
        icon:   SendHorizonal,
        tone:   s.kpiBlue,
      },
      {
        label:  'Quá hạn',
        value:  val(summary?.overdueTasks),
        sub:    'cần xử lý ngay',
        icon:   AlertTriangle,
        tone:   s.kpiRed,
        urgent: (summary?.overdueTasks ?? 0) > 0,
      },
      {
        label: 'Đã hoàn thành',
        value: val(summary?.completedThisMonth),
        sub:   'phiếu đã đóng',
        icon:  CheckCircle2,
        tone:  s.kpiPurple,
      },
    ]
    if (!isStaff) {
      cards.push({
        label: 'Bản nháp',
        value: val(summary?.draftCount),
        sub:   'chưa gửi đi',
        icon:  FileText,
        tone:  s.kpiGray,
      })
    }
    return cards
  }

  // traditional
  return [
    {
      label: isStaff ? 'KH tôi phụ trách' : 'Khách hàng hoạt động',
      value: val(summary?.activeCompanies),
      sub:   isStaff ? 'công ty tôi có việc chưa xong' : 'công ty đang hợp tác',
      icon:  Building2,
      tone:  s.kpiBlue,
    },
    {
      label: isStaff ? 'Việc của tôi' : 'Công việc đang mở',
      value: val(summary?.openTasks),
      sub:   'cần xử lý',
      icon:  ClipboardList,
      tone:  s.kpiGreen,
    },
    {
      label:  isStaff ? 'Quá hạn của tôi' : 'Quá hạn',
      value:  val(summary?.overdueTasks),
      sub:    'cần ưu tiên xử lý ngay',
      icon:   AlertTriangle,
      tone:   s.kpiRed,
      urgent: (summary?.overdueTasks ?? 0) > 0,
    },
    {
      label: isStaff ? 'Hoàn thành của tôi' : 'Hoàn thành',
      value: val(summary?.completedThisMonth),
      sub:   RANGE_SUB[range],
      icon:  CheckCircle2,
      tone:  s.kpiPurple,
    },
    {
      label: 'Tuân thủ SLA',
      value: loading ? null : (summary ? `${summary.slaComplianceRate}%` : '—'),
      sub:   isStaff ? 'đúng / trước hạn của tôi' : 'hoàn thành đúng / trước hạn',
      icon:  TrendingUp,
      tone:  s.kpiCyan,
    },
  ]
}

// ── Chart meta per task type ──────────────────────────────────────────────────
const CHART_META = {
  traditional: {
    trend:    { title: 'Xu hướng hoàn thành',         dataKey: 'completed', label: 'Đã hoàn thành', color: DASHBOARD_COLORS.primary,  gradId: 'areaGrad' },
    workload: { title: 'Tải công việc nhân viên',      openLabel: 'Cần thực hiện', completedLabel: 'Đã hoàn thành' },
    distrib:  { title: 'Phân loại công việc',          sub: 'theo nhóm' },
    overdue:  { link: '/tasks?filter=overdue',         itemLink: (t) => `/tasks/${t.id}` },
    dueToday: { link: '/tasks?filter=due_today' },
  },
  cdr: {
    trend:    { title: 'Xu hướng nhận hồ sơ',         dataKey: 'completed', label: 'Đã nhận', color: DASHBOARD_COLORS.amber,   gradId: 'areaGrad' },
    workload: { title: 'Hồ sơ theo công ty',           openLabel: 'Chờ cung cấp', completedLabel: 'Đã nhận' },
    distrib:  { title: 'Hồ sơ theo kỳ',                sub: 'theo kỳ báo cáo' },
    overdue:  { link: '/tasks?audience=client_request&filter=overdue', itemLink: () => null },
    dueToday: { link: '/tasks?audience=client_request' },
  },
  ia: {
    trend:    { title: 'Xu hướng hoàn thành phiếu',   dataKey: 'completed', label: 'Phiếu hoàn thành', color: DASHBOARD_COLORS.violet,  gradId: 'areaGrad' },
    workload: { title: 'Phiếu nội bộ theo nhân viên',  openLabel: 'Đang thực hiện', completedLabel: 'Đã hoàn thành' },
    distrib:  { title: 'Phiếu theo công ty',            sub: 'theo khách hàng' },
    overdue:  { link: '/internal-assignments',          itemLink: (t) => `/internal-assignments/${t.id}` },
    dueToday: { link: '/internal-assignments' },
  },
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const [summary,        setSummary]        = useState(null)
  const [charts,         setCharts]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState(null)
  const [range,          setRange]          = useState('28d')
  const [isFullscreen,   setIsFullscreen]   = useState(false)
  const [activeTaskType, setActiveTaskType] = useState('traditional')
  const [syncKey,        setSyncKey]        = useState(0)
  const syncTimer = useRef(null)

  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const params = { ...getRangeDates(range), taskType: activeTaskType }
      try {
        const [sum, chrt] = await Promise.all([
          getDashboardSummary(params),
          getDashboardCharts(params),
        ])
        if (!cancelled) { setSummary(sum); setCharts(chrt) }
      } catch (err) {
        if (!cancelled) setError(err?.response?.data?.message ?? err?.message ?? 'Lỗi tải dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [range, syncKey, activeTaskType])

  useDataSync(['data:task', 'data:company'], () => {
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => setSyncKey((k) => k + 1), 1500)
  }, [])

  const greetHour = new Date().getHours()
  const greetWord = greetHour < 12 ? 'Chào buổi sáng' : greetHour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
  const isStaff   = user?.role === 'staff'

  const kpiCards = buildKpiCards({ activeTaskType, summary, isStaff, loading, range, navigate })
  const meta     = CHART_META[activeTaskType]
  const trendColor = meta.trend.color

  return (
    <AppLayout title="Dashboard">

      {/* ── Top bar ── */}
      <div className={s.topBar}>
        <div className={s.greeting}>
          <h2 className={s.greetingTitle}>
            {greetWord}, {user?.name?.split(' ').pop() ?? 'bạn'} 👋
          </h2>
          <p className={s.greetingDate}>
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className={s.topBarRight}>
          <div className={s.rangeBtns}>
            {RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                className={`${s.rangeBtn} ${range === key ? s.rangeBtnActive : ''}`}
                onClick={() => setRange(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className={`${s.fullscreenBtn} ${isFullscreen ? s.fullscreenActive : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className={s.errorBanner}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {/* ── Task type tab bar — điều khiển toàn bộ dashboard ── */}
      <div className={s.taskTypeBar}>
        {TASK_TYPE_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`${s.taskTypeTab} ${activeTaskType === key ? s.taskTypeTabActive : ''}`}
            onClick={() => setActiveTaskType(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── KPI Cards ── */}
      <div className={s.kpiGrid}>
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} loading={loading} />
        ))}
      </div>

      {/* ── Charts row 1: Xu hướng + Tải công việc ── */}
      <div className={s.chartsRow}>
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>{meta.trend.title}</span>
              <span className={s.chartSub}>{RANGE_SUB[range]}</span>
            </div>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={charts?.weeklyTrend ?? []} margin={CHART_MARGIN.trend}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor={trendColor} stopOpacity={0.55} />
                    <stop offset="90%" stopColor={trendColor} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={DASHBOARD_COLORS.grid} />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={CHART_TICK.axis} />
                <YAxis tick={CHART_TICK.axis} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={CHART_LEGEND.trend} />
                <Area
                  type="monotone"
                  dataKey={meta.trend.dataKey}
                  name={meta.trend.label}
                  stroke={trendColor}
                  strokeWidth={2.5}
                  fill="url(#areaGrad)"
                  dot={{ ...AREA_DOT, fill: trendColor }}
                  activeDot={AREA_ACTIVE_DOT}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>
                {isStaff && activeTaskType === 'traditional'
                  ? 'Tải công việc của tôi'
                  : meta.workload.title}
              </span>
              <span className={s.chartSub}>{RANGE_SUB[range]}</span>
            </div>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts?.staffWorkload ?? []} margin={CHART_MARGIN.workload}>
                <CartesianGrid strokeDasharray="3 3" stroke={DASHBOARD_COLORS.grid} />
                <XAxis dataKey="name" tick={CHART_TICK.staffName} interval={0} angle={-20} textAnchor="end" height={58} />
                <YAxis tick={CHART_TICK.axis} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={CHART_LEGEND.workload} />
                <Bar dataKey="open"      name={meta.workload.openLabel}      fill={DASHBOARD_COLORS.orange}  radius={BAR_RADIUS} />
                <Bar dataKey="completed" name={meta.workload.completedLabel} fill={DASHBOARD_COLORS.emerald} radius={BAR_RADIUS} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Charts row 2: Phân loại + Quá hạn ── */}
      <div className={s.chartsRow}>

        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>{meta.distrib.title}</span>
              <span className={s.chartSub}>{RANGE_SUB[range]} {meta.distrib.sub}</span>
            </div>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : !charts?.taskTypeDistrib?.length ? (
            <div className={s.chartEmpty}>Chưa có dữ liệu</div>
          ) : (
            <div className={s.pieRow}>
              <div className={s.pieLeft}>
                <PieChart width={260} height={300}>
                  <defs>
                    {PIE_GRADIENTS.map(([c1, c2], i) => (
                      <linearGradient key={i} id={`dashPieGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%"   stopColor={c1} stopOpacity={1} />
                        <stop offset="100%" stopColor={c2} stopOpacity={0.85} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={charts.taskTypeDistrib}
                    dataKey="value" nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={118} innerRadius={62}
                    paddingAngle={3} labelLine={false}
                  >
                    {charts.taskTypeDistrib.map((_, i) => (
                      <Cell key={i} fill={`url(#dashPieGrad${i % PIE_GRADIENTS.length})`} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val, name) => [val, name]} />
                </PieChart>
              </div>
              <div className={s.pieLegend}>
                {charts.taskTypeDistrib.map((item, i) => {
                  const total = charts.taskTypeDistrib.reduce((acc, r) => acc + r.value, 0)
                  const pct   = total ? ((item.value / total) * 100).toFixed(0) : 0
                  return (
                    <div key={i} className={s.pieLegendItem}>
                      <span className={`${s.pieLegendDot} ${s[`pieTone${i % PIE_GRADIENTS.length}`]}`} />
                      <span className={s.pieLegendName}>{item.name}</span>
                      <span className={s.pieLegendCount}>{item.value}</span>
                      <span className={s.pieLegendPct}>{pct}%</span>
                    </div>
                  )
                })}
                <div className={s.pieLegendTotal}>
                  Tổng: <strong>{charts.taskTypeDistrib.reduce((acc, r) => acc + r.value, 0)}</strong>
                  {activeTaskType === 'cdr' ? ' hồ sơ' : activeTaskType === 'ia' ? ' phiếu' : ' CV'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Quá hạn — cần ưu tiên</span>
              {!loading && charts?.overdueList?.length > 0 && (
                <span className={s.chartSub}>{charts.overdueList.length} mục</span>
              )}
            </div>
            <button className={s.chartHeaderLink} onClick={() => navigate(meta.overdue.link)}>
              Xem tất cả <ArrowRight size={12} />
            </button>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : !charts?.overdueList?.length ? (
            <div className={s.chartEmpty}>
              <CheckCircle2 size={28} className={s.emptySuccessIcon} />
              Không có mục quá hạn 🎉
            </div>
          ) : (
            <div className={s.overdueList}>
              {charts.overdueList.map((t) => {
                const dest = meta.overdue.itemLink(t)
                return (
                  <OverdueCard
                    key={t.id}
                    task={t}
                    onClick={dest ? () => navigate(dest) : undefined}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Đến hạn hôm nay — full width ── */}
      {!loading && charts?.dueTodayList?.length > 0 && (
        <div className={s.dueTodayPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Đến hạn hôm nay</span>
              <span className={s.chartSub}>{charts.dueTodayList.length} mục</span>
            </div>
            <button className={s.chartHeaderLink} onClick={() => navigate(meta.dueToday.link)}>
              Xem tất cả <ArrowRight size={12} />
            </button>
          </div>
          <div className={s.dueTodayGrid}>
            {charts.dueTodayList.map((t) => (
              <DueTodayCard key={t.id} task={t} onClick={() => navigate(meta.dueToday.link)} />
            ))}
          </div>
        </div>
      )}

    </AppLayout>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, tone, urgent, loading, onClick }) {
  return (
    <div
      className={`${s.kpiCard} ${tone} ${urgent ? s.kpiCardUrgent : ''}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className={s.kpiCardInner}>
        <div className={s.kpiIcon}><Icon size={20} /></div>
        <div className={s.kpiText}>
          <p className={s.kpiLabel}>{label}</p>
          {loading ? <div className={s.kpiSkeleton} /> : <p className={s.kpiValue}>{value}</p>}
          <p className={s.kpiSub}>{sub}</p>
        </div>
      </div>
    </div>
  )
}

// ── OverdueCard ───────────────────────────────────────────────────────────────
function OverdueCard({ task, onClick }) {
  return (
    <div className={s.overdueCard} onClick={onClick} style={onClick ? { cursor: 'pointer' } : { cursor: 'default' }}>
      <div className={s.taskCardTop}>
        <div className={s.taskCardBadges}>
          {task.priority && (
            <span className={`${s.priorityBadge} ${PRIORITY_CLASS[task.priority] ?? s.priLow}`}>
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </span>
          )}
          {task.status && (
            <span className={`${s.statusBadge} ${STATUS_CLASS[task.status] ?? s.statusPending}`}>
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          )}
        </div>
        <span className={s.overdueDaysBadge}>+{task.daysOverdue}d quá hạn</span>
      </div>
      <p className={s.taskCardTitle}>{task.title}</p>
      <div className={s.taskCardMeta}>
        {task.companyName && (
          <span className={s.taskCardMetaItem}>
            <Building2 size={11} /><span>{task.companyName}</span>
          </span>
        )}
        {task.assignedToName && (
          <span className={s.taskCardMetaItem}>
            <User size={11} /><span>{task.assignedToName}</span>
          </span>
        )}
        <span className={s.taskCardMetaItem}>
          <CalendarIcon size={11} />
          <span>
            {task.createdAt ? `${fmtDateShort(task.createdAt)} → ` : ''}
            {fmtDateShort(task.dueDate)}
          </span>
        </span>
      </div>
    </div>
  )
}

// ── DueTodayCard ──────────────────────────────────────────────────────────────
function DueTodayCard({ task, onClick }) {
  return (
    <div className={s.dueTodayCard} onClick={onClick}>
      <div className={s.taskCardTop}>
        <div className={s.taskCardBadges}>
          {task.priority && (
            <span className={`${s.priorityBadge} ${PRIORITY_CLASS[task.priority] ?? s.priLow}`}>
              {PRIORITY_LABEL[task.priority] ?? task.priority}
            </span>
          )}
          {task.status && (
            <span className={`${s.statusBadge} ${STATUS_CLASS[task.status] ?? s.statusPending}`}>
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          )}
        </div>
        <span className={s.dueTodayBadge}>Hôm nay</span>
      </div>
      <p className={s.taskCardTitle}>{task.title}</p>
      <div className={s.taskCardMeta}>
        {task.companyName && (
          <span className={s.taskCardMetaItem}>
            <Building2 size={11} /><span>{task.companyName}</span>
          </span>
        )}
        {task.assignedToName && (
          <span className={s.taskCardMetaItem}>
            <User size={11} /><span>{task.assignedToName}</span>
          </span>
        )}
        <span className={s.taskCardMetaItem}>
          <CalendarIcon size={11} />
          <span>
            {task.createdAt ? `${fmtDateShort(task.createdAt)} → ` : ''}
            {fmtDateShort(task.dueDate)}
          </span>
        </span>
      </div>
    </div>
  )
}
