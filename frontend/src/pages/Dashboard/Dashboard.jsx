import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Building2, ClipboardList, AlertTriangle, CheckCircle2,
  TrendingUp, Clock, ArrowRight, Loader2,
  Maximize2, Minimize2, User, Calendar as CalendarIcon,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { getDashboardSummary, getDashboardCharts } from '../../api/dashboard'
import s from './Dashboard.module.css'

// ── Gradient palette for PieChart ─────────────────────────────────────────────
const PIE_GRADIENTS = [
  ['#4f46e5', '#818cf8'],  // indigo vivid
  ['#059669', '#34d399'],  // emerald vivid
  ['#d97706', '#fbbf24'],  // amber vivid
  ['#dc2626', '#f87171'],  // red vivid
  ['#7c3aed', '#a78bfa'],  // violet vivid
  ['#0891b2', '#22d3ee'],  // cyan vivid
  ['#ea580c', '#fb923c'],  // orange vivid
  ['#65a30d', '#a3e635'],  // lime vivid
]

const PRIORITY_CSS = {
  urgent: { background: '#dc2626', color: '#fff' },
  high:   { background: '#ea580c', color: '#fff' },
  medium: { background: '#2563eb', color: '#fff' },
  low:    { background: '#64748b', color: '#fff' },
}
const PRIORITY_LABEL = { urgent: 'Khẩn', high: 'Cao', medium: 'TB', low: 'Thấp' }

const STATUS_CSS = {
  pending:        { background: '#e2e8f0', color: '#334155' },
  in_progress:    { background: '#bfdbfe', color: '#1d4ed8' },
  on_hold:        { background: '#fed7aa', color: '#c2410c' },
  pending_review: { background: '#e9d5ff', color: '#6d28d9' },
  needs_revision: { background: '#fecdd3', color: '#be123c' },
}
const STATUS_LABEL = {
  pending: 'Chờ xử lý', in_progress: 'Đang làm', on_hold: 'Tạm dừng',
  pending_review: 'Chờ duyệt', needs_revision: 'Cần sửa',
}

