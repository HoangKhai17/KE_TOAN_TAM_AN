import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  Users, CalendarDays, ClipboardList, Clock, CalendarCheck,
  ChevronLeft, ChevronRight, Loader2, Check, X, RefreshCw,
  Download, BarChart3, Settings, Terminal, Pencil, LayoutGrid,
  Mail, SendHorizonal, CheckCircle2,
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

function parseDateLocal(d) {
  if (!d) return null
  const str = typeof d === 'string' ? d : String(d)
  const [y, mo, day] = str.slice(0, 10).split('-').map(Number)
  return new Date(y, mo - 1, day)
}

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
  pending:   { label: 'Chờ duyệt' },
  approved:  { label: 'Đã duyệt' },
  rejected:  { label: 'Từ chối' },
  cancelled: { label: 'Đã huỷ' },
}

const OT_STATUS_CFG = {
  pending:  { label: 'Chờ duyệt' },
  approved: { label: 'Đã duyệt' },
  rejected: { label: 'Từ chối' },
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

const STATUS_SHORT = {
  present:        'Có',
  late:           'Muộn',
  early_leave:    'Sớm',
  late_and_early: 'M+S',
  absent:         'Vắng',
  on_leave:       'NP',
  business_trip:  'CT',
  wfh:            'WFH',
  holiday:        'Lễ',
  unscheduled:    '',
}

const WEEK_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const LEAVE_TYPE = {
  annual:        'Nghỉ phép năm',
  sick:          'Nghỉ ốm',
  compensatory:  'Nghỉ bù',
  unpaid:        'Nghỉ không lương',
  business_trip: 'Công tác',
  wfh:           'Làm từ xa',
}

const STATUS_CLASS = {
  present:        'status_present',
  late:           'status_late',
  early_leave:    'status_early_leave',
  late_and_early: 'status_late_and_early',
  absent:         'status_absent',
  on_leave:       'status_on_leave',
  business_trip:  'status_business_trip',
  wfh:            'status_wfh',
  holiday:        'status_holiday',
  unscheduled:    'status_unscheduled',
}

const REQUEST_STATUS_CLASS = {
  pending:   'request_pending',
  approved:  'request_approved',
  rejected:  'request_rejected',
  cancelled: 'request_cancelled',
}

function getStatusClass(status) {
  return s[STATUS_CLASS[status] ?? STATUS_CLASS.unscheduled]
}

function getRequestStatusClass(status) {
  return s[REQUEST_STATUS_CLASS[status] ?? REQUEST_STATUS_CLASS.pending]
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

function countWeekdays(startDate, endDate) {
  if (!startDate || !endDate) return 0
  const [sy, sm, sd] = String(startDate).slice(0, 10).split('-').map(Number)
  const [ey, em, ed] = String(endDate).slice(0, 10).split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  let n = 0
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) n++
    cur.setDate(cur.getDate() + 1)
  }
  return n
}

