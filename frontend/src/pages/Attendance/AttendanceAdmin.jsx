import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, CalendarDays, ClipboardList, Clock, CalendarCheck,
  ChevronLeft, ChevronRight, Loader2, Check, X, RefreshCw,
  Download, BarChart3, Settings, Terminal,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import * as usersApi from '../../api/users'
import * as payrollApi from '../../api/payroll'
import s from './Attendance.module.css'
import sa from './AttendanceAdmin.module.css'

// ── Module-level date helpers ─────────────────────────────────────────────────

const _NOW = new Date()
const _CY  = String(_NOW.getFullYear())
const _CM  = String(_NOW.getMonth() + 1)

function ymToDates(year, month) {
  if (!year) return { from: undefined, to: undefined }
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` }
  const m       = parseInt(month, 10)
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate()
  const mm      = String(m).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_TABS = [
  { id: 'calendar',     label: 'Lịch chấm công',   icon: CalendarCheck },
  { id: 'today',        label: 'Hôm nay',           icon: Users },
  { id: 'leave',        label: 'Duyệt nghỉ phép',   icon: ClipboardList },
  { id: 'overtime',     label: 'Duyệt tăng ca',     icon: Clock },
  { id: 'report',       label: 'Báo cáo',           icon: BarChart3 },
  { id: 'att-settings', label: 'Cài đặt',           icon: Settings },
  ...(import.meta.env.DEV ? [{ id: 'devtools', label: 'Dev Tools', icon: Terminal, dev: true }] : []),
]

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const LEAVE_STATUS_CFG = {
  pending:   { label: 'Chờ duyệt', bg: '#fefce8', color: '#a16207' },
  approved:  { label: 'Đã duyệt',  bg: '#f0fdf4', color: '#15803d' },
  rejected:  { label: 'Từ chối',   bg: '#fef2f2', color: '#dc2626' },
  cancelled: { label: 'Đã huỷ',    bg: '#f1f5f9', color: '#64748b' },
}

const OT_STATUS_CFG = {
  pending:  { label: 'Chờ duyệt', bg: '#fefce8', color: '#a16207' },
  approved: { label: 'Đã duyệt',  bg: '#f0fdf4', color: '#15803d' },
  rejected: { label: 'Từ chối',   bg: '#fef2f2', color: '#dc2626' },
}

const STATUS_CFG = {
  present:        { label: 'Có mặt',      bg: 'var(--color-success-bg-soft)', color: 'var(--color-success-dark)', border: 'var(--color-success-bg)' },
  late:           { label: 'Đi muộn',     bg: 'var(--color-accent-bg-soft)', color: 'var(--color-warning-amber)', border: 'var(--color-accent-bg)' },
  early_leave:    { label: 'Về sớm',      bg: 'var(--color-warning-bg)', color: 'var(--color-warning-dark)', border: 'var(--color-warning-bg-strong)' },
  late_and_early: { label: 'Muộn & Sớm', bg: 'var(--color-purple-bg-soft)', color: 'var(--color-purple)', border: 'var(--color-status-review-bg)' },
  absent:         { label: 'Vắng mặt',   bg: 'var(--color-danger-bg)', color: 'var(--color-danger)', border: 'var(--color-danger-bg)' },
  on_leave:       { label: 'Nghỉ phép',  bg: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: 'var(--color-status-progress-bg)' },
  business_trip:  { label: 'Công tác',   bg: 'var(--color-info-surface)', color: 'var(--color-cyan)', border: 'var(--color-info-surface)' },
  wfh:            { label: 'WFH',        bg: 'var(--color-purple-bg-soft)', color: 'var(--color-purple-bright)', border: 'var(--color-purple-bg)' },
  holiday:        { label: 'Nghỉ lễ',    bg: 'var(--color-danger-bg-soft)', color: 'var(--color-status-revision-text)', border: 'var(--color-status-revision-bg)' },
  unscheduled:    { label: 'Ngoài lịch', bg: 'var(--color-bg-soft)', color: 'var(--color-muted-soft)', border: 'var(--color-border)' },
}

const LEAVE_TYPE = {
  annual:        'Nghỉ phép năm',
  sick:          'Nghỉ ốm',
  compensatory:  'Nghỉ bù',
  unpaid:        'Nghỉ không lương',
  business_trip: 'Công tác',
  wfh:           'Làm từ xa',
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function monthName(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
}

function fmtDateVI(iso) {
  if (!iso) return '—'
  const str = String(iso).slice(0, 10)
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function fmtTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function fmtCurrency(n) {
  if (n == null || Number(n) === 0) return '—'
  return Number(n).toLocaleString('vi-VN') + ' ₫'
}

function buildCalendar(year, month, recordMap) {
  const first       = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (first.getDay() + 6) % 7
  const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7
  const now         = new Date()
  const todayStr    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ type: 'empty', key: `e-${i}` })
    } else {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      const jsDay   = new Date(dateStr + 'T00:00:00').getDay()
      cells.push({
        type: 'day', key: dateStr, dateStr, dayNum,
        record:    recordMap[dateStr] ?? null,
        isToday:   dateStr === todayStr,
        isFuture:  dateStr > todayStr,
        isWeekend: jsDay === 0 || jsDay === 6,
      })
    }
  }
  return cells
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AttendanceAdmin() {
  const now         = new Date()
  const currentUser = useAuthStore((st) => st.user)
  const [activeTab, setActiveTab] = useState('calendar')
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)
  const [staffList, setStaffList] = useState([])

  useEffect(() => {
    usersApi.listUsers({ status: 'active', limit: 200 }).then(({ users }) => setStaffList(users)).catch(() => {})
  }, [])

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const showMonthNav = ['calendar', 'monthly', 'report'].includes(activeTab)

  return (
    <AppLayout>
      <div className={s.page}>

        <div className={s.pageHeader}>
          <div>
            <h2 className={s.pageTitle}>Quản lý chấm công</h2>
            <p className={s.pageSubtitle}>Tổng quan, duyệt đơn và quản lý lịch ca</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className={s.tabBar}>
          {ADMIN_TABS.map(({ id, label, icon: Icon, dev }) => (
            <button
              key={id}
              className={`${s.tab} ${activeTab === id ? s.tabActive : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} /> {label}
              {dev && (
                <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 700, color: '#fff', background: '#f97316', borderRadius: 4, padding: '1px 5px', lineHeight: '14px' }}>
                  DEV
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        {showMonthNav && (
          <div className={s.filterBar}>
            <div className={s.monthNav}>
              <button className={s.iconBtn} onClick={prevMonth}><ChevronLeft size={14} /></button>
              <span className={s.monthLabel}>{monthName(year, month)}</span>
              <button className={s.iconBtn} onClick={nextMonth}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <AdminCalendarTab
            year={year} month={month}
            staffList={staffList}
            adminUserId={currentUser?.id}
          />
        )}
        {activeTab === 'today'        && <TodayTab staffList={staffList} />}
        {activeTab === 'leave'        && <AdminLeaveTab staffList={staffList} />}
        {activeTab === 'overtime'     && <AdminOvertimeTab staffList={staffList} />}
        {activeTab === 'report'       && <ReportTab year={year} month={month} />}
        {activeTab === 'att-settings' && <AttendanceSettingsTab />}
        {activeTab === 'devtools'     && <AdminDevToolsTab staffList={staffList} />}

      </div>
    </AppLayout>
  )
}

