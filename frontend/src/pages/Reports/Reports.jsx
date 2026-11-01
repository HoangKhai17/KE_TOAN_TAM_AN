import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Building2, CalendarDays, Download, Loader2, AlertTriangle,
  Maximize2, Minimize2, TrendingUp, TrendingDown, Minus, RefreshCw, FileText,
} from 'lucide-react'
import { format } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { getForecastReport, getForecastYears, exportReport } from '../../api/reports'
import s from './Reports.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#2563eb', '#059669', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#84cc16']

// Mặc định = tháng SAU, nhưng GIỮ trong năm hiện tại (không nhảy sang năm chưa có dữ liệu).
function defaultForecastPeriod() {
  const d = new Date()
  const month = Math.min(d.getMonth() + 2, 12)   // getMonth() 0-indexed → +2 = tháng sau (1-indexed), chặn ở 12
  return { month, year: d.getFullYear() }
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

  const [forecastMonth, setForecastMonth] = useState(() => defaultForecastPeriod().month)
  const [forecastYear,  setForecastYear]  = useState(() => defaultForecastPeriod().year)
  const [exporting,     setExporting]     = useState(false)
  const [fullscreen,    setFullscreen]    = useState(false)

  // Năm có dữ liệu thực của hệ thống (không hardcode năm tương lai)
  const yearsQuery = useQuery({
    queryKey: ['reports', 'forecast', 'years'],
    queryFn: getForecastYears,
    staleTime: 5 * 60_000,
  })
  const currentYear = new Date().getFullYear()
  const yearOptions = useMemo(() => {
    const set = new Set(yearsQuery.data ?? [])
    set.add(currentYear)       // luôn có năm hiện tại
    set.add(forecastYear)      // đảm bảo năm đang chọn luôn nằm trong danh sách
    return [...set].sort((a, b) => b - a)
  }, [yearsQuery.data, currentYear, forecastYear])

  const reportQuery = useQuery({
    queryKey: ['reports', 'forecast', forecastMonth, forecastYear],
    queryFn: () => getForecastReport({ month: forecastMonth, year: forecastYear }),
    staleTime: 60_000,
  })
  const data    = reportQuery.data ?? null
  const loading = reportQuery.isFetching
  const error   = reportQuery.isError ? (reportQuery.error?.response?.data?.message ?? 'Không thể tải báo cáo') : null

  async function handleExport() {
    setExporting(true)
    try {
      await exportReport('forecast', { month: forecastMonth, year: forecastYear })
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

  return (
    <AppLayout title="Báo cáo quy trình">
      <div className={`${s.page} ${fullscreen ? s.fullscreen : ''}`}>

        {/* ── Tab nav (chỉ còn Dự báo) ── */}
        <div className={s.tabBar}>
          <button className={`${s.tab} ${s.tabActive}`}>
            <CalendarDays size={14} />
            Dự báo
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div className={s.filterBar}>
          <div className={s.filterLeft}>
            <div className={s.forecastFilters}>
              <select className={s.filterSelect} value={forecastMonth} onChange={(e) => setForecastMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>Tháng {m}</option>
                ))}
              </select>
              <select className={s.filterSelect} value={forecastYear} onChange={(e) => setForecastYear(Number(e.target.value))}>
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
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
            {isAdmin && data && (
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

          {!loading && !error && data && <ForecastTab data={data} />}
        </div>
      </div>
    </AppLayout>
  )
}

// ── Forecast tab ──────────────────────────────────────────────────────────────
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

// ── Misc ──────────────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className={s.emptyState}>
      <p>Không có dữ liệu cho bộ lọc này</p>
    </div>
  )
}
