import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Users, Building2, ShieldCheck, Clock3, Zap, CalendarDays,
  LayoutDashboard, Download, Loader2, AlertTriangle,
  Maximize2, Minimize2, TrendingUp, TrendingDown, Minus,
  RefreshCw, GitCompare, FileText, CheckCircle2, AlertCircle,
  Timer, Award,
} from 'lucide-react'
import { format } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import {
  getOverviewReport,
  getStaffReport, getCompanyReport, getSlaReport,
  getAgingReport, getVelocityReport, getForecastReport, exportReport,
} from '../../api/reports'
import s from './Reports.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#2563eb', '#059669', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#84cc16']

const TABS = [
  { id: 'overview',  label: 'Tổng quan',    icon: LayoutDashboard },
  { id: 'staff',     label: 'Nhân sự',       icon: Users },
  { id: 'company',   label: 'Khách hàng',    icon: Building2 },
  { id: 'sla',       label: 'SLA Tuân thủ',  icon: ShieldCheck },
  { id: 'aging',     label: 'Tồn đọng',      icon: Clock3 },
  { id: 'velocity',  label: 'Hiệu suất',     icon: Zap },
  { id: 'forecast',  label: 'Dự báo',        icon: CalendarDays },
]

const PRIORITY_CSS = {
  urgent: { background: '#fef2f2', color: '#b91c1c' },
  high:   { background: '#fff7ed', color: '#c2410c' },
  medium: { background: '#eff6ff', color: '#1d4ed8' },
  low:    { background: '#f8fafc', color: '#64748b' },
}
const PRIORITY_LABEL = { urgent: 'Khẩn', high: 'Cao', medium: 'TB', low: 'Thấp' }