const RANGE_OPTIONS = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d',   label: '7 ngày'  },
  { key: '28d',  label: '28 ngày' },
]
const RANGE_SUB = { today: 'Hôm nay', '7d': '7 ngày gần nhất', '28d': '4 tuần gần nhất' }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRangeDates(range) {
  const to   = new Date()
  const from = new Date()
  if (range === 'today') {
    // from = to = today (no adjustment)
  } else if (range === '7d') {
    from.setDate(from.getDate() - 6)
  } else {
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

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(String(d).slice(0, 10)), 'dd/MM/yyyy') }
  catch { return String(d).slice(0, 10) }
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
        <p key={p.name} style={{ color: p.color === '#2563eb' ? '#93c5fd' : p.color, margin: '3px 0', fontSize: 12.5 }}>
          {p.name}: <strong style={{ color: '#f8fafc' }}>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const user     = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const [summary, setSummary]       = useState(null)
  const [charts,  setCharts]        = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error,   setError]         = useState(null)
  const [range,   setRange]         = useState('28d')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Fullscreen listener
  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

  // Fetch when range changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const params = getRangeDates(range)
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
  }, [range])

  const greetHour = new Date().getHours()
  const greetWord = greetHour < 12 ? 'Chào buổi sáng' : greetHour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'

  const kpiCards = [
    {
      label: 'Khách hàng hoạt động',
      value: loading ? null : (summary?.activeCompanies ?? '—'),
      sub:   'công ty đang hợp tác',
      icon:  Building2,
      color: '#2563eb',
      bg:    'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
      accent: '#2563eb',
    },
    {
      label: 'Công việc đang mở',
      value: loading ? null : (summary?.openTasks ?? '—'),
      sub:   'cần xử lý',
      icon:  ClipboardList,
      color: '#059669',
      bg:    'linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)',
      accent: '#059669',
    },
    {
      label: 'Quá hạn',
      value: loading ? null : (summary?.overdueTasks ?? '—'),
      sub:   'cần ưu tiên xử lý ngay',
      icon:  AlertTriangle,
      color: '#dc2626',
      bg:    'linear-gradient(135deg, #fee2e2 0%, #fff5f5 100%)',
      accent: '#dc2626',
      urgent: (summary?.overdueTasks ?? 0) > 0,
    },
    {
      label: 'Hoàn thành',
      value: loading ? null : (summary?.completedThisMonth ?? '—'),
      sub:   RANGE_SUB[range],
      icon:  CheckCircle2,
      color: '#b45309',
      bg:    'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)',
      accent: '#d97706',
    },
    {
      label: 'Tuân thủ SLA',
      value: loading ? null : (summary ? `${summary.slaComplianceRate}%` : '—'),
      sub:   'hoàn thành đúng / trước hạn',
      icon:  TrendingUp,
      color: '#6d28d9',
      bg:    'linear-gradient(135deg, #ede9fe 0%, #f5f3ff 100%)',
      accent: '#7c3aed',
    },
  ]

  if (user?.role === 'staff') {
    kpiCards.push({
      label: 'Của tôi — đến hạn hôm nay',
      value: loading ? null : (summary?.myTasksToday ?? '—'),
      sub:   'việc cần hoàn thành hôm nay',
      icon:  Clock,
      color: '#0369a1',
      bg:    'linear-gradient(135deg, #bae6fd 0%, #e0f2fe 100%)',
      accent: '#0284c7',
    })
  }

  return (
    <AppLayout title="Dashboard">

      {/* ── Top bar: greeting + range buttons + fullscreen ── */}
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

      {/* ── KPI Cards ── */}
      <div className={s.kpiGrid}>
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} loading={loading} />
        ))}
      </div>

      {/* ── Charts row 1: Xu hướng + Nhân viên ── */}
      <div className={s.chartsRow}>
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Xu hướng hoàn thành</span>
              <span className={s.chartSub}>{RANGE_SUB[range]}</span>
            </div>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={charts?.weeklyTrend ?? []} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGradBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#2563eb" stopOpacity={0.55} />
                    <stop offset="90%" stopColor="#2563eb" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area
                  type="monotone" dataKey="completed" name="Đã hoàn thành"
                  stroke="#3b82f6" strokeWidth={2.5}
                  fill="url(#areaGradBlue)"
                  stroke="#2563eb"
                  dot={{ r: 5, fill: '#2563eb', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Tải công việc nhân viên</span>
              <span className={s.chartSub}>{RANGE_SUB[range]}</span>
            </div>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={charts?.staffWorkload ?? []} margin={{ top: 12, right: 16, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b', fontWeight: 500 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={58}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                <Bar dataKey="open"      name="Cần thực hiện" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Đã hoàn thành"  fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Charts row 2: Phân loại + Quá hạn ── */}
      <div className={s.chartsRow}>

        {/* Phân loại công việc: Pie (trái) + Legend list (phải) */}
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Phân loại công việc</span>
              <span className={s.chartSub}>{RANGE_SUB[range]} theo nhóm</span>
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
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    outerRadius={118}
                    innerRadius={62}
                    paddingAngle={3}
                    labelLine={false}
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
                  const total = charts.taskTypeDistrib.reduce((s, r) => s + r.value, 0)
                  const pct   = total ? ((item.value / total) * 100).toFixed(0) : 0
                  return (
                    <div key={i} className={s.pieLegendItem}>
                      <span
                        className={s.pieLegendDot}
                        style={{ background: PIE_GRADIENTS[i % PIE_GRADIENTS.length][0] }}
                      />
                      <span className={s.pieLegendName}>{item.name}</span>
                      <span className={s.pieLegendCount}>{item.value}</span>
                      <span className={s.pieLegendPct}>{pct}%</span>
                    </div>
                  )
                })}
                <div className={s.pieLegendTotal}>
                  Tổng: <strong>{charts.taskTypeDistrib.reduce((s, r) => s + r.value, 0)}</strong> CV
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quá hạn */}
        <div className={s.chartPanel}>
          <div className={s.chartHeader}>
            <div>
              <span className={s.chartTitle}>Quá hạn — cần ưu tiên</span>
              {!loading && charts?.overdueList?.length > 0 && (
                <span className={s.chartSub}>{charts.overdueList.length} công việc</span>
              )}
            </div>
            <button className={s.chartHeaderLink} onClick={() => navigate('/tasks?filter=overdue')}>
              Xem tất cả <ArrowRight size={12} />
            </button>
          </div>
          {loading ? (
            <div className={s.chartLoading}><Loader2 size={20} className={s.spin} /></div>
          ) : !charts?.overdueList?.length ? (
            <div className={s.chartEmpty}>
              <CheckCircle2 size={28} style={{ color: '#10b981', marginBottom: 8 }} />
              Không có công việc quá hạn 🎉
            </div>
          ) : (
            <div className={s.overdueList}>
              {charts.overdueList.map((t) => (
                <OverdueCard key={t.id} task={t} onClick={() => navigate(`/tasks/${t.id}`)} />
              ))}
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
              <span className={s.chartSub}>{charts.dueTodayList.length} công việc</span>
            </div>
            <button className={s.chartHeaderLink} onClick={() => navigate('/tasks?filter=due_today')}>
              Xem tất cả <ArrowRight size={12} />
            </button>
          </div>
          <div className={s.dueTodayGrid}>
            {charts.dueTodayList.map((t) => (
              <DueTodayCard key={t.id} task={t} onClick={() => navigate(`/tasks/${t.id}`)} />
            ))}
          </div>
        </div>
      )}

    </AppLayout>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg, accent, urgent, loading }) {
  return (
    <div
      className={`${s.kpiCard} ${urgent ? s.kpiCardUrgent : ''}`}
      style={{ background: bg, borderColor: `${accent ?? color}30`, borderLeftColor: accent ?? color }}
    >
      <div className={s.kpiCardInner}>
        <div className={s.kpiIcon} style={{ background: `${accent ?? color}22` }}>
          <Icon size={20} style={{ color: accent ?? color }} />
        </div>
        <div className={s.kpiText}>
          <p className={s.kpiLabel} style={{ color: accent ?? color }}>{label}</p>
          {loading ? (
            <div className={s.kpiSkeleton} />
          ) : (
            <p className={s.kpiValue} style={{ color }}>{value}</p>
          )}
          <p className={s.kpiSub}>{sub}</p>
        </div>
      </div>
    </div>
  )
}

