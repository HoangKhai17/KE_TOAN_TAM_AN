import { useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  Users, Building2, ShieldCheck, Clock3, Zap, CalendarDays,
  Download, Loader2, Search, RefreshCw, AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import {
  getStaffReport, getCompanyReport, getSlaReport,
  getAgingReport, getVelocityReport, getForecastReport, exportReport,
} from '../../api/reports'
import s from './Reports.module.css'

// ── Const ─────────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

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
}
const STATUS_LABEL = {
  pending: 'Chờ xử lý', in_progress: 'Đang làm', on_hold: 'Tạm dừng',
  pending_review: 'Chờ duyệt', needs_revision: 'Cần sửa',
}

// Default date range: 3 months back → today
function defaultFrom() {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}
function defaultMonth() { return new Date().getMonth() + 1 }
function defaultYear()  { return new Date().getFullYear() }

// ── Tabs config ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'staff',    label: 'Nhân sự',      icon: Users },
  { id: 'company',  label: 'Khách hàng',   icon: Building2 },
  { id: 'sla',      label: 'SLA Tuân thủ', icon: ShieldCheck },
  { id: 'aging',    label: 'Tồn đọng',     icon: Clock3 },
  { id: 'velocity', label: 'Hiệu suất',    icon: Zap },
  { id: 'forecast', label: 'Dự báo',       icon: CalendarDays },
]

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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Reports() {
  const user     = useAuthStore((s) => s.user)
  const toast    = useToastStore((s) => s.toast)
  const isAdmin  = user?.role === 'admin' || user?.role === 'manager'

  const [activeTab, setActiveTab] = useState('staff')
  const [loading,   setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)
  const [data,      setData]      = useState(null)
  const [error,     setError]     = useState(null)

  // Shared filter state
  const [from,    setFrom]    = useState(defaultFrom)
  const [to,      setTo]      = useState(defaultTo)
  const [groupBy, setGroupBy] = useState('staff')
  const [period,  setPeriod]  = useState('week')
  const [month,   setMonth]   = useState(defaultMonth)
  const [year,    setYear]    = useState(defaultYear)

  async function runReport() {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      let result
      if (activeTab === 'staff')    result = await getStaffReport({ from, to })
      if (activeTab === 'company')  result = await getCompanyReport({ from, to })
      if (activeTab === 'sla')      result = await getSlaReport({ from, to, groupBy })
      if (activeTab === 'aging')    result = await getAgingReport({})
      if (activeTab === 'velocity') result = await getVelocityReport({ from, to, period })
      if (activeTab === 'forecast') result = await getForecastReport({ month, year })
      setData(result)
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Không thể tải báo cáo')
      toast('Lỗi tải báo cáo', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportReport(activeTab, activeTab === 'forecast'
        ? { month, year }
        : activeTab === 'aging'
          ? {}
          : activeTab === 'sla'
            ? { from, to, groupBy }
            : activeTab === 'velocity'
              ? { from, to, period }
              : { from, to }
      )
      toast('Xuất Excel thành công', 'success')
    } catch {
      toast('Xuất Excel thất bại', 'error')
    } finally {
      setExporting(false)
    }
  }

  function switchTab(id) {
    setActiveTab(id)
    setData(null)
    setError(null)
  }

  return (
    <AppLayout title="Báo cáo">
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
        <FilterControls
          tab={activeTab}
          from={from} setFrom={setFrom}
          to={to}     setTo={setTo}
          groupBy={groupBy} setGroupBy={setGroupBy}
          period={period}   setPeriod={setPeriod}
          month={month}     setMonth={setMonth}
          year={year}       setYear={setYear}
        />

        <div className={s.filterActions}>
          <button className={s.btnRun} onClick={runReport} disabled={loading}>
            {loading
              ? <Loader2 size={14} className={s.spin} />
              : <Search size={14} />}
            Chạy báo cáo
          </button>

          {isAdmin && data?.length > 0 && (
            <button className={s.btnExport} onClick={handleExport} disabled={exporting}>
              {exporting
                ? <Loader2 size={14} className={s.spin} />
                : <Download size={14} />}
              Xuất Excel
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className={s.content}>
        {loading && (
          <div className={s.centered}>
            <Loader2 size={28} className={s.spin} />
            <p>Đang tải...</p>
          </div>
        )}

        {!loading && error && (
          <div className={s.errorBox}>
            <AlertTriangle size={20} />
            {error}
          </div>
        )}

        {!loading && !error && data === null && (
          <div className={s.emptyState}>
            <RefreshCw size={32} style={{ color: '#94a3b8' }} />
            <p>Chọn bộ lọc và nhấn <strong>Chạy báo cáo</strong> để xem kết quả</p>
          </div>
        )}

        {!loading && !error && data !== null && data.length === 0 && (
          <div className={s.emptyState}>
            <p style={{ color: '#94a3b8' }}>Không có dữ liệu cho khoảng thời gian này</p>
          </div>
        )}

        {!loading && !error && data?.length > 0 && (
          <ReportBody tab={activeTab} data={data} />
        )}
      </div>
    </AppLayout>
  )
}

// ── FilterControls ────────────────────────────────────────────────────────────
function FilterControls({ tab, from, setFrom, to, setTo, groupBy, setGroupBy, period, setPeriod, month, setMonth, year, setYear }) {
  const currentYear = new Date().getFullYear()

  if (tab === 'aging') {
    return <span className={s.filterNote}>Hiển thị tất cả công việc đang mở, sắp xếp theo số ngày tồn đọng</span>
  }

  if (tab === 'forecast') {
    return (
      <>
        <label className={s.filterLabel}>
          Tháng
          <select className={s.filterSelect} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>Tháng {m}</option>
            ))}
          </select>
        </label>
        <label className={s.filterLabel}>
          Năm
          <select className={s.filterSelect} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </>
    )
  }

  return (
    <>
      <label className={s.filterLabel}>
        Từ ngày
        <input type="date" className={s.filterInput} value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className={s.filterLabel}>
        Đến ngày
        <input type="date" className={s.filterInput} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>

      {tab === 'sla' && (
        <label className={s.filterLabel}>
          Nhóm theo
          <select className={s.filterSelect} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
            <option value="staff">Nhân viên</option>
            <option value="company">Khách hàng</option>
            <option value="task_type">Loại công việc</option>
          </select>
        </label>
      )}

      {tab === 'velocity' && (
        <label className={s.filterLabel}>
          Kỳ
          <select className={s.filterSelect} value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="week">Tuần</option>
            <option value="month">Tháng</option>
          </select>
        </label>
      )}
    </>
  )
}