// ── TodayTab ──────────────────────────────────────────────────────────────────

function TodayTab({ staffList }) {
  const addToast = useToastStore((st) => st.toast)
  const now      = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listAttendanceRecords({ month: now.getMonth() + 1, year: now.getFullYear(), limit: 500 })
      .then((res) => {
        if (!cancelled) {
          const todayRecords = (res.records ?? []).filter((r) => String(r.workDate).slice(0, 10) === todayStr)
          setRecords(todayRecords)
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu hôm nay', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  // Map records by userId
  const recordMap = useMemo(() => {
    const m = {}
    records.forEach((r) => { m[r.userId] = r })
    return m
  }, [records])

  const checkedIn  = records.filter((r) => r.checkInTime).length
  const checkedOut = records.filter((r) => r.checkOutTime).length

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>
          Hôm nay — {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h3>
        <button className={s.btnSecondary} onClick={load} style={{ height: 32 }}>
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--color-surface-muted)', flexWrap: 'wrap' }}>
        <div className={sa.todayStat} style={{ background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)' }}>
          <span className={sa.todayStatNum} style={{ color: 'var(--color-success-dark)' }}>{checkedIn}</span>
          <span className={sa.todayStatLbl}>Đã vào</span>
        </div>
        <div className={sa.todayStat} style={{ background: 'var(--color-primary-bg)', border: '1.5px solid var(--color-status-progress-bg)' }}>
          <span className={sa.todayStatNum} style={{ color: 'var(--color-primary)' }}>{checkedOut}</span>
          <span className={sa.todayStatLbl}>Đã ra</span>
        </div>
        <div className={sa.todayStat} style={{ background: 'var(--color-danger-bg)', border: '1.5px solid var(--color-danger-bg)' }}>
          <span className={sa.todayStatNum} style={{ color: 'var(--color-danger)' }}>{staffList.length - checkedIn}</span>
          <span className={sa.todayStatLbl}>Chưa vào</span>
        </div>
      </div>

      {loading ? (
        <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chức danh</th>
                <th>Trạng thái</th>
                <th>Giờ vào</th>
                <th>Giờ ra</th>
                <th>Giờ thực tế</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map((user) => {
                const rec = recordMap[user.id]
                const cfg = rec ? (STATUS_CFG[rec.status] ?? STATUS_CFG.unscheduled) : null
                return (
                  <tr key={user.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{user.name}</td>
                    <td style={{ color: 'var(--color-muted)' }}>{user.jobTitle ?? '—'}</td>
                    <td>
                      {cfg ? (
                        <span style={{
                          display: 'inline-flex', padding: '2px 9px', borderRadius: 99,
                          fontSize: 11, fontWeight: 700, background: cfg.bg, color: cfg.color,
                        }}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', padding: '2px 9px', borderRadius: 99,
                          fontSize: 11, fontWeight: 700, background: 'var(--color-danger-bg)', color: 'var(--color-danger)',
                        }}>
                          Chưa vào
                        </span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{rec?.checkInTime ? fmtTime(rec.checkInTime) : '—'}</td>
                    <td style={{ color: 'var(--color-muted)' }}>{rec?.checkOutTime ? fmtTime(rec.checkOutTime) : '—'}</td>
                    <td style={{ color: 'var(--color-muted)' }}>
                      {rec?.actualHours != null ? `${Number(rec.actualHours).toFixed(1)}h` : '—'}
                    </td>
                  </tr>
                )
              })}
              {staffList.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '32px 0' }}>Không có nhân viên</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── AdminCalendarTab ──────────────────────────────────────────────────────────

function AdminCalendarTab({ year, month, staffList, adminUserId }) {
  const addToast    = useToastStore((st) => st.toast)
  const [selectedId, setSelectedId] = useState(adminUserId ?? '')
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)

  const load = useCallback(() => {
    if (!selectedId) return () => {}
    let cancelled = false
    setLoading(true)
    attendanceApi.listAttendanceRecords({ userId: selectedId, month, year, limit: 31 })
      .then((res) => { if (!cancelled) setRecords(res.records ?? []) })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu chấm công', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId, month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  const recordMap = useMemo(() => {
    const m = {}
    records.forEach((r) => { m[String(r.workDate).slice(0, 10)] = r })
    return m
  }, [records])

  const cells = useMemo(() => buildCalendar(year, month, recordMap), [year, month, recordMap])

  return (
    <>
      {/* Employee selector */}
      <div className={s.filterBar}>
        <select
          className={s.filterSelect}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {staffList.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}{u.id === adminUserId ? ' (Bạn)' : ''}
            </option>
          ))}
        </select>
        {selectedId === adminUserId && (
          <span style={{
            fontSize: 'var(--fs-sm)', color: '#15803d', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f0fdf4', border: '1.5px solid #bbf7d0',
            borderRadius: 7, padding: '3px 10px',
          }}>
            ✓ Admin — tự động ghi nhận đủ công
          </span>
        )}
      </div>

      <div className={s.section}>
        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : (
          <>
            <div className={s.calendarGrid}>
              {DAY_NAMES.map((d) => (
                <div key={d} className={`${s.calendarCell} ${s.calendarHeaderCell}`}>{d}</div>
              ))}
              {cells.map((cell) => {
                if (cell.type === 'empty') {
                  return <div key={cell.key} className={`${s.calendarCell} ${s.calendarEmpty}`} />
                }
                const { dateStr, dayNum, record, isToday, isFuture, isWeekend } = cell
                const cfg = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
                return (
                  <div
                    key={dateStr}
                    className={[
                      s.calendarCell, s.calendarDay,
                      isToday   ? s.calendarDayToday   : '',
                      isFuture  ? s.calendarDayFuture  : '',
                      isWeekend ? s.calendarDayWeekend : '',
                      record    ? s.calendarDayHasRecord : '',
                    ].filter(Boolean).join(' ')}
                    style={cfg ? { background: cfg.bg, borderColor: cfg.border } : {}}
                    onClick={() => record && setSelectedDay({ dateStr, record })}
                    title={cfg?.label}
                  >
                    <span className={`${s.calendarDayNum} ${isToday ? s.calendarDayNumToday : ''}`}>
                      {dayNum}
                    </span>
                    {cfg && (
                      <span className={s.calendarDayLabel} style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                    )}
                    {record?.checkInTime && (
                      <span className={s.calendarDayTime}>{fmtTime(record.checkInTime)}</span>
                    )}
                  </div>
                )
              })}
            </div>
            {records.length === 0 && (
              <div className={s.centered}>
                <CalendarDays size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
                Chưa có dữ liệu chấm công tháng này
              </div>
            )}
          </>
        )}
      </div>

      {selectedDay && (
        <AdminDayModal
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  )
}

function AdminDayModal({ dateStr, record, onClose }) {
  const cfg = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
  const [y, m, d] = dateStr.split('-')
  return (
    <Modal title={`Chi tiết ngày ${d}/${m}/${y}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 280 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
          borderRadius: 99, background: cfg?.bg, color: cfg?.color, fontSize: 13,
          fontWeight: 700, alignSelf: 'flex-start', border: `1.5px solid ${cfg?.border}`,
        }}>
          {cfg?.label ?? record?.status}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
          {[
            ['GIỜ VÀO',    fmtTime(record?.checkInTime)  ?? '—'],
            ['GIỜ RA',     fmtTime(record?.checkOutTime) ?? '—'],
            record?.actualHours != null && ['GIỜ THỰC TẾ', `${Number(record.actualHours).toFixed(1)}h`],
            record?.lateMinutes > 0 && ['ĐI MUỘN', `${record.lateMinutes} phút`],
          ].filter(Boolean).map(([label, val]) => (
            <div key={label}>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 700, color: '#1e293b' }}>{val}</div>
            </div>
          ))}
        </div>
        {record?.notes && (
          <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
            {record.notes}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={onClose}
            style={{ height: 34, padding: '0 16px', border: '1.5px solid #e2e8f0', borderRadius: 7, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── MonthlyTab ────────────────────────────────────────────────────────────────

// ── AdminLeaveTab ─────────────────────────────────────────────────────────────

function AdminLeaveTab({ staffList }) {
  const addToast = useToastStore((st) => st.toast)
  const [requests,       setRequests]       = useState([])
  const [page,           setPage]           = useState(1)
  const [pagination,     setPagination]     = useState({ total: 0, totalPages: 1 })
  const [loading,        setLoading]        = useState(true)
  const [reviewTarget,   setReviewTarget]   = useState(null)
  const [availableYears, setAvailableYears] = useState([_CY])
  const [filterYear,     setFilterYear]     = useState(_CY)
  const [filterMonth,    setFilterMonth]    = useState(_CM)
  const [statusFilter,   setStatusFilter]   = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')

  // Derive available years from actual data in the system
  useEffect(() => {
    attendanceApi.listLeaveRequests({ limit: 1000 }).then((res) => {
      const reqs = res.requests ?? []
      const yearSet = new Set(reqs.map((r) => String(r.startDate ?? '').slice(0, 4)).filter((y) => y.length === 4))
      yearSet.add(_CY)
      setAvailableYears([...yearSet].sort())
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { from, to } = useMemo(() => ymToDates(filterYear, filterMonth), [filterYear, filterMonth])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listLeaveRequests({
      status: statusFilter  || undefined,
      userId: employeeFilter || undefined,
      from, to, page, limit: 20,
    })
      .then((res) => {
        if (!cancelled) {
          setRequests(res.requests ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn nghỉ phép', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter, employeeFilter, from, to, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [statusFilter, employeeFilter, filterYear, filterMonth])
  useEffect(() => { return load() }, [load])

  const titlePeriod = !filterYear
    ? 'Tất cả'
    : !filterMonth
      ? `Năm ${filterYear}`
      : monthName(parseInt(filterYear), parseInt(filterMonth))

  return (
    <>
      {/* Filter bar */}
      <div className={s.filterBar}>
        <select
          className={s.filterSelect}
          value={filterYear}
          onChange={(e) => { setFilterYear(e.target.value); setFilterMonth('') }}
        >
          <option value="">Tất cả năm</option>
          {availableYears.map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <select
          className={s.filterSelect}
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          disabled={!filterYear}
        >
          <option value="">Cả năm</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={String(m)}>Tháng {m}</option>
          ))}
        </select>
        <select className={s.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
        <select className={s.filterSelect} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn nghỉ phép — {titlePeriod}
            {!loading && (
              <span style={{ fontWeight: 600, color: 'var(--color-muted)', marginLeft: 8, fontSize: 'var(--fs-sm)' }}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <ClipboardList size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
            Không có đơn nào
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Loại nghỉ</th>
                  <th>Từ ngày</th>
                  <th>Đến ngày</th>
                  <th>Số ngày</th>
                  <th>Trạng thái</th>
                  <th>Lý do</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = LEAVE_STATUS_CFG[req.status] ?? LEAVE_STATUS_CFG.pending
                  return (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{req.userName}</td>
                    <td>{LEAVE_TYPE[req.leaveType] ?? req.leaveType}</td>
                    <td>{fmtDateVI(req.startDate)}</td>
                    <td>{fmtDateVI(req.endDate)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{req.daysCount ?? req.totalDays} ngày</td>
                    <td>
                      <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-muted)', maxWidth: 160 }}>{req.reason ?? '—'}</td>
                    <td>
                      {req.status === 'pending' && (
                        <button
                          className={s.btnSuccess}
                          style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                          onClick={() => setReviewTarget(req)}
                        >
                          Xét duyệt
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>Tổng: {pagination.total} đơn</span>
            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewLeaveModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSaved={() => { setReviewTarget(null); load() }}
        />
      )}
    </>
  )
}

// ── ReviewLeaveModal ──────────────────────────────────────────────────────────

function ReviewLeaveModal({ request, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleApprove() {
    setSaving(true)
    try {
      await attendanceApi.approveLeaveRequest(request.id)
      addToast('Đã duyệt đơn nghỉ phép', 'success')
      onSaved()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể duyệt', 'error')
      setSaving(false)
    }
  }

  async function handleReject() {
    setSaving(true)
    try {
      await attendanceApi.rejectLeaveRequest(request.id, { reason: note || undefined })
      addToast('Đã từ chối đơn', 'success')
      onSaved()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể từ chối', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title="Xét duyệt đơn nghỉ phép" onClose={onClose}>
      <div className={s.modalForm}>
        <div style={{ background: 'var(--color-bg-soft)', border: '1.5px solid var(--color-primary-bg-strong)', borderRadius: 8, padding: '12px 14px', fontSize: 'var(--fs-sm)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--color-primary-deep)' }}>{request.userName}</p>
          <p style={{ margin: '0 0 4px', color: 'var(--color-muted)' }}>{LEAVE_TYPE[request.leaveType] ?? request.leaveType}</p>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            {fmtDateVI(request.startDate)} → {fmtDateVI(request.endDate)} ({request.daysCount ?? request.totalDays} ngày)
          </p>
          {request.reason && (
            <p style={{ margin: '6px 0 0', color: 'var(--color-muted)', fontStyle: 'italic' }}>{request.reason}</p>
          )}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={s.formTextarea} rows={2} placeholder="Ghi chú..." />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Đóng</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleReject}><X size={13} /> Từ chối</button>
          <button className={s.btnSuccess} disabled={saving} onClick={handleApprove}><Check size={13} /> Duyệt</button>
        </div>
      </div>
    </Modal>
  )
}

// ── AdminOvertimeTab ──────────────────────────────────────────────────────────

function AdminOvertimeTab({ staffList }) {
  const addToast = useToastStore((st) => st.toast)
  const [requests,       setRequests]       = useState([])
  const [page,           setPage]           = useState(1)
  const [pagination,     setPagination]     = useState({ total: 0, totalPages: 1 })
  const [loading,        setLoading]        = useState(true)
  const [reviewTarget,   setReviewTarget]   = useState(null)
  const [availableYears, setAvailableYears] = useState([_CY])
  const [filterYear,     setFilterYear]     = useState(_CY)
  const [filterMonth,    setFilterMonth]    = useState(_CM)
  const [statusFilter,   setStatusFilter]   = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')

  // Derive available years from actual data in the system
  useEffect(() => {
    attendanceApi.listOvertimeRequests({ limit: 1000 }).then((res) => {
      const reqs = res.requests ?? res.data ?? []
      const yearSet = new Set(reqs.map((r) => String(r.otDate ?? '').slice(0, 4)).filter((y) => y.length === 4))
      yearSet.add(_CY)
      setAvailableYears([...yearSet].sort())
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { from, to } = useMemo(() => ymToDates(filterYear, filterMonth), [filterYear, filterMonth])

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listOvertimeRequests({
      status: statusFilter  || undefined,
      userId: employeeFilter || undefined,
      from, to, page, limit: 20,
    })
      .then((res) => {
        if (!cancelled) {
          setRequests(res.requests ?? res.data ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn tăng ca', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [statusFilter, employeeFilter, from, to, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1) }, [statusFilter, employeeFilter, filterYear, filterMonth])
  useEffect(() => { return load() }, [load])

  const titlePeriod = !filterYear
    ? 'Tất cả'
    : !filterMonth
      ? `Năm ${filterYear}`
      : monthName(parseInt(filterYear), parseInt(filterMonth))

  return (
    <>
      {/* Filter bar */}
      <div className={s.filterBar}>
        <select
          className={s.filterSelect}
          value={filterYear}
          onChange={(e) => { setFilterYear(e.target.value); setFilterMonth('') }}
        >
          <option value="">Tất cả năm</option>
          {availableYears.map((y) => <option key={y} value={y}>Năm {y}</option>)}
        </select>
        <select
          className={s.filterSelect}
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          disabled={!filterYear}
        >
          <option value="">Cả năm</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={String(m)}>Tháng {m}</option>
          ))}
        </select>
        <select className={s.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="pending">Chờ duyệt</option>
          <option value="approved">Đã duyệt</option>
          <option value="rejected">Từ chối</option>
        </select>
        <select className={s.filterSelect} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn tăng ca — {titlePeriod}
            {!loading && (
              <span style={{ fontWeight: 600, color: 'var(--color-muted)', marginLeft: 8, fontSize: 'var(--fs-sm)' }}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <Clock size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
            Không có đơn nào
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Ngày</th>
                  <th>Bắt đầu</th>
                  <th>Kết thúc</th>
                  <th>Số giờ</th>
                  <th>Trạng thái</th>
                  <th>Lý do</th>
                  <th style={{ width: 110 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = OT_STATUS_CFG[req.status] ?? OT_STATUS_CFG.pending
                  return (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{req.userName}</td>
                    <td>{fmtDateVI(req.otDate)}</td>
                    <td style={{ fontWeight: 600 }}>{req.startTime ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{req.endTime ?? '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-purple-bright)' }}>
                      {req.otHours != null ? `${Number(req.otHours).toFixed(1)}h` : '—'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-muted)', maxWidth: 160 }}>{req.reason ?? '—'}</td>
                    <td>
                      {req.status === 'pending' && (
                        <button
                          className={s.btnSuccess}
                          style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                          onClick={() => setReviewTarget(req)}
                        >
                          Xét duyệt
                        </button>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>Tổng: {pagination.total} đơn</span>
            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewOvertimeModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSaved={() => { setReviewTarget(null); load() }}
        />
      )}
    </>
  )
}

// ── ReviewOvertimeModal ───────────────────────────────────────────────────────

function ReviewOvertimeModal({ request, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [note,   setNote]   = useState('')
  const [saving, setSaving] = useState(false)

  async function handleApprove() {
    setSaving(true)
    try {
      await attendanceApi.approveOvertimeRequest(request.id)
      addToast('Đã duyệt đơn tăng ca', 'success')
      onSaved()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể duyệt', 'error')
      setSaving(false)
    }
  }

  async function handleReject() {
    setSaving(true)
    try {
      await attendanceApi.rejectOvertimeRequest(request.id, { rejectionNote: note || undefined })
      addToast('Đã từ chối đơn tăng ca', 'success')
      onSaved()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể từ chối', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title="Xét duyệt đơn tăng ca" onClose={onClose}>
      <div className={s.modalForm}>
        <div style={{ background: 'var(--color-purple-bg-soft)', border: '1.5px solid var(--color-status-review-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 'var(--fs-sm)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--color-purple-bright)' }}>{request.userName}</p>
          <p style={{ margin: '0 0 4px', color: 'var(--color-muted)' }}>
            Ngày: {fmtDateVI(request.otDate)} · {request.startTime} – {request.endTime}
          </p>
          {request.otHours != null && (
            <p style={{ margin: '4px 0 0', fontWeight: 700, color: 'var(--color-purple-bright)' }}>
              {Number(request.otHours).toFixed(1)} giờ tăng ca
            </p>
          )}
          {request.reason && (
            <p style={{ margin: '6px 0 0', color: 'var(--color-muted)', fontStyle: 'italic' }}>{request.reason}</p>
          )}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className={s.formTextarea} rows={2} placeholder="Ghi chú..." />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Đóng</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleReject}><X size={13} /> Từ chối</button>
          <button className={s.btnSuccess} disabled={saving} onClick={handleApprove}><Check size={13} /> Duyệt</button>
        </div>
      </div>
    </Modal>
  )
}



// ── ReportTab ─────────────────────────────────────────────────────────────────

function ReportTab({ year, month }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [showSync, setShowSync] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.getMonthlyReport({ month, year })
      .then((data) => {
        if (!cancelled) {
          const arr = Array.isArray(data) ? data : (data?.rows ?? data?.data ?? [])
          setRows(arr)
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải báo cáo', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleExportCSV() {
    if (rows.length === 0) return
    const header = ['Nhân viên', 'Chức danh', 'Ngày công', 'Nghỉ (TL)', 'Vắng', 'Đi muộn', 'Về sớm', 'Giờ OT', 'OT Pay (₫)']
    const csvRows = rows.map((r) => [
      `"${r.userName ?? r.name ?? ''}"`,
      `"${r.jobTitle ?? ''}"`,
      r.actualWorkDays ?? r.workDays ?? 0,
      r.leavePaidDays  ?? r.leaveDays ?? 0,
      r.absentDays     ?? 0,
      r.lateCount      ?? r.lateDays  ?? 0,
      r.earlyCount     ?? 0,
      Number(r.totalOtHours ?? r.otHours ?? 0).toFixed(1),
      r.otPay          ?? 0,
    ])
    const csv = [header, ...csvRows].map((row) => row.join(',')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `bao-cao-cham-cong-T${String(month).padStart(2,'0')}-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Totals
  const totals = useMemo(() => {
    if (!rows.length) return null
    return rows.reduce((acc, r) => ({
      workDays:  acc.workDays  + Number(r.actualWorkDays ?? r.workDays  ?? 0),
      leaveDays: acc.leaveDays + Number(r.leavePaidDays  ?? r.leaveDays ?? 0),
      absent:    acc.absent    + Number(r.absentDays     ?? 0),
      late:      acc.late      + Number(r.lateCount      ?? r.lateDays  ?? 0),
      otHours:   acc.otHours   + Number(r.totalOtHours   ?? r.otHours   ?? 0),
      otPay:     acc.otPay     + Number(r.otPay          ?? 0),
    }), { workDays: 0, leaveDays: 0, absent: 0, late: 0, otHours: 0, otPay: 0 })
  }, [rows])

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>Báo cáo chấm công — {monthName(year, month)}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={s.btnSecondary}
              onClick={handleExportCSV}
              disabled={rows.length === 0}
              style={{ height: 34 }}
            >
              <Download size={13} /> Xuất CSV
            </button>
            <button
              className={s.btnPrimary}
              onClick={() => setShowSync(true)}
              style={{ height: 34 }}
            >
              <RefreshCw size={13} /> Đồng bộ vào Bảng Lương
            </button>
          </div>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : rows.length === 0 ? (
          <div className={s.centered}>
            <BarChart3 size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
            Chưa có dữ liệu báo cáo tháng này
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  <th>Chức danh</th>
                  <th style={{ color: 'var(--color-success-dark)' }}>Ngày công</th>
                  <th style={{ color: 'var(--color-primary)' }}>Nghỉ (TL)</th>
                  <th style={{ color: 'var(--color-danger)' }}>Vắng</th>
                  <th style={{ color: 'var(--color-warning-amber)' }}>Đi muộn</th>
                  <th style={{ color: 'var(--color-warning-dark)' }}>Về sớm</th>
                  <th style={{ color: 'var(--color-purple-bright)' }}>OT (h)</th>
                  <th style={{ color: 'var(--color-cyan)' }}>OT Pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.userId ?? i}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{r.userName ?? r.name}</td>
                    <td style={{ color: 'var(--color-muted)' }}>{r.jobTitle ?? '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-success-dark)' }}>
                      {Number(r.actualWorkDays ?? r.workDays ?? 0).toFixed(1)}
                    </td>
                    <td>{Number(r.leavePaidDays ?? r.leaveDays ?? 0).toFixed(1)}</td>
                    <td style={{ fontWeight: r.absentDays > 0 ? 700 : 400, color: r.absentDays > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>
                      {r.absentDays ?? 0}
                    </td>
                    <td style={{ fontWeight: (r.lateCount ?? r.lateDays ?? 0) > 0 ? 700 : 400, color: (r.lateCount ?? r.lateDays ?? 0) > 0 ? 'var(--color-warning-amber)' : 'var(--color-muted)' }}>
                      {r.lateCount ?? r.lateDays ?? 0}
                    </td>
                    <td style={{ color: 'var(--color-muted)' }}>{r.earlyCount ?? 0}</td>
                    <td style={{ fontWeight: (r.totalOtHours ?? r.otHours ?? 0) > 0 ? 700 : 400, color: (r.totalOtHours ?? r.otHours ?? 0) > 0 ? 'var(--color-purple-bright)' : 'var(--color-muted)' }}>
                      {Number(r.totalOtHours ?? r.otHours ?? 0).toFixed(1)}
                    </td>
                    <td style={{ fontWeight: r.otPay > 0 ? 700 : 400, color: r.otPay > 0 ? 'var(--color-cyan)' : 'var(--color-muted)' }}>
                      {fmtCurrency(r.otPay)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot>
                  <tr style={{ background: 'linear-gradient(180deg,var(--color-bg-soft) 0%,var(--color-primary-bg) 100%)', borderTop: '2px solid var(--color-primary-bg-strong)' }}>
                    <td colSpan={2} style={{ fontWeight: 800, color: 'var(--color-primary-deep)', padding: '10px 14px', fontSize: 'var(--fs-xs)', textTransform: 'uppercase' }}>
                      Tổng cộng
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--color-success-dark)' }}>{totals.workDays.toFixed(1)}</td>
                    <td style={{ fontWeight: 700 }}>{totals.leaveDays.toFixed(1)}</td>
                    <td style={{ fontWeight: totals.absent > 0 ? 800 : 400, color: totals.absent > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>{totals.absent}</td>
                    <td style={{ fontWeight: totals.late > 0 ? 800 : 400, color: totals.late > 0 ? 'var(--color-warning-amber)' : 'var(--color-muted)' }}>{totals.late}</td>
                    <td>—</td>
                    <td style={{ fontWeight: 800, color: 'var(--color-purple-bright)' }}>{totals.otHours.toFixed(1)}</td>
                    <td style={{ fontWeight: 800, color: 'var(--color-cyan)' }}>{fmtCurrency(totals.otPay)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {showSync && (
        <SyncPayrollModal
          year={year}
          month={month}
          onClose={() => setShowSync(false)}
        />
      )}
    </>
  )
}

// ── SyncPayrollModal ──────────────────────────────────────────────────────────

function SyncPayrollModal({ year, month, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const navigate = useNavigate()
  const [periods,  setPeriods]  = useState([])
  const [selected, setSelected] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [syncing,  setSyncing]  = useState(false)

  useEffect(() => {
    payrollApi.listPeriods({ limit: 20 })
      .then((list) => {
        const arr = Array.isArray(list) ? list : (list?.periods ?? [])
        setPeriods(arr)
        // Pre-select the period matching current month/year
        const match = arr.find((p) => p.periodYear === year && p.periodMonth === month)
        if (match) setSelected(match.id)
      })
      .catch(() => addToast('Không thể tải danh sách kỳ lương', 'error'))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    if (!selected) { addToast('Vui lòng chọn kỳ lương', 'error'); return }
    setSyncing(true)
    try {
      await attendanceApi.syncPayroll(selected)
      addToast('Đồng bộ chấm công vào bảng lương thành công!', 'success')
      onClose()
      navigate('/payroll')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể đồng bộ', 'error')
      setSyncing(false)
    }
  }

  function periodLabel(p) {
    const statusMap = { draft: 'Nháp', confirmed: 'Đã xác nhận', paid: 'Đã trả' }
    return `Tháng ${p.periodMonth}/${p.periodYear} — ${statusMap[p.status] ?? p.status}`
  }

  return (
    <Modal title="Đồng bộ chấm công vào Bảng Lương" onClose={onClose}>
      <div className={s.modalForm}>
        <div style={{ padding: '10px 14px', background: 'var(--color-accent-bg-soft)', border: '1.5px solid var(--color-accent-bg)', borderRadius: 8, fontSize: 'var(--fs-sm)', color: 'var(--color-warning-amber)', marginBottom: 4 }}>
          Dữ liệu chấm công tháng {month}/{year} sẽ được ghi vào mục
          <strong> attendance_summary</strong> trong kỳ lương đã chọn.
          Thao tác này có thể ghi đè dữ liệu cũ nếu đã sync trước đó.
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Chọn kỳ lương</label>
          {loading ? (
            <div style={{ color: 'var(--color-muted)', fontSize: 'var(--fs-sm)' }}>
              <Loader2 size={13} className={s.spin} style={{ marginRight: 6 }} />
              Đang tải...
            </div>
          ) : (
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className={s.formSelect}
            >
              <option value="">-- Chọn kỳ lương --</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{periodLabel(p)}</option>
              ))}
            </select>
          )}
        </div>

        {periods.length === 0 && !loading && (
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-danger)' }}>
            Không tìm thấy kỳ lương nào. Vui lòng tạo kỳ lương trước.
          </div>
        )}

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={syncing}>
            Huỷ
          </button>
          <button
            className={s.btnPrimary}
            onClick={handleSync}
            disabled={syncing || !selected || loading}
          >
            {syncing && <Loader2 size={13} className={s.spin} />}
            {syncing ? 'Đang đồng bộ...' : <><RefreshCw size={13} /> Đồng bộ ngay</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── AttendanceSettingsTab ─────────────────────────────────────────────────────

function AttendanceSettingsTab() {
  const addToast       = useToastStore((st) => st.toast)
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [shifts,       setShifts]       = useState([])
  const [defaultId,    setDefaultId]    = useState('')
  const [mode,         setMode]         = useState('dayoff') // 'dayoff' | 'workday'
  const [satShiftId,   setSatShiftId]   = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      attendanceApi.getAttendanceSettings(),
      attendanceApi.listShifts(false),
    ]).then(([cfg, shiftData]) => {
      if (cancelled) return
      setDefaultId(cfg.defaultShiftId ?? '')
      setMode(cfg.saturdayMode ?? 'dayoff')
      setSatShiftId(cfg.saturdayShiftId ?? '')
      const arr = Array.isArray(shiftData) ? shiftData : (shiftData?.shifts ?? [])
      setShifts(arr)
    }).catch(() => {
      if (!cancelled) addToast('Không thể tải cài đặt chấm công', 'error')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!defaultId) {
      addToast('Vui lòng chọn ca làm việc mặc định', 'error')
      return
    }
    if (mode === 'workday' && !satShiftId) {
      addToast('Vui lòng chọn ca làm việc cho Thứ 7', 'error')
      return
    }
    setSaving(true)
    try {
      await attendanceApi.updateAttendanceSettings({
        defaultShiftId:  defaultId || null,
        saturdayShiftId: mode === 'workday' ? satShiftId : null,
      })
      addToast('Đã lưu cài đặt chấm công', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể lưu cài đặt', 'error')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className={s.section}>
        <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
      </div>
    )
  }

  const selectedDefault = shifts.find((sh) => sh.id === defaultId)
  const selectedSatShift = shifts.find((sh) => sh.id === satShiftId)

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>Cài đặt chấm công</h3>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>

        {/* Default shift config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--color-text)' }}>
            Ca làm việc mặc định (Thứ 2 – Thứ 6)
          </div>
          <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', lineHeight: 1.6, marginTop: -6 }}>
            Ca áp dụng cho toàn bộ nhân viên vào các ngày thường. Hệ thống tự động dùng ca này để tính chấm công mà không cần tạo lịch riêng.
          </div>
          <div className={s.formGroup} style={{ marginBottom: 0 }}>
            <label className={`${s.formLabel} ${s.req}`}>Ca mặc định</label>
            <select value={defaultId} onChange={(e) => setDefaultId(e.target.value)} className={s.formSelect}>
              <option value="">-- Chọn ca --</option>
              {shifts.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name} ({sh.startTime ?? sh.start_time} – {sh.endTime ?? sh.end_time}
                  {sh.requiredHours != null ? `, ${sh.requiredHours}h` : ''})
                </option>
              ))}
            </select>
          </div>
          {selectedDefault && (
            <div style={{ padding: '8px 12px', background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)', borderRadius: 6, fontSize: 'var(--fs-xs)', color: 'var(--color-success-dark)' }}>
              Ca <strong>{selectedDefault.name}</strong> — {selectedDefault.requiredHours ?? '?'}h/ngày.
              {selectedDefault.requiredHours < 8
                ? ' Nhân viên đủ giờ sẽ được tính 0.5 ngày công.'
                : ' Nhân viên đủ giờ sẽ được tính 1 ngày công đầy đủ.'}
            </div>
          )}
        </div>

        {/* Saturday config */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--color-text)' }}>
            Quy định Thứ 7
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', border: `2px solid ${mode === 'dayoff' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, background: mode === 'dayoff' ? 'var(--color-primary-bg)' : 'var(--color-surface)' }}>
            <input
              type="radio"
              name="saturday-mode"
              value="dayoff"
              checked={mode === 'dayoff'}
              onChange={() => setMode('dayoff')}
              style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: mode === 'dayoff' ? 'var(--color-primary-deep)' : 'var(--color-text)' }}>
                Thứ 7 là ngày nghỉ
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', marginTop: 2 }}>
                Không phát sinh chấm công Thứ 7
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', border: `2px solid ${mode === 'workday' ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, background: mode === 'workday' ? 'var(--color-primary-bg)' : 'var(--color-surface)' }}>
            <input
              type="radio"
              name="saturday-mode"
              value="workday"
              checked={mode === 'workday'}
              onChange={() => setMode('workday')}
              style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', color: mode === 'workday' ? 'var(--color-primary-deep)' : 'var(--color-text)' }}>
                Thứ 7 là ngày đi làm
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', marginTop: 2 }}>
                Chọn ca làm việc (nửa ngày hoặc cả ngày) để áp dụng cho Thứ 7
              </div>
            </div>
          </label>

          {mode === 'workday' && (
            <div className={s.formGroup} style={{ marginTop: 4 }}>
              <label className={`${s.formLabel} ${s.req}`}>Ca làm việc Thứ 7</label>
              <select
                value={satShiftId}
                onChange={(e) => setSatShiftId(e.target.value)}
                className={s.formSelect}
              >
                <option value="">-- Chọn ca --</option>
                {shifts.map((sh) => (
                  <option key={sh.id} value={sh.id}>
                    {sh.name} ({sh.startTime ?? sh.start_time} – {sh.endTime ?? sh.end_time}
                    {sh.requiredHours != null ? `, ${sh.requiredHours}h` : ''})
                  </option>
                ))}
              </select>
              {selectedSatShift && (
                <div style={{ marginTop: 6, padding: '8px 12px', background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)', borderRadius: 6, fontSize: 'var(--fs-xs)', color: 'var(--color-success-dark)' }}>
                  Ca <strong>{selectedSatShift.name}</strong> — {selectedSatShift.requiredHours ?? '?'}h/ngày.
                  {selectedSatShift.requiredHours < 8
                    ? ' Nhân viên đủ giờ sẽ được tính 0.5 ngày công.'
                    : ' Nhân viên đủ giờ sẽ được tính 1 ngày công đầy đủ.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ paddingTop: 4, borderTop: '1px solid var(--color-border-soft)' }}>
          <button
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={saving}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving && <Loader2 size={13} className={s.spin} />}
            {saving ? 'Đang lưu...' : <><Check size={13} /> Lưu cài đặt</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AdminDevToolsTab ──────────────────────────────────────────────────────────

function AdminDevToolsTab({ staffList }) {
  const addToast = useToastStore((st) => st.toast)
  const now = new Date()

  // ── Section A: simulate one day ───────────────────────────────────────────
  const [dayUserId,  setDayUserId]  = useState('')
  const [dayDate,    setDayDate]    = useState(now.toISOString().slice(0, 10))
  const [dayIn,      setDayIn]      = useState('08:00')
  const [dayOut,     setDayOut]     = useState('17:00')
  const [dayAbsent,  setDayAbsent]  = useState(false)
  const [dayLoading, setDayLoading] = useState(false)
  const [dayResult,  setDayResult]  = useState(null)

  async function handleSimDay() {
    if (!dayUserId || !dayDate) return addToast('Vui lòng chọn nhân viên và ngày', 'error')
    setDayLoading(true); setDayResult(null)
    try {
      const res = await attendanceApi.simDay({
        userId:       dayUserId,
        date:         dayDate,
        checkInTime:  dayAbsent ? null : dayIn,
        checkOutTime: dayAbsent ? null : dayOut,
      })
      setDayResult(res.data?.record ?? null)
      addToast('Giả lập thành công!', 'success')
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Lỗi giả lập', 'error')
    } finally {
      setDayLoading(false)
    }
  }

  // ── Section B: simulate full month ────────────────────────────────────────
  const [mthUserId,   setMthUserId]   = useState('all')
  const [mthYear,     setMthYear]     = useState(String(now.getFullYear()))
  const [mthMonth,    setMthMonth]    = useState(String(now.getMonth() + 1))
  const [mthScenario, setMthScenario] = useState('normal')
  const [mthLoading,  setMthLoading]  = useState(false)
  const [mthResult,   setMthResult]   = useState(null)
  const [clrLoading,  setClrLoading]  = useState(false)

  async function handleSimMonth() {
    setMthLoading(true); setMthResult(null)
    try {
      let res
      if (mthUserId === 'all') {
        res = await attendanceApi.simTeamMonth({ month: mthMonth, year: mthYear, scenario: mthScenario })
        const d = res.data
        addToast(`Giả lập xong: ${d.totalUsers} nhân viên, ${d.totalDays} ngày`, 'success')
      } else {
        res = await attendanceApi.simMonth({ userId: mthUserId, month: mthMonth, year: mthYear, scenario: mthScenario })
        addToast(`Giả lập xong: ${res.data?.simulated} ngày`, 'success')
      }
      setMthResult(res.data)
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Lỗi giả lập', 'error')
    } finally {
      setMthLoading(false)
    }
  }

  async function handleClear() {
    if (!window.confirm(`Xóa toàn bộ data giả lập tháng ${mthMonth}/${mthYear}?`)) return
    setClrLoading(true)
    try {
      const res = await attendanceApi.simClear({
        userId: mthUserId === 'all' ? null : mthUserId,
        month: mthMonth,
        year: mthYear,
      })
      addToast(`Đã xóa: ${res.data?.recordsDeleted} records, ${res.data?.logsDeleted} logs`, 'success')
      setMthResult(null)
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Lỗi xóa data', 'error')
    } finally {
      setClrLoading(false)
    }
  }

  const devBox = { background: 'var(--color-surface)', border: '1.5px solid #f97316', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }
  const devH = { fontSize: 'var(--fs-sm)', fontWeight: 700, color: '#ea580c', borderBottom: '1px solid #fed7aa', paddingBottom: 8, marginBottom: 4 }
  const row = { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }
  const fgGrp = { display: 'flex', flexDirection: 'column', gap: 4 }
  const lbl = { fontSize: 'var(--fs-xs)', color: 'var(--color-muted)', fontWeight: 600 }

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Terminal size={16} />
          Dev Tools — Giả lập chấm công
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#f97316', borderRadius: 4, padding: '2px 7px' }}>DEV ONLY</span>
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16 }}>

        {/* Section A */}
        <div style={devBox}>
          <div style={devH}>A — Giả lập 1 ngày, 1 nhân viên</div>

          <div style={row}>
            <div style={fgGrp}>
              <span style={lbl}>Nhân viên</span>
              <select value={dayUserId} onChange={(e) => setDayUserId(e.target.value)} className={s.formSelect} style={{ minWidth: 180 }}>
                <option value="">-- Chọn nhân viên --</option>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={fgGrp}>
              <span style={lbl}>Ngày</span>
              <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className={s.formInput} />
            </div>
            {!dayAbsent && (
              <>
                <div style={fgGrp}>
                  <span style={lbl}>Giờ vào</span>
                  <input type="time" value={dayIn} onChange={(e) => setDayIn(e.target.value)} className={s.formInput} style={{ width: 110 }} />
                </div>
                <div style={fgGrp}>
                  <span style={lbl}>Giờ ra</span>
                  <input type="time" value={dayOut} onChange={(e) => setDayOut(e.target.value)} className={s.formInput} style={{ width: 110 }} />
                </div>
              </>
            )}
            <div style={fgGrp}>
              <span style={lbl}>&nbsp;</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, cursor: 'pointer', fontSize: 'var(--fs-sm)', color: 'var(--color-text)' }}>
                <input type="checkbox" checked={dayAbsent} onChange={(e) => setDayAbsent(e.target.checked)} style={{ accentColor: '#f97316' }} />
                Vắng mặt
              </label>
            </div>
            <div style={fgGrp}>
              <span style={lbl}>&nbsp;</span>
              <button className={s.btnPrimary} onClick={handleSimDay} disabled={dayLoading} style={{ background: '#f97316', borderColor: '#f97316' }}>
                {dayLoading ? <Loader2 size={13} className={s.spin} /> : null}
                {dayLoading ? 'Đang chạy...' : 'Giả lập ngày này'}
              </button>
            </div>
          </div>

          {dayResult && (
            <div style={{ padding: '10px 14px', background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)', borderRadius: 8, fontSize: 'var(--fs-xs)', color: 'var(--color-success-dark)' }}>
              Kết quả: <strong>{dayResult.status}</strong> |
              Vào: {dayResult.checkInTime ? fmtTime(dayResult.checkInTime) : '—'} |
              Ra: {dayResult.checkOutTime ? fmtTime(dayResult.checkOutTime) : '—'} |
              Muộn: {dayResult.lateMinutes ?? 0}' |
              Sớm: {dayResult.earlyMinutes ?? 0}' |
              Ngày công: {dayResult.workUnits ?? 0}
            </div>
          )}
        </div>

        {/* Section B */}
        <div style={devBox}>
          <div style={devH}>B — Giả lập cả tháng</div>

          <div style={row}>
            <div style={fgGrp}>
              <span style={lbl}>Nhân viên</span>
              <select value={mthUserId} onChange={(e) => setMthUserId(e.target.value)} className={s.formSelect} style={{ minWidth: 180 }}>
                <option value="all">Tất cả nhân viên</option>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div style={fgGrp}>
              <span style={lbl}>Tháng</span>
              <select value={mthMonth} onChange={(e) => setMthMonth(e.target.value)} className={s.formSelect} style={{ width: 80 }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>Tháng {m}</option>
                ))}
              </select>
            </div>
            <div style={fgGrp}>
              <span style={lbl}>Năm</span>
              <select value={mthYear} onChange={(e) => setMthYear(e.target.value)} className={s.formSelect} style={{ width: 80 }}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div style={fgGrp}>
              <span style={lbl}>Kịch bản</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {['perfect', 'normal', 'mixed'].map((sc) => (
                  <label key={sc} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: mthScenario === sc ? 700 : 400, color: mthScenario === sc ? '#ea580c' : 'var(--color-text)' }}>
                    <input type="radio" name="sim-scenario" value={sc} checked={mthScenario === sc} onChange={() => setMthScenario(sc)} style={{ accentColor: '#f97316' }} />
                    {sc === 'perfect' ? 'Perfect' : sc === 'normal' ? 'Normal' : 'Mixed'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={row}>
            <button className={s.btnSecondary} onClick={handleClear} disabled={clrLoading}>
              {clrLoading ? <Loader2 size={13} className={s.spin} /> : <X size={13} />}
              Xóa data tháng này
            </button>
            <button className={s.btnPrimary} onClick={handleSimMonth} disabled={mthLoading} style={{ background: '#f97316', borderColor: '#f97316' }}>
              {mthLoading ? <Loader2 size={13} className={s.spin} /> : null}
              {mthLoading ? 'Đang giả lập...' : 'Giả lập cả tháng'}
            </button>
          </div>

          {mthResult && (
            <div style={{ padding: '10px 14px', background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)', borderRadius: 8, fontSize: 'var(--fs-xs)', color: 'var(--color-success-dark)' }}>
              {mthUserId === 'all'
                ? `Đã giả lập ${mthResult.totalUsers} nhân viên, tổng ${mthResult.totalDays} ngày công`
                : `Đã giả lập ${mthResult.simulated} ngày làm việc`}
              . Vào tab <strong>Lịch chấm công</strong> hoặc <strong>Báo cáo</strong> để kiểm tra kết quả.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
