import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, Loader2, CalendarDays,
  ClipboardList, BarChart3, Check, X, Plus, Clock,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import s from './Attendance.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'calendar',  label: 'Lịch chấm công', icon: CalendarDays },
  { id: 'leave',     label: 'Đơn nghỉ phép',  icon: ClipboardList },
  { id: 'overtime',  label: 'Đơn tăng ca',    icon: Clock },
  { id: 'summary',   label: 'Tổng hợp',       icon: BarChart3 },
]

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
  unscheduled:    { label: 'Ngoài lịch', bg: 'var(--color-bg-soft)', color: 'var(--color-muted-soft)', border: 'var(--color-border)', dashed: true },
}

const LEAVE_TYPE = {
  annual:        'Nghỉ phép năm',
  sick:          'Nghỉ ốm',
  compensatory:  'Nghỉ bù',
  unpaid:        'Nghỉ không lương',
  business_trip: 'Công tác',
  wfh:           'Làm từ xa',
}

const LEAVE_STATUS = {
  pending:   { label: 'Chờ duyệt', bg: 'var(--color-accent-bg-soft)', color: 'var(--color-warning-amber)' },
  approved:  { label: 'Đã duyệt',  bg: 'var(--color-success-bg-soft)', color: 'var(--color-success-dark)' },
  rejected:  { label: 'Từ chối',   bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
  cancelled: { label: 'Đã huỷ',    bg: 'var(--color-surface-muted)', color: 'var(--color-muted)' },
}

const OT_STATUS = {
  pending:  { label: 'Chờ duyệt', bg: 'var(--color-accent-bg-soft)', color: 'var(--color-warning-amber)' },
  approved: { label: 'Đã duyệt',  bg: 'var(--color-success-bg-soft)', color: 'var(--color-success-dark)' },
  rejected: { label: 'Từ chối',   bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' },
}

const DAY_NAMES = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

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

function fmtTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateVI(iso) {
  if (!iso) return '—'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
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

function buildCalendar(year, month, recordMap) {
  const first      = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const startOffset = (first.getDay() + 6) % 7 // Mon=0 … Sun=6
  const totalCells  = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startOffset + 1
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ type: 'empty', key: `e-${i}` })
    } else {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      const jsDay   = new Date(dateStr + 'T00:00:00').getDay() // 0=Sun, 6=Sat
      cells.push({
        type:      'day',
        key:       dateStr,
        dateStr,
        dayNum,
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

export default function Attendance() {
  const user    = useAuthStore((st) => st.user)
  const isAdmin = user?.role === 'admin'
  const now     = new Date()

  const [activeTab, setActiveTab] = useState('calendar')
  const [year,      setYear]      = useState(now.getFullYear())
  const [month,     setMonth]     = useState(now.getMonth() + 1)

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const visibleTabs  = isAdmin ? TABS : TABS.filter((t) => t.id !== 'summary')
  const targetUserId = user?.id

  return (
    <AppLayout>
      <div className={s.page}>

        <div className={s.pageHeader}>
          <div>
            <h2 className={s.pageTitle}>Chấm công & Nghỉ phép</h2>
            <p className={s.pageSubtitle}>Quản lý chấm công và đơn xin nghỉ phép</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className={s.tabBar}>
          {visibleTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`${s.tab} ${activeTab === id ? s.tabActive : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className={s.filterBar}>
          <div className={s.monthNav}>
            <button className={s.iconBtn} onClick={prevMonth}><ChevronLeft size={14} /></button>
            <span className={s.monthLabel}>{monthName(year, month)}</span>
            <button className={s.iconBtn} onClick={nextMonth}><ChevronRight size={14} /></button>
          </div>
        </div>

        {activeTab === 'calendar' && (
          <CalendarTab
            year={year}
            month={month}
            userId={targetUserId}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'leave' && (
          <LeaveTab
            isAdmin={isAdmin}
            year={year}
            month={month}
            userId={targetUserId}
          />
        )}
        {activeTab === 'overtime' && (
          <OvertimeTab
            year={year}
            month={month}
            userId={targetUserId}
            isAdmin={isAdmin}
          />
        )}
        {activeTab === 'summary' && isAdmin && (
          <SummaryTab year={year} month={month} userId={targetUserId} />
        )}

      </div>
    </AppLayout>
  )
}

// ── CalendarTab ───────────────────────────────────────────────────────────────

function CalendarTab({ year, month, userId, isAdmin }) {
  const addToast = useToastStore((st) => st.toast)
  const [records,        setRecords]        = useState([])
  const [loading,        setLoading]        = useState(true)
  const [selectedDay,    setSelectedDay]    = useState(null)
  const [totalApprovedOt, setTotalApprovedOt] = useState(0)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    const requests = [attendanceApi.listAttendanceRecords({ userId, month, year, limit: 31 })]
    if (!isAdmin) requests.push(attendanceApi.listOvertimeRequests({ userId, from, to, status: 'approved', limit: 500 }))
    Promise.all(requests)
      .then(([attRes, otRes]) => {
        if (cancelled) return
        setRecords(attRes.records ?? [])
        if (otRes) {
          const all = otRes.requests ?? otRes.data ?? []
          setTotalApprovedOt(all.reduce((sum, r) => sum + (Number(r.otHours) || 0), 0))
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu chấm công', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, month, year, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  const recordMap = useMemo(() => {
    const m = {}
    records.forEach((r) => { m[String(r.workDate).slice(0, 10)] = r })
    return m
  }, [records])

  const cells = useMemo(() => buildCalendar(year, month, recordMap), [year, month, recordMap])

  const summary = useMemo(() => {
    let workDays = 0, leaveDays = 0, absentDays = 0, lateCnt = 0, otHours = 0
    records.forEach((r) => {
      if (['present', 'late', 'early_leave', 'late_and_early', 'wfh', 'business_trip'].includes(r.status)) workDays++
      if (r.status === 'on_leave')                                     leaveDays++
      if (r.status === 'absent')                                       absentDays++
      if (r.status === 'late' || r.status === 'late_and_early')        lateCnt++
      otHours += r.otHours ?? 0
    })
    return { workDays, leaveDays, absentDays, lateCnt, otHours }
  }, [records])

  return (
    <>
      {/* Admin notice */}
      {isAdmin && (
        <div className={s.adminNotice}>
          <span className={s.noticeIcon}>✓</span>
          Tài khoản quản trị viên được hệ thống tự động ghi nhận đủ công — không cần chấm công thủ công.
        </div>
      )}

      {/* Summary bar */}
      {!loading && records.length > 0 && (
        <div className={s.summaryBar}>
          <div className={s.summaryItem}>
            <span className={`${s.summaryVal} ${s.summarySuccess}`}>{summary.workDays}</span>
            <span className={s.summaryLbl}>Ngày công</span>
          </div>
          <div className={s.summarySep} />
          <div className={s.summaryItem}>
            <span className={`${s.summaryVal} ${s.summaryPrimary}`}>{summary.leaveDays}</span>
            <span className={s.summaryLbl}>Nghỉ phép</span>
          </div>
          <div className={s.summarySep} />
          <div className={s.summaryItem}>
            <span className={`${s.summaryVal} ${s.summaryDanger}`}>{summary.absentDays}</span>
            <span className={s.summaryLbl}>Vắng mặt</span>
          </div>
          <div className={s.summarySep} />
          <div className={s.summaryItem}>
            <span className={`${s.summaryVal} ${s.summaryWarning}`}>{summary.lateCnt}</span>
            <span className={s.summaryLbl}>Lần muộn</span>
          </div>
          {!isAdmin && (
            <>
              <div className={s.summarySep} />
              <div className={s.summaryItem}>
                <span className={`${s.summaryVal} ${s.summaryPurple}`}>{totalApprovedOt.toFixed(1)}h</span>
                <span className={s.summaryLbl}>OT duyệt</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className={`${s.section} ${s.calendarSectionEnhanced}`}>
        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : (
          <>
            <div className={`${s.calendarGrid} ${s.calendarGridEnhanced}`}>
              {/* Day headers */}
              {DAY_NAMES.map((d) => (
                <div key={d} className={`${s.calendarCell} ${s.calendarHeaderCell}`}>{d}</div>
              ))}

              {/* Day cells */}
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
                      s.calendarCell,
                      s.calendarDay,
                      s.calendarDayEnhanced,
                      isToday   ? s.calendarDayToday   : '',
                      isFuture  ? s.calendarDayFuture  : '',
                      isWeekend ? s.calendarDayWeekend : '',
                      record    ? s.calendarDayHasRecord : '',
                      record    ? s.calendarDayFilledEnhanced : '',
                      statusClass ? s.calendarStatus : '',
                      statusClass,
                    ].filter(Boolean).join(' ')}
                    onClick={() => record && setSelectedDay({ dateStr, record })}
                    title={cfg?.label}
                  >
                    <span
                      className={`${s.calendarDayNum} ${isToday ? s.calendarDayNumToday : ''}`}
                    >
                      {dayNum}
                    </span>
                    {cfg && (
                      <span className={`${s.calendarDayLabel} ${s.calendarLabelEnhanced}`}>
                        {cfg.label}
                      </span>
                    )}
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
                      <span className={`${s.calendarDayTime} ${s.calendarTimeEnhanced}`}>
                        <span className={s.calendarTimePrefix}>In</span>
                        {fmtTime(record.checkInTime)}
                      </span>
                    )}
                    {record?.checkOutTime && (
                      <span className={`${s.calendarDayTime} ${s.calendarTimeEnhanced}`}>
                        <span className={s.calendarTimePrefix}>Out</span>
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

      {selectedDay && (
        <DayDetailModal
          dateStr={selectedDay.dateStr}
          record={selectedDay.record}
          isAdmin={isAdmin}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  )
}

// ── DayDetailModal ────────────────────────────────────────────────────────────

function DayDetailModal({ dateStr, record, onClose }) {
  const cfg = record ? (STATUS_CFG[record.status] ?? STATUS_CFG.unscheduled) : null
  const [y, m, d] = dateStr.split('-')

  return (
    <Modal title={`Chi tiết ngày ${d}/${m}/${y}`} onClose={onClose}>
      <div className={s.detailPanel}>
        {!record ? (
          <div className={s.detailEmpty}>
            Không có dữ liệu chấm công ngày này
          </div>
        ) : (
          <>
            <div className={`${s.statusPill} ${getStatusClass(record.status)}`}>
              {cfg?.label}
            </div>

            <div className={s.detailGrid}>
              <div>
                <div className={s.detailLabel}>GIỜ VÀO</div>
                <div className={s.detailValue}>{fmtTime(record.checkInTime) ?? '—'}</div>
              </div>
              <div>
                <div className={s.detailLabel}>GIỜ RA</div>
                <div className={s.detailValue}>{fmtTime(record.checkOutTime) ?? '—'}</div>
              </div>
              {record.actualHours != null && (
                <div>
                  <div className={s.detailLabel}>GIỜ THỰC TẾ</div>
                  <div className={s.detailValue}>{Number(record.actualHours).toFixed(1)}h</div>
                </div>
              )}
              {record.lateMinutes > 0 && (
                <div>
                  <div className={s.detailLabel}>ĐI MUỘN</div>
                  <div className={`${s.detailValue} ${s.detailValueWarning}`}>{record.lateMinutes} phút</div>
                </div>
              )}
              {record.earlyMinutes > 0 && (
                <div>
                  <div className={s.detailLabel}>VỀ SỚM</div>
                  <div className={`${s.detailValue} ${s.detailValueWarningDark}`}>{record.earlyMinutes} phút</div>
                </div>
              )}
              {record.otHours > 0 && (
                <div>
                  <div className={s.detailLabel}>OT</div>
                  <div className={`${s.detailValue} ${s.detailValuePurple}`}>{Number(record.otHours).toFixed(1)}h</div>
                </div>
              )}
              <div>
                <div className={s.detailLabel}>NGÀY CÔNG</div>
                <div className={s.detailValue}>{Number(record.workUnits ?? 0).toFixed(1)}</div>
              </div>
            </div>

            {record.shiftName && (
              <div className={s.infoNote}>
                Ca: {record.shiftName}
              </div>
            )}

            {record.notes && (
              <div className={s.mutedNote}>
                {record.notes}
              </div>
            )}

            {record.isAdjusted && (
              <div className={s.adjustedNote}>
                Đã điều chỉnh
              </div>
            )}
          </>
        )}
        <div className={s.modalFooter}>
          <button onClick={onClose} className={`${s.btnSecondary} ${s.btnShort}`}>
            Đóng
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── LeaveTab ──────────────────────────────────────────────────────────────────

function LeaveTab({ isAdmin, year, month, userId }) {
  const addToast = useToastStore((st) => st.toast)
  const [requests,     setRequests]     = useState([])
  const [pagination,   setPagination]   = useState({ total: 0, totalPages: 1 })
  const [page,         setPage]         = useState(1)
  const [loading,      setLoading]      = useState(true)
  const [showForm,     setShowForm]     = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listLeaveRequests({ userId, from, to, page, limit: 20 })
      .then((res) => {
        if (!cancelled) {
          setRequests(res.requests ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn nghỉ phép', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, from, to, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  async function handleCancel(id) {
    try {
      await attendanceApi.cancelLeaveRequest(id)
      addToast('Đã huỷ đơn nghỉ phép', 'success')
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể huỷ', 'error')
    }
  }

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn nghỉ phép — {monthName(year, month)}
            {!loading && (
              <span className={s.sectionTitleMeta}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
          <button className={s.btnPrimary} onClick={() => setShowForm(true)}>
            <Plus size={13} /> Tạo đơn xin nghỉ
          </button>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <ClipboardList size={32} className={s.emptyIcon} />
            Chưa có đơn nghỉ phép tháng này
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {isAdmin && <th>Nhân viên</th>}
                  <th>Loại nghỉ</th>
                  <th>Từ ngày</th>
                  <th>Đến ngày</th>
                  <th>Số ngày</th>
                  <th>Lý do</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú Admin</th>
                  <th className={s.actionsCell} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = LEAVE_STATUS[req.status] ?? LEAVE_STATUS.pending
                  return (
                    <tr key={req.id}>
                      {isAdmin && <td className={s.tableStrong}>{req.userName}</td>}
                      <td>{LEAVE_TYPE[req.leaveType] ?? req.leaveType}</td>
                      <td>{fmtDateVI(req.startDate)}</td>
                      <td>{fmtDateVI(req.endDate)}</td>
                      <td className={s.tablePrimary}>{req.totalDays > 0 ? req.totalDays : countWeekdays(req.startDate, req.endDate)} ngày</td>
                      <td className={s.tableReason}>{req.reason ?? '—'}</td>
                      <td>
                        <span className={`${s.statusPill} ${getRequestStatusClass(req.status)}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className={s.adminNoteCell}>
                        {req.status === 'rejected' && req.rejectionNote
                          ? <span className={s.adminNoteReject}>{req.rejectionNote}</span>
                          : req.status === 'approved' && req.approvalNote
                            ? <span className={s.adminNoteApprove}>{req.approvalNote}</span>
                            : <span className={s.tableMuted}>—</span>
                        }
                      </td>
                      <td>
                        <div className={s.rowActions}>
                          {isAdmin && req.status === 'pending' && (
                            <button
                              className={`${s.btnSuccess} ${s.btnCompact}`}
                              onClick={() => setReviewTarget(req)}
                            >
                              Xét duyệt
                            </button>
                          )}
                          {req.status === 'pending' && (
                            <button
                              className={`${s.btnDanger} ${s.btnCompact}`}
                              onClick={() => handleCancel(req.id)}
                            >
                              Huỷ
                            </button>
                          )}
                        </div>
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
                <button
                  key={n}
                  className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                  onClick={() => setPage(n)}
                >{n}</button>
              ))}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <LeaveFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
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

// ── LeaveFormModal ────────────────────────────────────────────────────────────

function LeaveFormModal({ onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const today    = new Date().toISOString().slice(0, 10)
  const [form,   setForm]   = useState({ leaveType: 'annual', startDate: today, endDate: today, reason: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.startDate || !form.endDate) { setError('Vui lòng chọn ngày'); return }
    if (form.endDate < form.startDate)   { setError('Ngày kết thúc phải sau ngày bắt đầu'); return }
    setError(null); setSaving(true)
    try {
      await attendanceApi.createLeaveRequest(form)
      addToast('Đã tạo đơn xin nghỉ phép', 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể tạo đơn')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Tạo đơn xin nghỉ phép" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Loại nghỉ</label>
          <select value={form.leaveType} onChange={set('leaveType')} className={s.formSelect}>
            {Object.entries(LEAVE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Ngày bắt đầu</label>
            <input type="date" value={form.startDate} onChange={set('startDate')} className={s.formInput} />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Ngày kết thúc</label>
            <input type="date" value={form.endDate} onChange={set('endDate')} className={s.formInput} />
          </div>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Lý do</label>
          <textarea value={form.reason} onChange={set('reason')} className={s.formTextarea} rows={3} placeholder="Lý do xin nghỉ phép..." />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {saving ? 'Đang gửi...' : <><Check size={13} /> Gửi đơn</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── ReviewLeaveModal ──────────────────────────────────────────────────────────

function ReviewLeaveModal({ request, onClose, onSaved }) {
  const addToast  = useToastStore((st) => st.toast)
  const [note,    setNote]    = useState('')
  const [saving,  setSaving]  = useState(false)

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
          <label className={s.formLabel}>Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={s.formTextarea}
            rows={2}
            placeholder="Ghi chú khi duyệt hoặc từ chối..."
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Đóng</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleReject}>
            <X size={13} /> Từ chối
          </button>
          <button className={s.btnSuccess} disabled={saving} onClick={handleApprove}>
            <Check size={13} /> Duyệt
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── OvertimeTab ───────────────────────────────────────────────────────────────

function OvertimeTab({ isAdmin, year, month, userId }) {
  const addToast = useToastStore((st) => st.toast)
  const [requests,        setRequests]        = useState([])
  const [pagination,      setPagination]      = useState({ total: 0, totalPages: 1 })
  const [page,            setPage]            = useState(1)
  const [loading,         setLoading]         = useState(true)
  const [showForm,        setShowForm]        = useState(false)
  const [reviewTarget,    setReviewTarget]    = useState(null)
  const [totalApprovedOt, setTotalApprovedOt] = useState(0)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to   = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    // Run paginated list + monthly total concurrently (total is independent of pagination)
    const requests = [attendanceApi.listOvertimeRequests({ userId, from, to, page, limit: 20 })]
    if (!isAdmin) requests.push(attendanceApi.listOvertimeRequests({ userId, from, to, status: 'approved', limit: 500 }))
    Promise.all(requests)
      .then(([pageRes, totalRes]) => {
        if (cancelled) return
        setRequests(pageRes.requests ?? pageRes.data ?? [])
        setPagination(pageRes.pagination ?? { total: 0, totalPages: 1 })
        if (totalRes) {
          const all = totalRes.requests ?? totalRes.data ?? []
          setTotalApprovedOt(all.reduce((sum, r) => sum + (Number(r.otHours) || 0), 0))
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn tăng ca', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, from, to, page, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn tăng ca — {monthName(year, month)}
            {!loading && (
              <span className={s.sectionTitleMeta}>
                ({pagination.total} đơn)
              </span>
            )}
          </h3>
          {!isAdmin && (
            <button className={s.btnPrimary} onClick={() => setShowForm(true)}>
              <Plus size={13} /> Tạo đơn tăng ca
            </button>
          )}
        </div>

        {!isAdmin && (
          <div className={s.otSummaryBar}>
            <Clock size={14} />
            Tổng giờ OT đã được duyệt tháng này:&nbsp;<strong>{totalApprovedOt.toFixed(1)} giờ</strong>
          </div>
        )}

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <Clock size={32} className={s.emptyIcon} />
            Chưa có đơn tăng ca tháng này
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  {isAdmin && <th>Nhân viên</th>}
                  <th>Ngày tăng ca</th>
                  <th>Bắt đầu</th>
                  <th>Kết thúc</th>
                  <th>Số giờ</th>
                  <th>Lý do</th>
                  <th>Trạng thái</th>
                  <th>Ghi chú Admin</th>
                  <th className={s.actionsCell} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = OT_STATUS[req.status] ?? OT_STATUS.pending
                  return (
                    <tr key={req.id}>
                      {isAdmin && <td className={s.tableStrong}>{req.userName}</td>}
                      <td>{fmtDateVI(req.otDate)}</td>
                      <td className={s.tableSemibold}>{req.startTime ?? '—'}</td>
                      <td className={s.tableSemibold}>{req.endTime ?? '—'}</td>
                      <td className={s.tablePurple}>
                        {req.otHours != null ? `${Number(req.otHours).toFixed(1)}h` : '—'}
                      </td>
                      <td className={s.tableReason}>{req.reason ?? '—'}</td>
                      <td>
                        <span className={`${s.statusPill} ${getRequestStatusClass(req.status)}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className={s.adminNoteCell}>
                        {req.status === 'rejected' && req.rejectionNote
                          ? <span className={s.adminNoteReject}>{req.rejectionNote}</span>
                          : req.status === 'approved' && req.approvalNote
                            ? <span className={s.adminNoteApprove}>{req.approvalNote}</span>
                            : <span className={s.tableMuted}>—</span>
                        }
                      </td>
                      <td>
                        {isAdmin && req.status === 'pending' && (
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
                <button
                  key={n}
                  className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                  onClick={() => setPage(n)}
                >{n}</button>
              ))}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <OvertimeFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
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

// ── OvertimeFormModal ─────────────────────────────────────────────────────────

function OvertimeFormModal({ onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const today    = new Date().toISOString().slice(0, 10)
  const [form,   setForm]   = useState({ otDate: today, startTime: '18:00', endTime: '20:00', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  function set(field) { return (e) => setForm((p) => ({ ...p, [field]: e.target.value })) }

  const estimatedHours = useMemo(() => {
    if (!form.startTime || !form.endTime) return null
    const [sh, sm] = form.startTime.split(':').map(Number)
    const [eh, em] = form.endTime.split(':').map(Number)
    const diff = (eh * 60 + em) - (sh * 60 + sm)
    if (diff <= 0) return null
    return (diff / 60).toFixed(1)
  }, [form.startTime, form.endTime])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.otDate || !form.startTime || !form.endTime) { setError('Vui lòng điền đầy đủ thông tin'); return }
    if (form.endTime <= form.startTime) { setError('Giờ kết thúc phải sau giờ bắt đầu'); return }
    setError(null); setSaving(true)
    try {
      await attendanceApi.createOvertimeRequest(form)
      addToast('Đã tạo đơn tăng ca', 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể tạo đơn')
    } finally { setSaving(false) }
  }

  return (
    <Modal title="Tạo đơn tăng ca" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Ngày tăng ca</label>
          <input type="date" value={form.otDate} onChange={set('otDate')} className={s.formInput} />
        </div>
        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Giờ bắt đầu</label>
            <input type="time" value={form.startTime} onChange={set('startTime')} className={s.formInput} />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Giờ kết thúc</label>
            <input type="time" value={form.endTime} onChange={set('endTime')} className={s.formInput} />
          </div>
        </div>
        {estimatedHours && (
          <div className={s.estimateBox}>
            Ước tính: ~{estimatedHours} giờ tăng ca
          </div>
        )}
        <div className={s.formGroup}>
          <label className={s.formLabel}>Lý do</label>
          <textarea value={form.reason} onChange={set('reason')} className={s.formTextarea} rows={3} placeholder="Lý do làm thêm giờ..." />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {saving ? 'Đang gửi...' : <><Check size={13} /> Gửi đơn</>}
          </button>
        </div>
      </form>
    </Modal>
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
              {Number(request.otHours).toFixed(1)} giờ
            </p>
          )}
          {request.reason && (
            <p className={s.reviewCardNote}>{request.reason}</p>
          )}
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={s.formTextarea}
            rows={2}
            placeholder="Ghi chú khi duyệt hoặc từ chối..."
          />
        </div>
        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Đóng</button>
          <button className={s.btnDanger} disabled={saving} onClick={handleReject}>
            <X size={13} /> Từ chối
          </button>
          <button className={s.btnSuccess} disabled={saving} onClick={handleApprove}>
            <Check size={13} /> Duyệt
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SummaryTab (admin only) ───────────────────────────────────────────────────

function SummaryTab({ year, month, userId }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.getRecordsSummary({ userId, month, year })
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) addToast('Không thể tải tổng hợp', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>Tổng hợp chấm công — {monthName(year, month)}</h3>
      </div>
      {loading ? (
        <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={s.centered}>
          <BarChart3 size={32} className={s.emptyIcon} />
          Không có dữ liệu
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chức danh</th>
                <th className={s.summarySuccess}>Ngày công</th>
                <th className={s.summaryPrimary}>Nghỉ (trả lương)</th>
                <th className={s.summaryDanger}>Vắng</th>
                <th className={s.summaryWarning}>Đi muộn</th>
                <th className={s.detailValueWarningDark}>Về sớm</th>
                <th className={s.summaryPurple}>OT (giờ)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td className={s.tableStrong}>{r.userName}</td>
                  <td className={s.tableMuted}>{r.jobTitle ?? '—'}</td>
                  <td className={s.tableSuccess}>{r.actualWorkDays}</td>
                  <td className={s.tableMuted}>{r.leavePaidDays}</td>
                  <td className={r.absentDays > 0 ? s.tableDanger : s.tableMuted}>{r.absentDays}</td>
                  <td className={r.lateCount > 0 ? s.tableWarning : s.tableMuted}>{r.lateCount}</td>
                  <td className={s.tableMuted}>{r.earlyCount}</td>
                  <td className={(r.approvedOtHours ?? r.totalOtHours ?? 0) > 0 ? s.tablePurple : s.tableMuted}>
                    {Number(r.approvedOtHours ?? r.totalOtHours ?? 0).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