// ── ReportBody ────────────────────────────────────────────────────────────────
function ReportBody({ tab, data }) {
  if (tab === 'staff')    return <StaffReport    data={data} />
  if (tab === 'company')  return <CompanyReport  data={data} />
  if (tab === 'sla')      return <SlaReport      data={data} />
  if (tab === 'aging')    return <AgingReport    data={data} />
  if (tab === 'velocity') return <VelocityReport data={data} />
  if (tab === 'forecast') return <ForecastReport data={data} />
  return null
}

// ── 1. Staff Report ───────────────────────────────────────────────────────────
function StaffReport({ data }) {
  return (
    <div className={s.reportSection}>
      <div className={s.chartBox}>
        <h3 className={s.chartTitle}>Tỷ lệ hoàn thành theo nhân viên (%)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} unit="%" />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="completionRate" name="Tỷ lệ HT (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Nhân viên</th>
              <th>Chức danh</th>
              <th className={s.num}>Tổng CV</th>
              <th className={s.num}>Hoàn thành</th>
              <th className={s.num}>Đúng hạn</th>
              <th className={s.num}>Quá hạn</th>
              <th className={s.num}>Giờ TB</th>
              <th className={s.num}>Tỷ lệ HT</th>
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
                <td className={s.num}>
                  <span className={r.overdue > 0 ? s.danger : ''}>{r.overdue}</span>
                </td>
                <td className={s.num}>{r.avgHours}h</td>
                <td className={s.num}>
                  <RateBadge rate={r.completionRate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 2. Company Report ─────────────────────────────────────────────────────────
function CompanyReport({ data }) {
  return (
    <div className={s.reportSection}>
      <div className={s.chartBox}>
        <h3 className={s.chartTitle}>Tổng quan công việc theo khách hàng</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.slice(0, 15)} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="completed" name="Hoàn thành" fill="#10b981" radius={[3, 3, 0, 0]} stackId="a" />
            <Bar dataKey="open"      name="Đang mở"    fill="#f59e0b" radius={[3, 3, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Công ty</th>
              <th>MST</th>
              <th className={s.num}>Tổng CV</th>
              <th className={s.num}>Hoàn thành</th>
              <th className={s.num}>Đang mở</th>
              <th className={s.num}>Quá hạn</th>
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
                <td className={s.num}>
                  <span className={r.overdue > 0 ? s.danger : ''}>{r.overdue}</span>
                </td>
                <td className={s.num}><RateBadge rate={r.completionRate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 3. SLA Report ─────────────────────────────────────────────────────────────
function SlaReport({ data }) {
  return (
    <div className={s.reportSection}>
      <div className={s.chartBox}>
        <h3 className={s.chartTitle}>Phân bổ đúng hạn / trễ</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.slice(0, 12)} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={40} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="onTime"   name="Đúng hạn"     fill="#10b981" radius={[0, 0, 0, 0]} stackId="a" />
            <Bar dataKey="late1_3"  name="Trễ 1-3 ngày" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
            <Bar dataKey="lateMore" name="Trễ >3 ngày"  fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Nhóm</th>
              <th className={s.num}>Tổng CV</th>
              <th className={s.num}>Đúng hạn</th>
              <th className={s.num}>Trễ 1-3 ngày</th>
              <th className={s.num}>Trễ &gt;3 ngày</th>
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
  )
}

// ── 4. Aging Report ───────────────────────────────────────────────────────────
function AgingReport({ data }) {
  return (
    <div className={s.reportSection}>
      <div className={s.agingSummary}>
        <AgingStat label="Tổng tồn đọng" value={data.length} color="#3b82f6" />
        <AgingStat label="Quá hạn"       value={data.filter((r) => r.daysOverdue > 0).length} color="#ef4444" />
        <AgingStat label="Tồn >30 ngày"  value={data.filter((r) => r.daysOpen > 30).length}   color="#f59e0b" />
        <AgingStat label="Tồn >60 ngày"  value={data.filter((r) => r.daysOpen > 60).length}   color="#8b5cf6" />
      </div>

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Công việc</th>
              <th>Công ty</th>
              <th>Nhân viên</th>
              <th>Loại CV</th>
              <th>Trạng thái</th>
              <th>Ưu tiên</th>
              <th className={s.num}>Ngày mở</th>
              <th className={s.num}>Ngày QH</th>
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
                <td className={s.num}>
                  <span className={r.daysOpen > 30 ? s.warn : ''}>{r.daysOpen}d</span>
                </td>
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
  )
}

function AgingStat({ label, value, color }) {
  return (
    <div className={s.agingStatCard} style={{ borderColor: `${color}40` }}>
      <p className={s.agingStatValue} style={{ color }}>{value}</p>
      <p className={s.agingStatLabel}>{label}</p>
    </div>
  )
}

// ── 5. Velocity Report ────────────────────────────────────────────────────────
function VelocityReport({ data }) {
  const fmtPeriod = (p) => {
    if (!p) return ''
    try { return format(new Date(p), 'dd/MM/yy') } catch { return String(p).slice(0, 10) }
  }

  const chartData = data.map((r) => ({ ...r, period: fmtPeriod(r.period) }))

  return (
    <div className={s.reportSection}>
      <div className={s.chartsRow2}>
        <div className={s.chartBox}>
          <h3 className={s.chartTitle}>Số CV hoàn thành theo kỳ</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone" dataKey="completed" name="Hoàn thành"
                stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: '#3b82f6' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={s.chartBox}>
          <h3 className={s.chartTitle}>Số ngày xử lý trung bình</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avgDaysToComplete" name="Ngày TB" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
  )
}

// ── 6. Forecast Report ────────────────────────────────────────────────────────
function ForecastReport({ data }) {
  const fmtDate = (d) => {
    if (!d) return '—'
    try { return format(new Date(d), 'dd/MM/yyyy') } catch { return String(d) }
  }

  // Group by week for summary
  const byGroup = data.reduce((acc, r) => {
    const g = r.groupName || 'Khác'
    acc[g] = (acc[g] || 0) + 1
    return acc
  }, {})

  const groupChart = Object.entries(byGroup).map(([name, value], i) => ({ name, value }))

  return (
    <div className={s.reportSection}>
      <div className={s.forecastMeta}>
        <div className={s.forecastStat}>
          <span className={s.forecastStatValue}>{data.length}</span>
          <span className={s.forecastStatLabel}>công việc dự kiến</span>
        </div>
        <div className={s.forecastStat}>
          <span className={s.forecastStatValue}>{new Set(data.map((r) => r.companyName)).size}</span>
          <span className={s.forecastStatLabel}>khách hàng</span>
        </div>
        <div className={s.forecastStat}>
          <span className={s.forecastStatValue}>{new Set(data.map((r) => r.taskTypeName)).size}</span>
          <span className={s.forecastStatLabel}>loại công việc</span>
        </div>
      </div>

      {groupChart.length > 0 && (
        <div className={s.chartBox} style={{ marginBottom: 16 }}>
          <h3 className={s.chartTitle}>Phân bổ theo nhóm</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={groupChart} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Số CV" radius={[4, 4, 0, 0]}>
                {groupChart.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Công ty</th>
              <th>Loại công việc</th>
              <th>Nhóm</th>
              <th>Nhân viên</th>
              <th className={s.num}>Ngày kích hoạt</th>
              <th className={s.num}>Hết hạn dự kiến</th>
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
  )
}

// ── RateBadge ─────────────────────────────────────────────────────────────────
function RateBadge({ rate }) {
  const pct = Number(rate) || 0
  const color = pct >= 90 ? '#059669' : pct >= 70 ? '#d97706' : '#dc2626'
  const bg    = pct >= 90 ? '#ecfdf5' : pct >= 70 ? '#fffbeb' : '#fef2f2'
  return (
    <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
      {pct}%
    </span>
  )
}