const STATUS_CSS = {
  pending:        { background: '#f1f5f9', color: '#475569' },
  in_progress:    { background: '#eff6ff', color: '#1d4ed8' },
  on_hold:        { background: '#fff7ed', color: '#c2410c' },
  pending_review: { background: '#faf5ff', color: '#7e22ce' },
  needs_revision: { background: '#fff1f2', color: '#be123c' },
  completed:      { background: '#ecfdf5', color: '#059669' },
}
const STATUS_LABEL = {
  pending: 'Chờ xử lý', in_progress: 'Đang thực hiện', on_hold: 'Tạm hoãn',
  pending_review: 'Chờ duyệt', needs_revision: 'Xem lại', completed: 'Đã hoàn thành',
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function formatDateValue(date) {
  return format(date, 'yyyy-MM-dd')
}

function parseDateValue(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function computeRange(preset, customFrom, customTo) {
  const today = new Date()
  if (preset === '7d') {
    const f = new Date(today); f.setDate(f.getDate() - 6)
    return { from: formatDateValue(f), to: formatDateValue(today) }
  }
  if (preset === 'month') {
    return { from: formatDateValue(new Date(today.getFullYear(), today.getMonth(), 1)), to: formatDateValue(today) }
  }
  if (preset === 'quarter') {
    const qStart = Math.floor(today.getMonth() / 3) * 3
    return { from: formatDateValue(new Date(today.getFullYear(), qStart, 1)), to: formatDateValue(today) }
  }
  return { from: customFrom, to: customTo }
}

function computePrevRange(from, to) {
  const start = parseDateValue(from), end = parseDateValue(to)
  const days  = Math.round((end - start) / 86400000)
  const pe    = new Date(start); pe.setDate(pe.getDate() - 1)
  const ps    = new Date(pe);    ps.setDate(ps.getDate() - days)
  return { from: formatDateValue(ps), to: formatDateValue(pe) }
}

function formatRangeLabel(from, to) {
  const start = parseDateValue(from)
  const end = parseDateValue(to)
  if (!start || !end) return ''
  return `${format(start, 'dd/MM/yyyy')} - ${format(end, 'dd/MM/yyyy')}`
}

function defaultCustomFrom() {
  const d = new Date(); d.setMonth(d.getMonth() - 1)
  return formatDateValue(d)
}

function defaultForecastPeriod() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
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
export default function Reports() {
  const user    = useAuthStore((st) => st.user)
  const toast   = useToastStore((st) => st.toast)
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin' || user?.role === 'manager'

  const [activeTab,     setActiveTab]     = useState('overview')
  const [preset,        setPreset]        = useState('month')
  const [customFrom,    setCustomFrom]    = useState(defaultCustomFrom)
  const [customTo,      setCustomTo]      = useState(() => formatDateValue(new Date()))
  const [compare,       setCompare]       = useState(false)
  const [groupBy,       setGroupBy]       = useState('staff')
  const [periodUnit,    setPeriodUnit]    = useState('week')
  const [forecastMonth, setForecastMonth] = useState(() => defaultForecastPeriod().month)
  const [forecastYear,  setForecastYear]  = useState(() => defaultForecastPeriod().year)
  const [exporting,     setExporting]     = useState(false)
  const [fullscreen,    setFullscreen]    = useState(false)

  const isForecast = activeTab === 'forecast'
  const isOverview = activeTab === 'overview'

  // ── Báo cáo — React Query (cache theo tab + tham số; báo cáo đổi chậm nên staleTime dài) ──
  const reportQuery = useQuery({
    queryKey: ['reports', activeTab, preset, customFrom, customTo, compare, groupBy, periodUnit, forecastMonth, forecastYear],
    queryFn: async () => {
      const { from, to } = computeRange(preset, customFrom, customTo)
      const prev = compare && activeTab === 'overview' ? computePrevRange(from, to) : null
      if (activeTab === 'overview') return getOverviewReport({ from, to, ...(prev ? { prevFrom: prev.from, prevTo: prev.to } : {}) })
      if (activeTab === 'staff')    return getStaffReport({ from, to })
      if (activeTab === 'company')  return getCompanyReport({ from, to })
      if (activeTab === 'sla')      return getSlaReport({ from, to, groupBy })
      if (activeTab === 'aging')    return getAgingReport({})
      if (activeTab === 'velocity') return getVelocityReport({ from, to, period: periodUnit })
      if (activeTab === 'forecast') return getForecastReport({ month: forecastMonth, year: forecastYear })
      return null
    },
    staleTime: 60_000,
  })
  const data    = reportQuery.data ?? null
  const loading = reportQuery.isFetching
  const error   = reportQuery.isError ? (reportQuery.error?.response?.data?.message ?? 'Không thể tải báo cáo') : null

  // Toast 1 lần mỗi khi tải báo cáo thất bại
  useEffect(() => {
    if (reportQuery.isError) toast('Lỗi tải báo cáo', 'error')
  }, [reportQuery.errorUpdatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport() {
    const { from, to } = computeRange(preset, customFrom, customTo)
    setExporting(true)
    try {
      const params = activeTab === 'forecast'
        ? { month: forecastMonth, year: forecastYear }
        : activeTab === 'aging'
          ? {}
          : activeTab === 'sla'
            ? { from, to, groupBy }
            : activeTab === 'velocity'
              ? { from, to, period: periodUnit }
              : { from, to }
      await exportReport(activeTab, params)
      toast('Xuất Excel thành công', 'success')
    } catch {
      toast('Xuất Excel thất bại', 'error')
    } finally {
      setExporting(false)
    }
  }

  function handleRefresh() {
    queryClient.invalidateQueries({ queryKey: ['reports'] })
  }

  function switchTab(id) {
    setActiveTab(id)
  }

  const currentYear = new Date().getFullYear()
  const currentRange = computeRange(preset, customFrom, customTo)

  return (
    <AppLayout title="Báo cáo">
      <div className={`${s.page} ${fullscreen ? s.fullscreen : ''}`}>

        {/* ── Tab nav ── */}
        <div className={s.tabBar}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`${s.tab} ${activeTab === id ? s.tabActive : ''}`}
              onClick={() => switchTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div className={s.filterBar}>
          <div className={s.filterLeft}>

            {/* Preset buttons — hidden for forecast */}
            {!isForecast && (
              <div className={s.presets}>
                {[['7d','7 ngày'], ['month','Tháng này'], ['quarter','Quý này'], ['custom','Tùy chọn']].map(([id, label]) => (
                  <button
                    key={id}
                    className={`${s.preset} ${preset === id ? s.presetActive : ''}`}
                    onClick={() => setPreset(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom date range inputs */}
            {!isForecast && preset === 'custom' && (
              <div className={s.customDates}>
                <input
                  type="date" className={s.dateInput}
                  value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                />
                <span className={s.dateSep}>→</span>
                <input
                  type="date" className={s.dateInput}
                  value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            )}

            {!isForecast && (
              <span className={s.rangeBadge}>
                {formatRangeLabel(currentRange.from, currentRange.to)}
              </span>
            )}

            {/* Forecast month / year */}
            {isForecast && (
              <div className={s.forecastFilters}>
                <select className={s.filterSelect} value={forecastMonth} onChange={(e) => setForecastMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
                <select className={s.filterSelect} value={forecastYear} onChange={(e) => setForecastYear(Number(e.target.value))}>
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}

            {/* SLA groupBy */}
            {activeTab === 'sla' && (
              <select className={s.filterSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                <option value="staff">Nhân viên</option>
                <option value="company">Khách hàng</option>
                <option value="task_type">Loại CV</option>
              </select>
            )}

            {/* Velocity period */}
            {activeTab === 'velocity' && (
              <select className={s.filterSelect} value={periodUnit} onChange={(e) => setPeriodUnit(e.target.value)}>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            )}

            {/* Compare — overview only */}
            {isOverview && (
              <button
                className={`${s.compareBtn} ${compare ? s.compareBtnActive : ''}`}
                onClick={() => setCompare((c) => !c)}
              >
                <GitCompare size={13} />
                So sánh kỳ trước
              </button>
            )}
          </div>

          <div className={s.filterRight}>
            <button className={s.iconBtn} onClick={handleRefresh} title="Làm mới" disabled={loading}>
              <RefreshCw size={14} className={loading ? s.spin : ''} />
            </button>
            <button
              className={`${s.iconBtn} ${fullscreen ? s.iconBtnActive : ''}`}
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
            >
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            {isAdmin && data && activeTab !== 'overview' && (
              <button className={s.btnExport} onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 size={13} className={s.spin} /> : <Download size={13} />}
                Xuất Excel
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className={s.body}>
          {loading && (
            <div className={s.centered}>
              <Loader2 size={28} className={s.spin} />
              <p className={s.loadingText}>Đang tải dữ liệu...</p>
            </div>
          )}

          {!loading && error && (
            <div className={s.errorBox}>
              <AlertTriangle size={18} />
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <TabContent tab={activeTab} data={data} compare={compare} />
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ── TabContent dispatcher ─────────────────────────────────────────────────────
function TabContent({ tab, data, compare }) {
  if (tab === 'overview')  return <OverviewTab  data={data} compare={compare} />
  if (tab === 'staff')     return <StaffTab     data={data} />
  if (tab === 'company')   return <CompanyTab   data={data} />
  if (tab === 'sla')       return <SlaTab       data={data} />
  if (tab === 'aging')     return <AgingTab     data={data} />
  if (tab === 'velocity')  return <VelocityTab  data={data} />
  if (tab === 'forecast')  return <ForecastTab  data={data} />
  return null
}

// ── OverviewTab ───────────────────────────────────────────────────────────────
function OverviewTab({ data, compare }) {
  const { stats, trend, prevTrend, byTaskType, byStatus, byAssignee } = data
  const statValue = (key) => stats?.[key]?.value ?? 0
  const statChange = (key) => stats?.[key]?.change ?? null

  const trendChart = trend.map((d, i) => ({
    date: (() => { try { return format(new Date(d.date), 'dd/MM') } catch { return String(d.date).slice(5) } })(),
    'Hiện tại': d.completed,
    ...(compare && prevTrend?.[i] ? { 'Kỳ trước': prevTrend[i].completed } : {}),
  }))

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={FileText}     label="Tổng tasks"      value={statValue('total')}          change={statChange('total')}          color="blue"   />
        <StatCard icon={CheckCircle2} label="Đã hoàn thành"   value={statValue('completed')}      change={statChange('completed')}      color="green"  />
        <StatCard icon={Timer}        label="Chờ xử lý"       value={statValue('pending')}        change={statChange('pending')}        color="slate"  />
        <StatCard icon={Clock3}       label="Đang thực hiện"  value={statValue('inProgress')}     change={statChange('inProgress')}     color="blue"   />
        <StatCard icon={AlertTriangle} label="Tạm hoãn"       value={statValue('onHold')}         change={statChange('onHold')}         color="amber"  />
        <StatCard icon={ShieldCheck}  label="Chờ duyệt"       value={statValue('pendingReview')}  change={statChange('pendingReview')}  color="purple" />
        <StatCard icon={AlertCircle}  label="Xem lại"         value={statValue('needsRevision')}  change={statChange('needsRevision')}  color="red"    />
      </div>

      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>Xu hướng theo ngày</h3>
          {compare && <span className={s.compareTag}>Đang so sánh kỳ trước</span>}
        </div>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendChart} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
              <Line type="monotone" dataKey="Hiện tại" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
              {compare && <Line type="monotone" dataKey="Kỳ trước" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />}
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart />}
      </div>

      <div className={s.breakdownRow}>
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Theo loại công việc</h3>
          {byTaskType.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byTaskType} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} width={96} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="total"     name="Tổng" fill="#2563eb" radius={[0, 3, 3, 0]} />
                <Bar dataKey="completed" name="HT"   fill="#059669" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Theo trạng thái</h3>
          {byStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byStatus.map((r) => ({ ...r, label: STATUS_LABEL[r.label] ?? r.label }))}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" name="Số lượng" radius={[4, 4, 0, 0]}>
                  {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </div>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Theo nhân viên</h3>
        {byAssignee.length > 0 ? (
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th className={s.num}>Tổng</th>
                  <th className={s.num}>Hoàn thành</th>
                  <th style={{ minWidth: 140 }}>Tiến độ</th>
                  <th className={s.num}>Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {byAssignee.map((r, i) => (
                  <tr key={i}>
                    <td className={s.bold}>{r.label}</td>
                    <td className={s.num}>{r.total}</td>
                    <td className={s.num}>{r.completed}</td>
                    <td>
                      <div className={s.progressBar}>
                        <div className={s.progressFill} style={{ width: `${r.rate}%` }} />
                      </div>
                    </td>
                    <td className={s.num}><RateBadge rate={r.rate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyChart />}
      </div>
    </div>
  )
}

// ── StaffTab ──────────────────────────────────────────────────────────────────
function StaffTab({ data }) {
  if (!data?.length) return <EmptyState />
  const avgRate      = data.reduce((s, r) => s + r.completionRate, 0) / data.length
  const totalDone    = data.reduce((s, r) => s + r.completed, 0)
  const totalOverdue = data.reduce((s, r) => s + r.overdue, 0)

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={Users}        label="Nhân viên"      value={data.length}              color="blue"  />
        <StatCard icon={Award}        label="Tỷ lệ HT TB"    value={`${avgRate.toFixed(1)}%`} color="green" />
        <StatCard icon={CheckCircle2} label="Tổng hoàn thành" value={totalDone}               color="green" />
        <StatCard icon={AlertCircle}  label="Tổng quá hạn"   value={totalOverdue}             color="red"   />
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Tỷ lệ hoàn thành theo nhân viên</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} unit="%" />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="completionRate" name="Tỷ lệ HT (%)" radius={[4, 4, 0, 0]}>
              {data.map((r, i) => (
                <Cell key={i} fill={r.completionRate >= 90 ? '#059669' : r.completionRate >= 70 ? '#f59e0b' : '#dc2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Chi tiết nhân viên</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nhân viên</th><th>Chức danh</th>
                <th className={s.num}>Tổng CV</th><th className={s.num}>Hoàn thành</th>
                <th className={s.num}>Đúng hạn</th><th className={s.num}>Quá hạn</th>
                <th className={s.num}>Giờ TB</th><th className={s.num}>Tỷ lệ HT</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className={s.bold}>{r.name}</td>
                  <td className={s.muted}>{r.jobTitle || '—'}</td>
                  <td className={s.num}>{r.total}</td>
                  <td className={s.num}>{r.completed}</td>
                  <td className={s.num}>{r.onTime}</td>
                  <td className={s.num}><span className={r.overdue > 0 ? s.danger : ''}>{r.overdue}</span></td>
                  <td className={s.num}>{r.avgHours}h</td>
                  <td className={s.num}><RateBadge rate={r.completionRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── CompanyTab ────────────────────────────────────────────────────────────────
function CompanyTab({ data }) {
  if (!data?.length) return <EmptyState />
  const totalTasks   = data.reduce((s, r) => s + r.total, 0)
  const totalOverdue = data.reduce((s, r) => s + r.overdue, 0)
  const avgRate      = data.reduce((s, r) => s + r.completionRate, 0) / data.length

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={Building2}    label="Khách hàng"     value={data.length}              color="blue"  />
        <StatCard icon={FileText}     label="Tổng công việc" value={totalTasks}               color="blue"  />
        <StatCard icon={TrendingUp}   label="Tỷ lệ HT TB"    value={`${avgRate.toFixed(1)}%`} color="green" />
        <StatCard icon={AlertCircle}  label="Tổng quá hạn"   value={totalOverdue}             color="red"   />
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Tổng quan công việc theo khách hàng (top 15)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.slice(0, 15)} margin={{ top: 8, right: 12, left: -10, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-18} textAnchor="end" height={52} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="completed" name="Hoàn thành" fill="#059669" stackId="a" />
            <Bar dataKey="open"      name="Đang mở"    fill="#f59e0b" radius={[3, 3, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Chi tiết khách hàng</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Công ty</th><th>MST</th>
                <th className={s.num}>Tổng CV</th><th className={s.num}>Hoàn thành</th>
                <th className={s.num}>Đang mở</th><th className={s.num}>Quá hạn</th>
                <th className={s.num}>Tỷ lệ HT</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td className={s.bold}>{r.name}</td>
                  <td className={s.muted}>{r.taxCode || '—'}</td>
                  <td className={s.num}>{r.total}</td>
                  <td className={s.num}>{r.completed}</td>
                  <td className={s.num}>{r.open}</td>
                  <td className={s.num}><span className={r.overdue > 0 ? s.danger : ''}>{r.overdue}</span></td>
                  <td className={s.num}><RateBadge rate={r.completionRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── SlaTab ────────────────────────────────────────────────────────────────────
function SlaTab({ data }) {
  if (!data?.length) return <EmptyState />
  const total    = data.reduce((s, r) => s + r.total, 0)
  const onTime   = data.reduce((s, r) => s + r.onTime, 0)
  const lateMore = data.reduce((s, r) => s + r.lateMore, 0)
  const avgSla   = total > 0 ? Math.round(onTime * 100 / total) : 0

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={ShieldCheck}  label="SLA Rate TB"    value={`${avgSla}%`}            color={avgSla >= 90 ? 'green' : avgSla >= 70 ? 'amber' : 'red'} />
        <StatCard icon={CheckCircle2} label="Đúng hạn"        value={onTime}                  color="green" />
        <StatCard icon={AlertCircle}  label="Trễ >3 ngày"    value={lateMore}                color="red"   />
        <StatCard icon={FileText}     label="Tổng đã xử lý"  value={total}                   color="blue"  />
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Phân bổ đúng hạn / trễ</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.slice(0, 12)} margin={{ top: 8, right: 12, left: -10, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} interval={0} angle={-18} textAnchor="end" height={52} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="onTime"   name="Đúng hạn"     fill="#059669" stackId="a" />
            <Bar dataKey="late1_3"  name="Trễ 1-3 ngày" fill="#f59e0b" stackId="a" />
            <Bar dataKey="lateMore" name="Trễ >3 ngày"  fill="#dc2626" radius={[3, 3, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Chi tiết SLA</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nhóm</th>
                <th className={s.num}>Tổng CV</th><th className={s.num}>Đúng hạn</th>
                <th className={s.num}>Trễ 1-3 ngày</th><th className={s.num}>Trễ &gt;3 ngày</th>
                <th className={s.num}>SLA Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className={s.bold}>{r.label}</td>
                  <td className={s.num}>{r.total}</td>
                  <td className={s.num}>{r.onTime}</td>
                  <td className={s.num}>{r.late1_3}</td>
                  <td className={s.num}>{r.lateMore}</td>
                  <td className={s.num}><RateBadge rate={r.slaRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── AgingTab ──────────────────────────────────────────────────────────────────
function AgingTab({ data }) {
  if (!data?.length) return <EmptyState />
  const overdue = data.filter((r) => r.daysOverdue > 0).length
  const gt30    = data.filter((r) => r.daysOpen > 30).length
  const gt60    = data.filter((r) => r.daysOpen > 60).length

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={FileText}    label="Tổng tồn đọng" value={data.length}  color="blue"  />
        <StatCard icon={AlertCircle} label="Quá hạn"        value={overdue}      color="red"   />
        <StatCard icon={Clock3}      label="Tồn >30 ngày"   value={gt30}         color="amber" />
        <StatCard icon={AlertTriangle} label="Tồn >60 ngày" value={gt60}         color="red"   />
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Danh sách công việc tồn đọng</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Công việc</th><th>Công ty</th><th>Nhân viên</th><th>Loại CV</th>
                <th>Trạng thái</th><th>Ưu tiên</th>
                <th className={s.num}>Ngày mở</th><th className={s.num}>Ngày QH</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className={r.daysOverdue > 0 ? s.rowOverdue : ''}>
                  <td className={s.bold} style={{ maxWidth: 220 }}>
                    <span className={s.ellipsis}>{r.title}</span>
                  </td>
                  <td className={s.muted}>{r.companyName || '—'}</td>
                  <td>{r.assignedToName || '—'}</td>
                  <td className={s.muted}>{r.taskTypeName || '—'}</td>
                  <td>
                    <span className={s.statusBadge} style={STATUS_CSS[r.status]}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>
                    <span className={s.priorityBadge} style={PRIORITY_CSS[r.priority]}>
                      {PRIORITY_LABEL[r.priority] ?? r.priority}
                    </span>
                  </td>
                  <td className={s.num}><span className={r.daysOpen > 30 ? s.warn : ''}>{r.daysOpen}d</span></td>
                  <td className={s.num}>
                    <span className={r.daysOverdue > 0 ? s.danger : s.muted}>
                      {r.daysOverdue > 0 ? `+${r.daysOverdue}d` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── VelocityTab ───────────────────────────────────────────────────────────────
function VelocityTab({ data }) {
  if (!data?.length) return <EmptyState />
  const totalDone    = data.reduce((s, r) => s + r.completed, 0)
  const avgPerPeriod = (totalDone / data.length).toFixed(1)
  const maxDone      = Math.max(...data.map((r) => r.completed))
  const avgDays      = (data.reduce((s, r) => s + r.avgDaysToComplete, 0) / data.length).toFixed(1)

  const fmtPeriod = (p) => {
    if (!p) return ''
    try { return format(new Date(p), 'dd/MM/yy') } catch { return String(p).slice(0, 10) }
  }
  const chartData = data.map((r) => ({ ...r, period: fmtPeriod(r.period) }))

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={Zap}          label="Tổng hoàn thành" value={totalDone}        color="blue"  />
        <StatCard icon={TrendingUp}   label="TB mỗi kỳ"        value={avgPerPeriod}     color="green" />
        <StatCard icon={Award}        label="Kỳ cao nhất"       value={maxDone}          color="green" />
        <StatCard icon={Timer}        label="TB ngày xử lý"     value={`${avgDays}d`}    color="amber" />
      </div>

      <div className={s.chartsRow}>
        <div className={s.section}>
          <h3 className={s.sectionTitle}>Số CV hoàn thành theo kỳ</h3>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="completed" name="Hoàn thành" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={s.section}>
          <h3 className={s.sectionTitle}>Số ngày xử lý TB</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="avgDaysToComplete" name="Ngày TB" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Chi tiết theo kỳ</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Kỳ</th>
                <th className={s.num}>Hoàn thành</th>
                <th className={s.num}>TB ngày xử lý</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className={s.bold}>{fmtPeriod(r.period)}</td>
                  <td className={s.num}>{r.completed}</td>
                  <td className={s.num}>{r.avgDaysToComplete}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── ForecastTab ───────────────────────────────────────────────────────────────
function ForecastTab({ data }) {
  if (!data?.length) return <EmptyState />
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return format(new Date(d), 'dd/MM/yyyy') } catch { return String(d) }
  }

  const byGroup = data.reduce((acc, r) => {
    const g = r.groupName || 'Khác'
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {})
  const groupChart    = Object.entries(byGroup).map(([name, value]) => ({ name, value }))
  const companyCount  = new Set(data.map((r) => r.companyName)).size
  const typeCount     = new Set(data.map((r) => r.taskTypeName)).size

  return (
    <div className={s.tabContent}>
      <div className={s.statsGrid}>
        <StatCard icon={CalendarDays} label="Dự kiến phát sinh"  value={data.length}                                          color="blue"  />
        <StatCard icon={Building2}    label="Khách hàng"          value={companyCount}                                         color="blue"  />
        <StatCard icon={FileText}     label="Loại công việc"      value={typeCount}                                            color="blue"  />
        <StatCard icon={TrendingUp}   label="TB / Khách hàng"     value={(data.length / Math.max(companyCount, 1)).toFixed(1)} color="green" />
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Phân bổ theo nhóm</h3>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={groupChart} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" name="Số CV" radius={[4, 4, 0, 0]}>
              {groupChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.section}>
        <h3 className={s.sectionTitle}>Chi tiết dự báo</h3>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Công ty</th><th>Loại công việc</th><th>Nhóm</th><th>Nhân viên</th>
                <th className={s.num}>Ngày kích hoạt</th><th className={s.num}>Hết hạn dự kiến</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, i) => (
                <tr key={i}>
                  <td className={s.bold}>{r.companyName}</td>
                  <td>{r.taskTypeName}</td>
                  <td className={s.muted}>{r.groupName || '—'}</td>
                  <td>{r.assignedToName || '—'}</td>
                  <td className={s.num}>{fmtDate(r.triggerDate)}</td>
                  <td className={s.num}>{fmtDate(r.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, change, color = 'blue' }) {
  const colorMap = {
    blue:  { bg: '#eff6ff', text: '#1e3a8a', accent: '#2563eb', border: '#dbeafe' },
    green: { bg: '#ecfdf5', text: '#065f46', accent: '#059669', border: '#a7f3d0' },
    amber: { bg: '#fffbeb', text: '#78350f', accent: '#d97706', border: '#fde68a' },
    red:   { bg: '#fef2f2', text: '#7f1d1d', accent: '#dc2626', border: '#fecaca' },
    purple:{ bg: '#faf5ff', text: '#581c87', accent: '#7e22ce', border: '#d8b4fe' },
    slate: { bg: '#f8fafc', text: '#334155', accent: '#64748b', border: '#cbd5e1' },
  }
  const c = colorMap[color] || colorMap.blue
  const up   = change > 0
  const down = change < 0

  return (
    <div className={s.statCard} style={{ borderColor: c.border }}>
      <div className={s.statIconWrap} style={{ background: c.bg }}>
        <Icon size={18} style={{ color: c.accent }} />
      </div>
      <div className={s.statBody}>
        <p className={s.statLabel}>{label}</p>
        <p className={s.statValue} style={{ color: c.text }}>{value}</p>
        {change !== null && change !== undefined && (
          <p className={s.statChange} style={{ color: up ? '#059669' : down ? '#dc2626' : '#64748b' }}>
            {up ? <TrendingUp size={11} /> : down ? <TrendingDown size={11} /> : <Minus size={11} />}
            {up ? '+' : ''}{change}% so kỳ trước
          </p>
        )}
      </div>
    </div>
  )
}

// ── RateBadge ─────────────────────────────────────────────────────────────────
function RateBadge({ rate }) {
  const pct   = Number(rate) || 0
  const color = pct >= 90 ? '#059669' : pct >= 70 ? '#d97706' : '#dc2626'
  const bg    = pct >= 90 ? '#ecfdf5' : pct >= 70 ? '#fffbeb' : '#fef2f2'
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
      {pct}%
    </span>
  )
}

// ── Misc ──────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className={s.emptyState}>
      <p>Không có dữ liệu cho bộ lọc này</p>
    </div>
  )
}

function EmptyChart() {
  return <p className={s.emptyChart}>Không có dữ liệu</p>
}