function buildCalendar(year, month, recordMap, holidaySet = new Set()) {
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
      const dateStr  = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      const jsDay    = new Date(dateStr + 'T00:00:00').getDay()
      const isHoliday = holidaySet.has(dateStr)
      // If it's a holiday but no record yet, synthesize a virtual holiday record for display
      const record   = recordMap[dateStr] ?? (isHoliday ? { status: 'holiday', isHoliday: true } : null)
      cells.push({
        type: 'day', key: dateStr, dateStr, dayNum,
        record,
        isToday:   dateStr === todayStr,
        isFuture:  dateStr > todayStr,
        isWeekend: jsDay === 0 || jsDay === 6,
        isHoliday,
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
                <span className={sa.devBadge}>
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
    const limit = Math.max(staffList.length + 10, 100)
    attendanceApi.listAttendanceRecords({ from: todayStr, to: todayStr, limit })
      .then((res) => {
        if (cancelled) return
        // Client-side guard: only keep records whose workDate matches today
        const all = res.records ?? []
        setRecords(all.filter((r) => String(r.workDate).slice(0, 10) === todayStr))
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu hôm nay', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [staffList.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <button className={`${s.btnSecondary} ${s.btnShort}`} onClick={load}>
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {/* Quick stats */}
      <div className={sa.todayStats}>
        <div className={`${sa.todayStat} ${sa.todayStatSuccess}`}>
          <span className={sa.todayStatNum}>{checkedIn}</span>
          <span className={sa.todayStatLbl}>Đã vào</span>
        </div>
        <div className={`${sa.todayStat} ${sa.todayStatPrimary}`}>
          <span className={sa.todayStatNum}>{checkedOut}</span>
          <span className={sa.todayStatLbl}>Đã ra</span>
        </div>
        <div className={`${sa.todayStat} ${sa.todayStatDanger}`}>
          <span className={sa.todayStatNum}>{staffList.length - checkedIn}</span>
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
                    <td className={s.tableStrong}>{user.name}</td>
                    <td className={s.tableMuted}>{user.jobTitle ?? '—'}</td>
                    <td>
                      {cfg ? (
                        <span className={`${s.statusPill} ${getStatusClass(rec.status)}`}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span className={`${s.statusPill} ${getStatusClass('absent')}`}>
                          Chưa vào
                        </span>
                      )}
                    </td>
                    <td className={s.tableSemibold}>{rec?.checkInTime ? fmtTime(rec.checkInTime) : '—'}</td>
                    <td className={s.tableMuted}>{rec?.checkOutTime ? fmtTime(rec.checkOutTime) : '—'}</td>
                    <td className={s.tableMuted}>
                      {rec?.actualHours != null ? `${Number(rec.actualHours).toFixed(1)}h` : '—'}
                    </td>
                  </tr>
                )
              })}
              {staffList.length === 0 && (
                <tr><td colSpan={6} className={s.tableEmpty}>Không có nhân viên</td></tr>
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
  const addToast = useToastStore((st) => st.toast)
  const [viewMode,    setViewMode]    = useState('calendar') // 'calendar' | 'table'

  // Calendar view state
  const [selectedId,  setSelectedId]  = useState(adminUserId ?? '')
  const [records,     setRecords]     = useState([])
  const [holidays,    setHolidays]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [selectedDay, setSelectedDay] = useState(null)

  // Table view state
  const [allRecords, setAllRecords]   = useState([])
  const [allLoading, setAllLoading]   = useState(false)
  const [tableDay,   setTableDay]     = useState(null)

  // Confirmation email modal
  const [confirmOpen, setConfirmOpen] = useState(false)

  const now      = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const loadCalendar = useCallback(() => {
    if (!selectedId) return () => {}
    let cancelled = false
    setLoading(true)
    Promise.all([
      attendanceApi.listAttendanceRecords({ userId: selectedId, month, year, limit: 31 }),
      attendanceApi.listHolidays(year),
    ])
      .then(([res, hols]) => {
        if (cancelled) return
        setRecords(res.records ?? [])
        setHolidays(Array.isArray(hols) ? hols : [])
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu chấm công', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId, month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadTable = useCallback(() => {
    let cancelled = false
    setAllLoading(true)
    Promise.all([
      attendanceApi.listAttendanceRecords({ month, year, limit: 9999 }),
      attendanceApi.listHolidays(year),
    ])
      .then(([res, hols]) => {
        if (cancelled) return
        setAllRecords(res.records ?? [])
        setHolidays(Array.isArray(hols) ? hols : [])
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu chấm công', 'error') })
      .finally(() => { if (!cancelled) setAllLoading(false) })
    return () => { cancelled = true }
  }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode === 'calendar') return loadCalendar()
    return loadTable()
  }, [viewMode, loadCalendar, loadTable])

  // Calendar memos
  const recordMap = useMemo(() => {
    const m = {}
    records.forEach((r) => { m[String(r.workDate).slice(0, 10)] = r })
    return m
  }, [records])

  const holidaySet = useMemo(() => {
    const set = new Set()
    holidays.forEach((h) => {
      const d = String(h.holidayDate).slice(0, 10)
      const dt = parseDateLocal(d)
      if (dt && dt.getMonth() + 1 === month) set.add(d)
    })
    return set
  }, [holidays, month])

  const cells = useMemo(() => buildCalendar(year, month, recordMap, holidaySet), [year, month, recordMap, holidaySet])

  // Table memos
  const allRecordMap = useMemo(() => {
    const m = {}
    allRecords.forEach((r) => {
      const date = String(r.workDate).slice(0, 10)
      if (!m[r.userId]) m[r.userId] = {}
      m[r.userId][date] = r
    })
    return m
  }, [allRecords])

  const daysInMonth = new Date(year, month, 0).getDate()

  return (
    <>
      {/* Filter bar: view toggle + per-mode controls */}
      <div className={s.filterBar}>
        <div className={sa.viewToggle}>
          <button
            className={`${sa.viewToggleBtn} ${viewMode === 'calendar' ? sa.viewToggleBtnActive : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays size={13} /> Lịch
          </button>
          <button
            className={`${sa.viewToggleBtn} ${viewMode === 'table' ? sa.viewToggleBtnActive : ''}`}
            onClick={() => setViewMode('table')}
          >
            <LayoutGrid size={13} /> Tất cả nhân viên
          </button>
        </div>

        {viewMode === 'calendar' && (
          <>
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
              <span className={sa.adminNotice}>
                ✓ Admin — tự động ghi nhận đủ công
              </span>
            )}
          </>
        )}
        {viewMode === 'table' && (
          <button
            className={`${s.btnSecondary} ${s.btnShort}`}
            onClick={loadTable}
            disabled={allLoading}
          >
            <RefreshCw size={13} /> Làm mới
          </button>
        )}

        {/* Send confirmation button — always visible in calendar tab */}
        <button
          className={`${s.btnPrimary} ${s.btnShort} ${sa.btnSendConfirm}`}
          onClick={() => setConfirmOpen(true)}
        >
          <Mail size={13} /> Gửi xác nhận chấm công
        </button>
      </div>

      {/* ── Calendar view ── */}
      {viewMode === 'calendar' && (
        <div className={`${s.section} ${sa.adminCalendarSection}`}>
          {loading ? (
            <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
          ) : (
            <>
              <div className={`${s.calendarGrid} ${sa.adminCalendarGrid}`}>
                {DAY_NAMES.map((d) => (
                  <div key={d} className={`${s.calendarCell} ${s.calendarHeaderCell}`}>{d}</div>
                ))}
                {cells.map((cell) => {
                  if (cell.type === 'empty') {
                    return <div key={cell.key} className={`${s.calendarCell} ${s.calendarEmpty}`} />
                  }
                  const { dateStr, dayNum, record, isToday, isFuture, isWeekend } = cell
                  const cfg = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
                  const statusClass = cfg ? getStatusClass(record.status) : ''
                  return (
                    <div
                      key={dateStr}
                      className={[
                        s.calendarCell, s.calendarDay, sa.adminCalendarDay,
                        isToday   ? s.calendarDayToday   : '',
                        isFuture  ? s.calendarDayFuture  : '',
                        isWeekend ? s.calendarDayWeekend : '',
                        record    ? s.calendarDayHasRecord : '',
                        record    ? sa.adminCalendarDayFilled : '',
                        statusClass ? s.calendarStatus : '',
                        statusClass,
                      ].filter(Boolean).join(' ')}
                      onClick={() => !isFuture && setSelectedDay({ dateStr, record })}
                      title={cfg?.label}
                    >
                      <span className={`${s.calendarDayNum} ${isToday ? s.calendarDayNumToday : ''}`}>
                        {dayNum}
                      </span>
                      {cfg && <span className={`${s.calendarDayLabel} ${sa.adminCalendarLabel}`}>{cfg.label}</span>}
                      {record?.lateMinutes > 0 && (
                        <span className={`${s.calendarDayExtra} ${s.summaryWarning}`}>
                          Muộn {record.lateMinutes}p
                        </span>
                      )}
                      {record?.earlyMinutes > 0 && (
                        <span className={`${s.calendarDayExtra} ${s.detailValueWarningDark}`}>
                          Sớm {record.earlyMinutes}p
                        </span>
                      )}
                      {record?.checkInTime && (
                        <span className={`${s.calendarDayTime} ${sa.adminCalendarTime}`}>
                          <span className={sa.timePrefix}>In</span>
                          {fmtTime(record.checkInTime)}
                        </span>
                      )}
                      {record?.checkOutTime && (
                        <span className={`${s.calendarDayTime} ${sa.adminCalendarTime}`}>
                          <span className={sa.timePrefix}>Out</span>
                          {fmtTime(record.checkOutTime)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {records.length === 0 && (
                <div className={s.centered}>
                  <CalendarDays size={32} className={s.emptyIcon} />
                  Chưa có dữ liệu chấm công tháng này
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── All-staff table view ── */}
      {viewMode === 'table' && (
        <div className={`${s.section} ${sa.allStaffSection}`}>
          {allLoading ? (
            <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
          ) : (
            <div className={sa.allStaffTableWrap}>
              <table className={sa.allStaffTable}>
                <thead>
                  <tr>
                    <th className={sa.allStaffNameHeader}>Nhân viên</th>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                      const jsDay = new Date(dateStr + 'T00:00:00').getDay()
                      const isWeekend = jsDay === 0 || jsDay === 6
                      const isToday   = dateStr === todayStr
                      return (
                        <th
                          key={d}
                          className={[
                            sa.allStaffDayHeader,
                            isWeekend ? sa.allStaffDayHeaderWeekend : '',
                            isToday   ? sa.allStaffDayHeaderToday   : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <span className={sa.allStaffDayNum}>{d}</span>
                          <span className={sa.allStaffDayWeek}>{WEEK_NAMES[jsDay]}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((user) => (
                    <tr key={user.id}>
                      <td className={sa.allStaffNameCell}>{user.name}</td>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                        const dateStr  = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                        const jsDay    = new Date(dateStr + 'T00:00:00').getDay()
                        const isWeekend = jsDay === 0 || jsDay === 6
                        const isFuture  = dateStr > todayStr
                        const isHoliday = holidaySet.has(dateStr)
                        let record = allRecordMap[user.id]?.[dateStr] ?? null
                        if (!record && isHoliday) record = { status: 'holiday', isHoliday: true }
                        const cfg = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
                        const tableStatusClass = record?.status ? sa[`allStaffStatus_${record.status}`] : ''
                        const isClickable = record && !record.isHoliday && !isFuture
                        return (
                          <td
                            key={d}
                            className={[
                              sa.allStaffCell,
                              isWeekend  ? sa.allStaffCellWeekend   : '',
                              isFuture   ? sa.allStaffCellFuture    : '',
                              isClickable ? sa.allStaffCellClickable : '',
                              cfg         ? sa.allStaffCellFilled    : '',
                              !cfg        ? sa.allStaffCellEmpty     : '',
                              tableStatusClass,
                            ].filter(Boolean).join(' ')}
                            onClick={() => isClickable && setTableDay({ dateStr, userId: user.id, record })}
                            title={cfg ? `${user.name} — ${cfg.label}` : undefined}
                          >
                            {cfg && (
                              <div className={sa.allStaffCellContent}>
                                <span className={sa.allStaffChip}>{STATUS_SHORT[record.status] ?? ''}</span>
                                {record?.lateMinutes > 0 && (
                                  <span className={sa.allStaffNoteLate}>+{record.lateMinutes}p</span>
                                )}
                                {record?.earlyMinutes > 0 && (
                                  <span className={sa.allStaffNoteEarly}>-{record.earlyMinutes}p</span>
                                )}
                                {record?.checkInTime && (
                                  <span className={sa.allStaffTime}>
                                    <span className={sa.timePrefix}>In</span>
                                    {fmtTime(record.checkInTime)}
                                  </span>
                                )}
                                {record?.checkOutTime && (
                                  <span className={sa.allStaffTime}>
                                    <span className={sa.timePrefix}>Out</span>
                                    {fmtTime(record.checkOutTime)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {staffList.length === 0 && (
                    <tr>
                      <td colSpan={daysInMonth + 1} className={s.centered}>Không có nhân viên</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedDay && (
        <AdminDayModal
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          userId={selectedId}
          onClose={() => setSelectedDay(null)}
          onSaved={() => { setSelectedDay(null); loadCalendar() }}
        />
      )}
      {tableDay && (
        <AdminDayModal
          dateStr={tableDay.dateStr}
          record={tableDay.record}
          userId={tableDay.userId}
          onClose={() => setTableDay(null)}
          onSaved={() => { setTableDay(null); loadTable() }}
        />
      )}

      {confirmOpen && (
        <AttendanceConfirmModal
          month={month}
          year={year}
          staffList={staffList}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </>
  )
}

// ── AttendanceConfirmModal ────────────────────────────────────────────────────

function AttendanceConfirmModal({ month, year, staffList, onClose }) {
  const addToast    = useToastStore((st) => st.toast)
  const pad         = (n) => String(n).padStart(2, '0')
  const monthYear   = `Tháng ${pad(month)}/${year}`
  const staffOnly   = staffList.filter((u) => u.role !== 'admin')
  const daysInMonth = new Date(year, month, 0).getDate()
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const now         = new Date()
  const todayStr    = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const [byUser,    setByUser]    = useState({})
  const [holidaySet,setHolidaySet]= useState(new Set())
  const [summaries, setSummaries] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [sending,   setSending]   = useState(false)
  const [result,    setResult]    = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      attendanceApi.listAttendanceRecords({ month, year, limit: 9999 }),
      attendanceApi.listHolidays(year),
      attendanceApi.getMonthlyReport({ month, year }),
    ])
      .then(([res, hols, reportData]) => {
        if (cancelled) return
        const records = res.records ?? []

        // byUser: { [userId]: { [dateStr]: record } }
        const byU = {}
        records.forEach((r) => {
          const date = String(r.workDate).slice(0, 10)
          if (!byU[r.userId]) byU[r.userId] = {}
          byU[r.userId][date] = r
        })
        setByUser(byU)

        // holiday set for current month
        const holSet = new Set()
        ;(Array.isArray(hols) ? hols : []).forEach((h) => {
          const d = String(h.holidayDate).slice(0, 10)
          const dt = parseDateLocal(d)
          if (dt && dt.getMonth() + 1 === month) holSet.add(d)
        })
        setHolidaySet(holSet)

        // Build report map keyed by userId — same source as Report tab (approved OT from overtime_requests)
        const reportArr = Array.isArray(reportData) ? reportData : (reportData?.rows ?? [])
        const reportMap = {}
        reportArr.forEach((r) => { reportMap[r.userId] = r })

        // per-staff summaries using report data (correct sources, matching Report tab exactly)
        const sums = staffOnly.map((user) => {
          const rep       = reportMap[user.id] ?? {}
          const workDays  = Number(rep.actualWorkDays ?? 0)
          const leaveDays = Number(rep.leavePaidDays  ?? 0)
          return {
            id:         user.id,
            workDays,
            leaveDays,
            totalWork:  workDays + leaveDays,
            absentDays: Number(rep.absentDays    ?? 0),
            lateCnt:    Number(rep.lateCount     ?? 0),
            earlyCnt:   Number(rep.earlyCount    ?? 0),
            otHours:    Number(rep.approvedOtHours ?? 0),
          }
        })
        setSummaries(sums)
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu xem trước', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    setSending(true)
    try {
      const res = await attendanceApi.sendAttendanceConfirmation({ month, year })
      setResult(res)
    } catch {
      addToast('Gửi email thất bại — kiểm tra cấu hình SMTP', 'error')
    } finally {
      setSending(false)
    }
  }

  const fmtT = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  return (
    <Modal title={`Gửi xác nhận chấm công — ${monthYear}`} onClose={onClose} wide>
      {result ? (
        /* ── Result screen ── */
        <div className={sa.confirmResult}>
          <CheckCircle2 size={48} className={sa.confirmResultIcon} />
          <h3 className={sa.confirmResultTitle}>Đã gửi email thành công!</h3>
          <div className={sa.confirmResultStats}>
            <div className={`${sa.confirmStat} ${sa.confirmStatSuccess}`}>
              <span className={sa.confirmStatNum}>{result.sent}</span>
              <span className={sa.confirmStatLbl}>Gửi thành công</span>
            </div>
            {result.failed > 0 && (
              <div className={`${sa.confirmStat} ${sa.confirmStatDanger}`}>
                <span className={sa.confirmStatNum}>{result.failed}</span>
                <span className={sa.confirmStatLbl}>Thất bại</span>
              </div>
            )}
          </div>
          <p className={sa.confirmResultNote}>
            Nhân viên đã nhận được bảng chấm công {monthYear} qua email và có thể xem lại chi tiết.
          </p>
          <button className={`${s.btnPrimary} ${s.btnShort}`} onClick={onClose}>Đóng</button>
        </div>
      ) : (
        <>
          {/* ── Header info ── */}
          <div className={sa.confirmHeader}>
            <div className={sa.confirmHeaderInfo}>
              <Mail size={18} className={sa.confirmHeaderIcon} />
              <div>
                <p className={sa.confirmHeaderTitle}>
                  Bảng chấm công chi tiết <strong>{monthYear}</strong> — sẽ gửi đến{' '}
                  <strong>{staffOnly.length} nhân viên</strong>
                </p>
                <p className={sa.confirmHeaderSub}>
                  Mỗi nhân viên nhận 1 email riêng chứa toàn bộ ngày công tháng này. Kiểm tra dữ liệu bên dưới rồi nhấn Gửi.
                </p>
              </div>
            </div>
          </div>

          {/* ── Attendance grid ── */}
          {loading ? (
            <div className={s.centered}>
              <Loader2 size={20} className={s.spin} /> Đang tải dữ liệu...
            </div>
          ) : (
            <div className={sa.confirmTableWrap}>
              <table className={sa.allStaffTable}>
                <thead>
                  <tr>
                    <th className={`${sa.allStaffNameHeader} ${sa.confirmNameHeader}`}>Nhân viên</th>
                    {days.map((d) => {
                      const dateStr  = `${year}-${pad(month)}-${pad(d)}`
                      const jsDay    = new Date(dateStr + 'T00:00:00').getDay()
                      const isWeekend = jsDay === 0 || jsDay === 6
                      const isToday  = dateStr === todayStr
                      return (
                        <th key={d} className={[
                          sa.allStaffDayHeader,
                          sa.confirmDayHeader,
                          isWeekend ? sa.allStaffDayHeaderWeekend : '',
                          isToday   ? sa.allStaffDayHeaderToday   : '',
                        ].filter(Boolean).join(' ')}>
                          <span className={sa.allStaffDayNum}>{d}</span>
                          <span className={sa.allStaffDayWeek}>{WEEK_NAMES[jsDay]}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {staffOnly.map((user) => {
                    const sum = summaries.find((sm) => sm.id === user.id) ?? {}
                    return (
                      <tr key={user.id}>
                        <td className={`${sa.allStaffNameCell} ${sa.confirmNameCell}`}>
                          <span className={sa.confirmNameText}>{user.name}</span>
                          {user.email
                            ? <span className={sa.confirmEmail}>{user.email}</span>
                            : <span className={sa.confirmNoEmail}>Chưa có email</span>}
                          <div className={sa.confirmNameStats}>
                            <span className={sa.confirmStatChip}>{Number(sum.workDays ?? 0).toFixed(1)} TT</span>
                            {(sum.leaveDays ?? 0) > 0 && <span className={`${sa.confirmStatChip} ${sa.confirmStatChipLeave}`}>{Number(sum.leaveDays).toFixed(1)} NP</span>}
                            <span className={`${sa.confirmStatChip} ${sa.confirmStatChipTotal}`}>{Number(sum.totalWork ?? 0).toFixed(1)} TC</span>
                            {(sum.absentDays ?? 0) > 0 && <span className={`${sa.confirmStatChip} ${sa.confirmStatChipDanger}`}>{sum.absentDays} vắng</span>}
                            {(sum.lateCnt ?? 0) > 0    && <span className={`${sa.confirmStatChip} ${sa.confirmStatChipWarn}`}>{sum.lateCnt} muộn</span>}
                            {(sum.earlyCnt ?? 0) > 0   && <span className={`${sa.confirmStatChip} ${sa.confirmStatChipWarn}`}>{sum.earlyCnt} sớm</span>}
                            {(sum.otHours ?? 0) > 0    && <span className={`${sa.confirmStatChip} ${sa.confirmStatChipOt}`}>OT {Number(sum.otHours).toFixed(1)}h</span>}
                          </div>
                        </td>
                        {days.map((d) => {
                          const dateStr   = `${year}-${pad(month)}-${pad(d)}`
                          const jsDay     = new Date(dateStr + 'T00:00:00').getDay()
                          const isWeekend = jsDay === 0 || jsDay === 6
                          const isFuture  = dateStr > todayStr
                          const isHoliday = holidaySet.has(dateStr)
                          let record = byUser[user.id]?.[dateStr] ?? null
                          if (!record && isHoliday) record = { status: 'holiday' }
                          const cfg         = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
                          const statusClass = record?.status ? sa[`allStaffStatus_${record.status}`] : ''
                          return (
                            <td key={d} className={[
                              sa.allStaffCell,
                              sa.confirmGridCell,
                              isWeekend ? sa.allStaffCellWeekend : '',
                              isFuture  ? sa.allStaffCellFuture  : '',
                              cfg       ? sa.allStaffCellFilled  : sa.allStaffCellEmpty,
                              statusClass,
                            ].filter(Boolean).join(' ')}>
                              {cfg && (
                                <div className={sa.confirmCellContent}>
                                  <span className={sa.allStaffChip}>{STATUS_SHORT[record.status] ?? ''}</span>
                                  {record?.checkInTime  && <span className={sa.confirmCellTime}>{fmtT(record.checkInTime)}</span>}
                                  {record?.checkOutTime && <span className={sa.confirmCellTime}>{fmtT(record.checkOutTime)}</span>}
                                  {record?.lateMinutes  > 0 && <span className={sa.allStaffNoteLate}>+{record.lateMinutes}p</span>}
                                  {record?.earlyMinutes > 0 && <span className={sa.allStaffNoteEarly}>-{record.earlyMinutes}p</span>}
                                  {(record?.otHours ?? 0) > 0 && <span className={sa.confirmCellOt}>OT {record.otHours.toFixed(1)}h</span>}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Footer ── */}
          <div className={sa.confirmFooter}>
            <button className={`${s.btnSecondary} ${s.btnShort}`} onClick={onClose} disabled={sending}>
              <X size={13} /> Huỷ
            </button>
            <button className={`${s.btnPrimary} ${s.btnShort}`} onClick={handleSend} disabled={loading || sending}>
              {sending
                ? <><Loader2 size={13} className={s.spin} /> Đang gửi...</>
                : <><SendHorizonal size={13} /> Gửi email ({staffOnly.length} nhân viên)</>}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function AdminDayModal({ dateStr, record, userId, onClose, onSaved }) {
  const addToast        = useToastStore((st) => st.toast)
  const [y, m, d]       = dateStr.split('-')
  const hasRecord       = record && !record.isHoliday   // virtual holiday records shouldn't be edited
  const cfg             = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null

  const [mode,       setMode]       = useState('view') // 'view' | 'edit'
  const [checkIn,    setCheckIn]    = useState(record?.checkInTime  ? fmtTime(record.checkInTime)  : '')
  const [checkOut,   setCheckOut]   = useState(record?.checkOutTime ? fmtTime(record.checkOutTime) : '')
  const [reason,     setReason]     = useState('')
  const [saving,     setSaving]     = useState(false)
  const [history,    setHistory]    = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  function loadHistory() {
    if (!hasRecord || !record.id) return
    setLoadingHist(true)
    attendanceApi.listRecordAdjustments(record.id)
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingHist(false))
  }

  useEffect(() => {
    if (showHistory) loadHistory()
  }, [showHistory]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!reason.trim()) { addToast('Vui lòng nhập lý do điều chỉnh', 'error'); return }
    if (!checkIn && !checkOut) { addToast('Vui lòng nhập ít nhất giờ vào hoặc giờ ra', 'error'); return }
    setSaving(true)
    try {
      if (hasRecord) {
        await attendanceApi.manualAdjustRecord(record.id, {
          checkInTime:  checkIn  || undefined,
          checkOutTime: checkOut || undefined,
          reason: reason.trim(),
        })
      } else {
        await attendanceApi.createManualRecord({
          userId, workDate: dateStr,
          checkInTime:  checkIn  || undefined,
          checkOutTime: checkOut || undefined,
          reason: reason.trim(),
        })
      }
      addToast('Đã lưu điều chỉnh chấm công', 'success')
      onSaved()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể lưu điều chỉnh', 'error')
    } finally { setSaving(false) }
  }

  const fieldLabel = (f) => f === 'check_in_time' ? 'Giờ vào' : f === 'check_out_time' ? 'Giờ ra' : f === 'status' ? 'Trạng thái' : f
  const fmtTs = (v) => { if (!v) return '—'; const t = new Date(v); return isNaN(t) ? String(v).slice(0,16) : t.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) }

  return (
    <Modal title={mode === 'edit' ? `Chỉnh sửa chấm công ${d}/${m}/${y}` : `Chi tiết ngày ${d}/${m}/${y}`} onClose={onClose}>
      <div className={`${s.detailPanel} ${s.detailPanelWide}`}>

        {mode === 'view' ? (
          <>
            {/* Status + edit button */}
            <div className={s.detailHeader}>
              {cfg ? (
                <div className={`${s.statusPill} ${getStatusClass(record.status)}`}>
                  {cfg.label}
                </div>
              ) : (
                <div className={s.detailEmpty}>Chưa có dữ liệu</div>
              )}
              {record?.isAdjusted && (
                <span className={`${s.statusPill} ${s.request_pending}`}>Đã điều chỉnh</span>
              )}
              <button
                onClick={() => setMode('edit')}
                className={`${s.btnSecondary} ${s.btnCompact}`}
              >
                <Pencil size={12} /> Chỉnh sửa
              </button>
            </div>

            {/* Times */}
            <div className={s.detailGrid}>
              {[
                ['GIỜ VÀO',    fmtTime(record?.checkInTime)  ?? '—'],
                ['GIỜ RA',     fmtTime(record?.checkOutTime) ?? '—'],
                record?.actualHours != null ? ['GIỜ THỰC TẾ', `${Number(record.actualHours).toFixed(1)}h`] : null,
                record?.lateMinutes  > 0    ? ['ĐI MUỘN',     `${record.lateMinutes} phút`]                : null,
                record?.earlyMinutes > 0    ? ['VỀ SỚM',      `${record.earlyMinutes} phút`]               : null,
                record?.workUnits    != null ? ['NGÀY CÔNG',   `${record.workUnits} công`]                  : null,
              ].filter(Boolean).map(([label, val]) => (
                <div key={label}>
                  <div className={s.detailLabel}>{label}</div>
                  <div className={s.detailValue}>{val}</div>
                </div>
              ))}
            </div>

            {record?.notes && (
              <div className={s.mutedNote}>{record.notes}</div>
            )}

            {/* History toggle */}
            {hasRecord && (
              <div className={s.mutedNote}>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className={s.historyToggle}
                >
                  {showHistory ? '▲ Ẩn lịch sử điều chỉnh' : '▼ Xem lịch sử điều chỉnh'}
                </button>
                {showHistory && (
                  <div className={s.historyBlock}>
                    {loadingHist ? (
                      <div className={s.historyLoading}>
                        <Loader2 size={13} className={s.spin} /> Đang tải...
                      </div>
                    ) : history.length === 0 ? (
                      <div className={s.historyEmpty}>Chưa có điều chỉnh nào</div>
                    ) : (
                      <div className={s.historyList}>
                        {history.map((h) => (
                          <div key={h.id} className={s.historyItem}>
                            <div className={s.historyTitle}>
                              {fieldLabel(h.fieldName)} — {h.adjusterName}
                              <span className={s.historyDate}>{fmtTs(h.adjustedAt)}</span>
                            </div>
                            <div className={s.historyText}>
                              {h.beforeValue ? fmtTs(h.beforeValue) : 'Chưa có'} → <strong>{fmtTs(h.afterValue)}</strong>
                            </div>
                            {h.reason && <div className={s.historyReason}>{h.reason}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className={s.modalFooter}>
              <button onClick={onClose} className={`${s.btnSecondary} ${s.btnShort}`}>
                Đóng
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Edit form */}
            <div className={s.infoNote}>
              {hasRecord ? 'Điều chỉnh giờ chấm công. Hệ thống sẽ tự tính lại trạng thái sau khi lưu.' : 'Tạo chấm công thủ công cho ngày này.'}
            </div>

            <div className={s.formGrid}>
              <div className={s.formGroup}>
                <label className={s.formLabel}>Giờ vào</label>
                <input
                  type="time"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={s.formInput}
                />
              </div>
              <div className={s.formGroup}>
                <label className={s.formLabel}>Giờ ra</label>
                <input
                  type="time"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={s.formInput}
                />
              </div>
            </div>

            <div className={s.formGroup}>
              <label className={`${s.formLabel} ${s.req}`}>
                Lý do điều chỉnh
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="VD: Nhân viên quên chấm công, đã xác nhận với quản lý..."
                rows={3}
                className={s.formTextarea}
              />
            </div>

            <div className={s.modalActions}>
              <button onClick={() => setMode('view')} disabled={saving} className={s.btnSecondary}>
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={s.btnPrimary}
              >
                {saving && <Loader2 size={13} className={s.spin} />}
                {saving ? 'Đang lưu...' : 'Lưu điều chỉnh'}
              </button>
            </div>
          </>
        )}
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
              <span className={s.sectionTitleMeta}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <ClipboardList size={32} className={s.emptyIcon} />
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
                  <th>Ghi chú Admin</th>
                  <th className={s.actionsCell}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = LEAVE_STATUS_CFG[req.status] ?? LEAVE_STATUS_CFG.pending
                  return (
                  <tr key={req.id}>
                    <td className={s.tableStrong}>{req.userName}</td>
                    <td>{LEAVE_TYPE[req.leaveType] ?? req.leaveType}</td>
                    <td>{fmtDateVI(req.startDate)}</td>
                    <td>{fmtDateVI(req.endDate)}</td>
                    <td className={s.tablePrimary}>{req.totalDays > 0 ? req.totalDays : countWeekdays(req.startDate, req.endDate)} ngày</td>
                    <td>
                      <span className={`${s.statusPill} ${getRequestStatusClass(req.status)}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className={s.tableReason}>{req.reason ?? '—'}</td>
                    <td className={s.adminNoteCell}>
                      {req.status === 'rejected' && req.rejectionNote
                        ? <span className={s.adminNoteReject}>{req.rejectionNote}</span>
                        : req.status === 'approved' && req.approvalNote
                          ? <span className={s.adminNoteApprove}>{req.approvalNote}</span>
                          : <span className={s.tableMuted}>—</span>
                      }
                    </td>
                    <td>
                      {req.status === 'pending' && (
                        <button
                          className={`${s.btnSuccess} ${s.btnCompact}`}
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
      await attendanceApi.approveLeaveRequest(request.id, { approvalNote: note || undefined })
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
      await attendanceApi.rejectLeaveRequest(request.id, { rejectionNote: note || undefined })
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
        <div className={s.reviewCard}>
          <p className={s.reviewCardTitle}>{request.userName}</p>
          <p className={s.reviewCardText}>{LEAVE_TYPE[request.leaveType] ?? request.leaveType}</p>
          <p className={s.reviewCardText}>
            {fmtDateVI(request.startDate)} → {fmtDateVI(request.endDate)} ({request.totalDays > 0 ? request.totalDays : countWeekdays(request.startDate, request.endDate)} ngày)
          </p>
          {request.reason && (
            <p className={s.reviewCardNote}>{request.reason}</p>
          )}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú (khi duyệt hoặc từ chối)</label>
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
              <span className={s.sectionTitleMeta}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <Clock size={32} className={s.emptyIcon} />
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
                  <th>Ghi chú Admin</th>
                  <th className={s.actionsCell}>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = OT_STATUS_CFG[req.status] ?? OT_STATUS_CFG.pending
                  return (
                  <tr key={req.id}>
                    <td className={s.tableStrong}>{req.userName}</td>
                    <td>{fmtDateVI(req.otDate)}</td>
                    <td className={s.tableSemibold}>{req.startTime ?? '—'}</td>
                    <td className={s.tableSemibold}>{req.endTime ?? '—'}</td>
                    <td className={s.tablePurple}>
                      {req.otHours != null ? `${Number(req.otHours).toFixed(1)}h` : '—'}
                    </td>
                    <td>
                      <span className={`${s.statusPill} ${getRequestStatusClass(req.status)}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className={s.tableReason}>{req.reason ?? '—'}</td>
                    <td className={s.adminNoteCell}>
                      {req.status === 'rejected' && req.rejectionNote
                        ? <span className={s.adminNoteReject}>{req.rejectionNote}</span>
                        : req.status === 'approved' && req.approvalNote
                          ? <span className={s.adminNoteApprove}>{req.approvalNote}</span>
                          : <span className={s.tableMuted}>—</span>
                      }
                    </td>
                    <td>
                      {req.status === 'pending' && (
                        <button
                          className={`${s.btnSuccess} ${s.btnCompact}`}
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
      await attendanceApi.approveOvertimeRequest(request.id, { approvalNote: note || undefined })
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
        <div className={`${s.reviewCard} ${s.reviewCardPurple}`}>
          <p className={s.reviewCardTitle}>{request.userName}</p>
          <p className={s.reviewCardText}>
            Ngày: {fmtDateVI(request.otDate)} · {request.startTime} – {request.endTime}
          </p>
          {request.otHours != null && (
            <p className={s.reviewCardMetric}>
              {Number(request.otHours).toFixed(1)} giờ tăng ca
            </p>
          )}
          {request.reason && (
            <p className={s.reviewCardNote}>{request.reason}</p>
          )}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú (khi duyệt hoặc từ chối)</label>
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



// ── AttendanceBarChart ────────────────────────────────────────────────────────

function AttendanceBarChart({ rows }) {
  const chartData = rows.map((r) => {
    const work   = Number(r.actualWorkDays  ?? r.workDays  ?? 0)
    const leave  = Number(r.leavePaidDays   ?? r.leaveDays ?? 0)
    const absent = Number(r.absentDays ?? 0)
    const late   = Number(r.lateCount  ?? r.lateDays ?? 0)
    const name   = r.userName ?? r.name ?? ''
    return { name, work, leave, absent, late }
  })

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const item  = chartData.find((d) => d.name === label) ?? {}
    const total = (item.work ?? 0) + (item.leave ?? 0)
    const rate  = total > 0 ? Math.round(((item.work ?? 0) / total) * 100) : 0
    return (
      <div className={sa.chartTooltip}>
        <p className={sa.chartTooltipTitle}>{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.fill, margin: '2px 0', fontSize: 12 }}>
            {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
          </p>
        ))}
        <p className={sa.chartTooltipRate}>Tỉ lệ đi làm: <strong>{rate}%</strong></p>
      </div>
    )
  }

  return (
    <div className={`${s.section} ${sa.chartSection}`}>
      <div className={s.sectionHead}>
        <h4 className={sa.reportTableTitle}>Biểu đồ Hiệu Suất Chấm Công</h4>
        <span className={sa.reportMeta}>{rows.length} nhân viên</span>
      </div>
      <div className={sa.chartWrap}>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, left: -8, bottom: 64 }}
            barCategoryGap="18%"
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="name"
              angle={-35}
              textAnchor="end"
              interval={0}
              height={80}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={true}
              width={32}
            />
            <RechartTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
            <Legend
              iconType="rect"
              iconSize={10}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Bar dataKey="work"   name="Ngày công TT"  fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={52} />
            <Bar dataKey="leave"  name="Nghỉ có lương" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={52} />
            <Bar dataKey="absent" name="Vắng mặt"      fill="#dc2626" radius={[3, 3, 0, 0]} maxBarSize={52} />
            <Bar dataKey="late"   name="Lần đi muộn"   fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={52} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
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

  async function handleExportExcel() {
    if (rows.length === 0) return
    try {
      const response = await attendanceApi.exportAttendanceReport({ month, year })
      const url  = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href     = url
      link.download = `BaoCao_ChamCong_T${String(month).padStart(2,'0')}_${year}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      addToast('Không thể xuất Excel', 'error')
    }
  }

  // Aggregated totals + derived metrics
  const totals = useMemo(() => {
    if (!rows.length) return null
    return rows.reduce((acc, r) => {
      const work  = Number(r.actualWorkDays ?? r.workDays ?? 0)
      const leave = Number(r.leavePaidDays  ?? r.leaveDays ?? 0)
      return {
        employees: acc.employees + 1,
        workDays:  acc.workDays  + work,
        leaveDays: acc.leaveDays + leave,
        total:     acc.total     + work + leave,
        absent:    acc.absent    + Number(r.absentDays ?? 0),
        late:      acc.late      + Number(r.lateCount  ?? r.lateDays ?? 0),
        early:     acc.early     + Number(r.earlyCount ?? 0),
        otHours:   acc.otHours   + Number(r.approvedOtHours ?? 0),
        perfect:   acc.perfect   + (Number(r.absentDays ?? 0) === 0 && Number(r.lateCount ?? 0) === 0 ? 1 : 0),
      }
    }, { employees: 0, workDays: 0, leaveDays: 0, total: 0, absent: 0, late: 0, early: 0, otHours: 0, perfect: 0 })
  }, [rows])

  return (
    <>
      {/* Header */}
      <div className={sa.reportHeader}>
        <h3 className={s.sectionTitle}>Báo cáo chấm công — {monthName(year, month)}</h3>
        <div className={sa.reportActions}>
          <button
            className={`${s.btnSecondary} ${s.btnShort}`}
            onClick={handleExportExcel}
            disabled={rows.length === 0}
          >
            <Download size={13} /> Xuất Excel
          </button>
          <button
            className={`${s.btnPrimary} ${s.btnShort}`}
            onClick={() => setShowSync(true)}
          >
            <RefreshCw size={13} /> Đồng bộ Bảng Lương
          </button>
        </div>
      </div>

      {loading ? (
        <div className={s.section}>
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        </div>
      ) : rows.length === 0 ? (
        <div className={s.section}>
          <div className={s.centered}>
            <BarChart3 size={32} className={s.emptyIcon} />
            Chưa có dữ liệu báo cáo tháng này
          </div>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          {totals && (
            <div className={sa.reportStats}>
              <div className={sa.reportStat}>
                <div className={sa.reportStatNum}>{totals.employees}</div>
                <div className={sa.reportStatLbl}>Nhân viên</div>
              </div>
              <div className={`${sa.reportStat} ${sa.reportStatSuccess}`}>
                <div className={sa.reportStatNum}>{totals.total.toFixed(1)}</div>
                <div className={sa.reportStatLbl}>Tổng công (ngày)</div>
              </div>
              <div className={`${sa.reportStat} ${sa.reportStatPrimary}`}>
                <div className={sa.reportStatNum}>{totals.leaveDays.toFixed(1)}</div>
                <div className={sa.reportStatLbl}>Nghỉ có lương</div>
              </div>
              <div className={`${sa.reportStat} ${totals.absent > 0 ? sa.reportStatDanger : ''}`}>
                <div className={sa.reportStatNum}>{totals.absent}</div>
                <div className={sa.reportStatLbl}>Vắng không phép</div>
              </div>
              <div className={`${sa.reportStat} ${totals.late > 0 ? sa.reportStatWarning : ''}`}>
                <div className={sa.reportStatNum}>{totals.late}</div>
                <div className={sa.reportStatLbl}>Lần đi muộn</div>
              </div>
              <div className={`${sa.reportStat} ${sa.reportStatPurple}`}>
                <div className={sa.reportStatNum}>{totals.otHours.toFixed(1)}h</div>
                <div className={sa.reportStatLbl}>Tổng giờ OT</div>
              </div>
              <div className={`${sa.reportStat} ${sa.reportStatGreen}`}>
                <div className={sa.reportStatNum}>{totals.perfect}</div>
                <div className={sa.reportStatLbl}>Chuyên cần</div>
              </div>
            </div>
          )}

          {/* Detail table */}
          <div className={s.section}>
            <div className={s.sectionHead}>
              <h4 className={sa.reportTableTitle}>Chi tiết theo nhân viên</h4>
              <span className={sa.reportMeta}>{rows.length} nhân viên</span>
            </div>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Chức danh</th>
                    <th className={s.summarySuccess}>Ngày công TT</th>
                    <th className={s.summaryPrimary}>Nghỉ (TL)</th>
                    <th>Tổng công</th>
                    <th className={s.summaryDanger}>Vắng</th>
                    <th className={s.summaryWarning}>Đi muộn</th>
                    <th className={s.detailValueWarningDark}>Về sớm</th>
                    <th className={s.summaryPurple}>OT đã duyệt (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const work  = Number(r.actualWorkDays ?? r.workDays ?? 0)
                    const leave = Number(r.leavePaidDays  ?? r.leaveDays ?? 0)
                    const total = work + leave
                    const absent = Number(r.absentDays ?? 0)
                    const late   = Number(r.lateCount ?? r.lateDays ?? 0)
                    const ot     = Number(r.approvedOtHours ?? 0)
                    const isPerfect = absent === 0 && late === 0
                    return (
                      <tr key={r.userId ?? i} className={isPerfect ? sa.reportRowPerfect : ''}>
                        <td>
                          <div className={sa.reportEmployee}>
                            <span className={s.tableStrong}>{r.userName ?? r.name}</span>
                            {isPerfect && <span className={sa.perfectBadge}>Chuyên cần</span>}
                          </div>
                        </td>
                        <td className={s.tableMuted}>{r.jobTitle ?? '—'}</td>
                        <td className={s.tableSuccess}>{work.toFixed(1)}</td>
                        <td className={leave > 0 ? s.tablePrimary : s.tableMuted}>{leave.toFixed(1)}</td>
                        <td className={s.tableSemibold}>{total.toFixed(1)}</td>
                        <td className={absent > 0 ? s.tableDanger : s.tableMuted}>{absent}</td>
                        <td className={late > 0 ? s.tableWarning : s.tableMuted}>{late}</td>
                        <td className={s.tableMuted}>{r.earlyCount ?? 0}</td>
                        <td className={ot > 0 ? s.tablePurple : s.tableMuted}>{ot.toFixed(1)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr className={s.tableTotalRow}>
                      <td colSpan={2} className={s.tableTotalLabel}>Tổng cộng</td>
                      <td className={s.tableSuccess}>{totals.workDays.toFixed(1)}</td>
                      <td className={s.tableBold}>{totals.leaveDays.toFixed(1)}</td>
                      <td className={s.tableSemibold}>{totals.total.toFixed(1)}</td>
                      <td className={totals.absent > 0 ? s.tableDanger : s.tableMuted}>{totals.absent}</td>
                      <td className={totals.late > 0 ? s.tableWarning : s.tableMuted}>{totals.late}</td>
                      <td className={s.tableMuted}>{totals.early}</td>
                      <td className={s.tablePurple}>{totals.otHours.toFixed(1)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Attendance efficiency bar chart */}
          <AttendanceBarChart rows={rows} />
        </>
      )}

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
      const result = await attendanceApi.syncPayroll(selected)
      const warn = result?.warnings?.length ?? 0
      addToast(
        `Đồng bộ thành công ${result?.updatedCount ?? 0} nhân viên${warn > 0 ? ` — ${warn} cảnh báo chấm công` : ''}`,
        'success'
      )
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
        <div className={sa.syncWarning}>
          Dữ liệu chấm công tháng {month}/{year} sẽ được ghi vào mục
          <strong> attendance_summary</strong> trong kỳ lương đã chọn.
          Thao tác này có thể ghi đè dữ liệu cũ nếu đã sync trước đó.
        </div>

        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Chọn kỳ lương</label>
          {loading ? (
            <div className={s.historyLoading}>
              <Loader2 size={13} className={s.spin} />
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
          <div className={s.dangerText}>
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

      <div className={sa.settingsBody}>

        {/* Default shift config */}
        <div className={sa.settingsGroup}>
          <div className={sa.settingsHeading}>
            Ca làm việc mặc định (Thứ 2 – Thứ 6)
          </div>
          <div className={sa.settingsHelp}>
            Ca áp dụng cho toàn bộ nhân viên vào các ngày thường. Hệ thống tự động dùng ca này để tính chấm công mà không cần tạo lịch riêng.
          </div>
          <div className={s.formGroup}>
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
            <div className={sa.settingsInfo}>
              Ca <strong>{selectedDefault.name}</strong> — {selectedDefault.requiredHours ?? '?'}h/ngày.
              {selectedDefault.requiredHours < 8
                ? ' Nhân viên đủ giờ sẽ được tính 0.5 ngày công.'
                : ' Nhân viên đủ giờ sẽ được tính 1 ngày công đầy đủ.'}
            </div>
          )}
        </div>

        {/* Saturday config */}
        <div className={sa.settingsGroup}>
          <div className={sa.settingsHeading}>
            Quy định Thứ 7
          </div>

          <label className={`${sa.modeCard} ${mode === 'dayoff' ? sa.modeCardActive : ''}`}>
            <input
              type="radio"
              name="saturday-mode"
              value="dayoff"
              checked={mode === 'dayoff'}
              onChange={() => setMode('dayoff')}
              className={sa.radioInput}
            />
            <div>
              <div className={sa.modeTitle}>
                Thứ 7 là ngày nghỉ
              </div>
              <div className={sa.modeDesc}>
                Không phát sinh chấm công Thứ 7
              </div>
            </div>
          </label>

          <label className={`${sa.modeCard} ${mode === 'workday' ? sa.modeCardActive : ''}`}>
            <input
              type="radio"
              name="saturday-mode"
              value="workday"
              checked={mode === 'workday'}
              onChange={() => setMode('workday')}
              className={sa.radioInput}
            />
            <div>
              <div className={sa.modeTitle}>
                Thứ 7 là ngày đi làm
              </div>
              <div className={sa.modeDesc}>
                Chọn ca làm việc (nửa ngày hoặc cả ngày) để áp dụng cho Thứ 7
              </div>
            </div>
          </label>

          {mode === 'workday' && (
            <div className={s.formGroup}>
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
                <div className={sa.settingsInfo}>
                  Ca <strong>{selectedSatShift.name}</strong> — {selectedSatShift.requiredHours ?? '?'}h/ngày.
                  {selectedSatShift.requiredHours < 8
                    ? ' Nhân viên đủ giờ sẽ được tính 0.5 ngày công.'
                    : ' Nhân viên đủ giờ sẽ được tính 1 ngày công đầy đủ.'}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={sa.settingsFooter}>
          <button
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={saving}
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

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>
          <Terminal size={16} />
          Dev Tools — Giả lập chấm công
          <span className={sa.devBadge}>DEV ONLY</span>
        </h3>
      </div>

      <div className={sa.devToolsBody}>

        {/* Section A */}
        <div className={sa.devPanel}>
          <div className={sa.devPanelTitle}>A — Giả lập 1 ngày, 1 nhân viên</div>

          <div className={sa.devRow}>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Nhân viên</span>
              <select value={dayUserId} onChange={(e) => setDayUserId(e.target.value)} className={`${s.formSelect} ${sa.selectWide}`}>
                <option value="">-- Chọn nhân viên --</option>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Ngày</span>
              <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} className={s.formInput} />
            </div>
            {!dayAbsent && (
              <>
                <div className={sa.devField}>
                  <span className={sa.devLabel}>Giờ vào</span>
                  <input type="time" value={dayIn} onChange={(e) => setDayIn(e.target.value)} className={`${s.formInput} ${sa.inputTime}`} />
                </div>
                <div className={sa.devField}>
                  <span className={sa.devLabel}>Giờ ra</span>
                  <input type="time" value={dayOut} onChange={(e) => setDayOut(e.target.value)} className={`${s.formInput} ${sa.inputTime}`} />
                </div>
              </>
            )}
            <div className={sa.devField}>
              <span className={sa.devLabel}>&nbsp;</span>
              <label className={sa.devCheck}>
                <input type="checkbox" checked={dayAbsent} onChange={(e) => setDayAbsent(e.target.checked)} className={sa.devAccentInput} />
                Vắng mặt
              </label>
            </div>
            <div className={sa.devField}>
              <span className={sa.devLabel}>&nbsp;</span>
              <button className={`${s.btnPrimary} ${sa.devPrimaryButton}`} onClick={handleSimDay} disabled={dayLoading}>
                {dayLoading ? <Loader2 size={13} className={s.spin} /> : null}
                {dayLoading ? 'Đang chạy...' : 'Giả lập ngày này'}
              </button>
            </div>
          </div>

          {dayResult && (
            <div className={sa.devResult}>
              Kết quả: <strong>{dayResult.status}</strong> |
              Vào: {dayResult.checkInTime ? fmtTime(dayResult.checkInTime) : '—'} |
              Ra: {dayResult.checkOutTime ? fmtTime(dayResult.checkOutTime) : '—'} |
              Muộn: {dayResult.lateMinutes ?? 0} phút |
              Sớm: {dayResult.earlyMinutes ?? 0} phút |
              Ngày công: {dayResult.workUnits ?? 0}
            </div>
          )}
        </div>

        {/* Section B */}
        <div className={sa.devPanel}>
          <div className={sa.devPanelTitle}>B — Giả lập cả tháng</div>

          <div className={sa.devRow}>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Nhân viên</span>
              <select value={mthUserId} onChange={(e) => setMthUserId(e.target.value)} className={`${s.formSelect} ${sa.selectWide}`}>
                <option value="all">Tất cả nhân viên</option>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Tháng</span>
              <select value={mthMonth} onChange={(e) => setMthMonth(e.target.value)} className={`${s.formSelect} ${sa.selectNarrow}`}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>Tháng {m}</option>
                ))}
              </select>
            </div>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Năm</span>
              <select value={mthYear} onChange={(e) => setMthYear(e.target.value)} className={`${s.formSelect} ${sa.selectNarrow}`}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div className={sa.devField}>
              <span className={sa.devLabel}>Kịch bản</span>
              <div className={sa.scenarioList}>
                {['perfect', 'normal', 'mixed'].map((sc) => (
                  <label key={sc} className={`${sa.scenarioOption} ${mthScenario === sc ? sa.scenarioOptionActive : ''}`}>
                    <input type="radio" name="sim-scenario" value={sc} checked={mthScenario === sc} onChange={() => setMthScenario(sc)} className={sa.devAccentInput} />
                    {sc === 'perfect' ? 'Perfect' : sc === 'normal' ? 'Normal' : 'Mixed'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className={sa.devRow}>
            <button className={s.btnSecondary} onClick={handleClear} disabled={clrLoading}>
              {clrLoading ? <Loader2 size={13} className={s.spin} /> : <X size={13} />}
              Xóa data tháng này
            </button>
            <button className={`${s.btnPrimary} ${sa.devPrimaryButton}`} onClick={handleSimMonth} disabled={mthLoading}>
              {mthLoading ? <Loader2 size={13} className={s.spin} /> : null}
              {mthLoading ? 'Đang giả lập...' : 'Giả lập cả tháng'}
            </button>
          </div>

          {mthResult && (
            <div className={sa.devResult}>
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