// ── OverdueCard ───────────────────────────────────────────────────────────────
function OverdueCard({ task, onClick }) {
  return (
    <div className={s.overdueCard} onClick={onClick}>
      <div className={s.taskCardTop}>
        <div className={s.taskCardBadges}>
          <span className={s.priorityBadge} style={PRIORITY_CSS[task.priority]}>
            {PRIORITY_LABEL[task.priority] ?? task.priority}
          </span>
          <span className={s.statusBadge} style={STATUS_CSS[task.status]}>
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
        </div>
        <span className={s.overdueDaysBadge}>+{task.daysOverdue}d quá hạn</span>
      </div>
      <p className={s.taskCardTitle}>{task.title}</p>
      <div className={s.taskCardMeta}>
        <span className={s.taskCardMetaItem}>
          <Building2 size={11} />
          <span>{task.companyName ?? '—'}</span>
        </span>
        <span className={s.taskCardMetaItem}>
          <User size={11} />
          <span>{task.assignedToName ?? 'Chưa giao'}</span>
        </span>
        <span className={s.taskCardMetaItem}>
          <CalendarIcon size={11} />
          <span>{fmtDateShort(task.createdAt)} → {fmtDateShort(task.dueDate)}</span>
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
          <span className={s.priorityBadge} style={PRIORITY_CSS[task.priority]}>
            {PRIORITY_LABEL[task.priority] ?? task.priority}
          </span>
          <span className={s.statusBadge} style={STATUS_CSS[task.status]}>
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
        </div>
        <span className={s.dueTodayBadge}>Hôm nay</span>
      </div>
      <p className={s.taskCardTitle}>{task.title}</p>
      <div className={s.taskCardMeta}>
        <span className={s.taskCardMetaItem}>
          <Building2 size={11} />
          <span>{task.companyName ?? '—'}</span>
        </span>
        <span className={s.taskCardMetaItem}>
          <User size={11} />
          <span>{task.assignedToName ?? 'Chưa giao'}</span>
        </span>
        <span className={s.taskCardMetaItem}>
          <CalendarIcon size={11} />
          <span>{fmtDateShort(task.createdAt)} → {fmtDateShort(task.dueDate)}</span>
        </span>
      </div>
    </div>
  )
}
