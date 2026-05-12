import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
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
  ['#6366f1', '#a5b4fc'],
  ['#10b981', '#6ee7b7'],
  ['#f59e0b', '#fcd34d'],
  ['#ef4444', '#fca5a5'],
  ['#8b5cf6', '#c4b5fd'],
  ['#06b6d4', '#67e8f9'],
  ['#f97316', '#fdba74'],
  ['#84cc16', '#bef264'],
]

const PRIORITY_CSS = {
  urgent: { background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' },
  high:   { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' },
  medium: { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  low:    { background: '#f8fafc', color: '#64748b', borderColor: '#cbd5e1' },
}
const PRIORITY_LABEL = { urgent: 'Khẩn', high: 'Cao', medium: 'TB', low: 'Thấp' }

const STATUS_CSS = {
  pending:        { background: '#f1f5f9', color: '#475569' },
  in_progress:    { background: '#eff6ff', color: '#1d4ed8' },
  on_hold:        { background: '#fff7ed', color: '#c2410c' },
  pending_review: { background: '#faf5ff', color: '#7e22ce' },
  needs_revision: { background: '#fff1f2', color: '#be123c' },
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
        <p key={p.name} style={{ color: p.color, margin: '2px 0', fontSize: 12 }}>
          {p.name}: <strong>{p.value}</strong>
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
      color: '#1d4ed8',
      bg:    '#eff6ff',
    },
    {
      label: 'Công việc đang mở',
      value: loading ? null : (summary?.openTasks ?? '—'),
      sub:   'cần xử lý',
      icon:  ClipboardList,
      color: '#0f9960',
      bg:    '#ecfdf5',
    },
    {
      label: 'Quá hạn',
      value: loading ? null : (summary?.overdueTasks ?? '—'),
      sub:   'cần ưu tiên xử lý ngay',
      icon:  AlertTriangle,
      color: '#b91c1c',
      bg:    '#fef2f2',
      urgent: (summary?.overdueTasks ?? 0) > 0,
    },
    {
      label: 'Hoàn thành',
      value: loading ? null : (summary?.completedThisMonth ?? '—'),
      sub:   RANGE_SUB[range],
      icon:  CheckCircle2,
      color: '#d97706',
      bg:    '#fffbeb',
    },
    {
      label: 'Tuân thủ SLA',
      value: loading ? null : (summary ? `${summary.slaComplianceRate}%` : '—'),
      sub:   'hoàn thành đúng / trước hạn',
      icon:  TrendingUp,
      color: '#7c3aed',
      bg:    '#f5f3ff',
    },
  ]

  if (user?.role === 'staff') {
    kpiCards.push({
      label: 'Của tôi — đến hạn hôm nay',
      value: loading ? null : (summary?.myTasksToday ?? '—'),
      sub:   'việc cần hoàn thành hôm nay',
      icon:  Clock,
      color: '#0369a1',
      bg:    '#f0f9ff',
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
              <LineChart data={charts?.weeklyTrend ?? []} margin={{ top: 12, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tickFormatter={fmtWeek} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Line
                  type="monotone" dataKey="completed" name="Đã hoàn thành"
                  stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
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
                <Bar dataKey="open"      name="Cần thực hiện" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Đã hoàn thành"  fill="#10b981" radius={[4, 4, 0, 0]} />
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
                <PieChart width={200} height={280}>
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
                    outerRadius={90}
                    innerRadius={48}
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
function KpiCard({ label, value, sub, icon: Icon, color, bg, urgent, loading }) {
  return (
    <div
      className={`${s.kpiCard} ${urgent ? s.kpiCardUrgent : ''}`}
      style={{ background: bg, borderColor: `${color}33` }}
    >
      <div className={s.kpiCardInner}>
        <div className={s.kpiIcon} style={{ background: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className={s.kpiText}>
          <p className={s.kpiLabel} style={{ color }}>{label}</p>
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
