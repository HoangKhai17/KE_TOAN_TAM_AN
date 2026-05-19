import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, CalendarDays, ClipboardList, Clock, CalendarCheck2,
  ChevronLeft, ChevronRight, Loader2, Check, X, RefreshCw,
  Download, BarChart3,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import * as usersApi from '../../api/users'
import * as payrollApi from '../../api/payroll'
import s from './Attendance.module.css'
import sa from './AttendanceAdmin.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const ADMIN_TABS = [
  { id: 'today',    label: 'Hôm nay',          icon: Users },
  { id: 'monthly',  label: 'Bảng công tháng',   icon: CalendarDays },
  { id: 'leave',    label: 'Duyệt nghỉ phép',   icon: ClipboardList },
  { id: 'overtime', label: 'Duyệt tăng ca',     icon: Clock },
  { id: 'schedule', label: 'Lịch ca tháng',     icon: CalendarCheck2 },
  { id: 'report',   label: 'Báo cáo',           icon: BarChart3 },
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

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AttendanceAdmin() {
  const now = new Date()
  const [activeTab, setActiveTab] = useState('today')
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

  const showMonthNav = activeTab !== 'today' && activeTab !== 'leave' && activeTab !== 'overtime'

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
          {ADMIN_TABS.map(({ id, label, icon: Icon }) => (
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
        {showMonthNav && (
          <div className={s.filterBar}>
            <div className={s.monthNav}>
              <button className={s.iconBtn} onClick={prevMonth}><ChevronLeft size={14} /></button>
              <span className={s.monthLabel}>{monthName(year, month)}</span>
              <button className={s.iconBtn} onClick={nextMonth}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}

        {activeTab === 'today'    && <TodayTab staffList={staffList} />}
        {activeTab === 'monthly'  && <MonthlyTab year={year} month={month} />}
        {activeTab === 'leave'    && <AdminLeaveTab />}
        {activeTab === 'overtime' && <AdminOvertimeTab />}
        {activeTab === 'schedule' && <ScheduleTab year={year} month={month} staffList={staffList} />}
        {activeTab === 'report'   && <ReportTab year={year} month={month} />}

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

// ── MonthlyTab ────────────────────────────────────────────────────────────────

function MonthlyTab({ year, month }) {
  const addToast  = useToastStore((st) => st.toast)
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.getRecordsSummary({ month, year })
      .then((data) => { if (!cancelled) setRows(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) addToast('Không thể tải bảng công tháng', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [month, year]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>Bảng công tháng — {monthName(year, month)}</h3>
      </div>
      {loading ? (
        <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={s.centered}>
          <CalendarDays size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
          Chưa có dữ liệu tháng này
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
                <th>Tổng bản ghi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{r.userName}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.jobTitle ?? '—'}</td>
                  <td style={{ fontWeight: 700, color: 'var(--color-success-dark)' }}>{r.actualWorkDays}</td>
                  <td>{r.leavePaidDays}</td>
                  <td style={{ fontWeight: 700, color: r.absentDays > 0 ? 'var(--color-danger)' : 'var(--color-muted)' }}>{r.absentDays}</td>
                  <td style={{ fontWeight: r.lateCount > 0 ? 700 : 400, color: r.lateCount > 0 ? 'var(--color-warning-amber)' : 'var(--color-muted)' }}>{r.lateCount}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.earlyCount}</td>
                  <td style={{ fontWeight: r.totalOtHours > 0 ? 700 : 400, color: r.totalOtHours > 0 ? 'var(--color-purple-bright)' : 'var(--color-muted)' }}>
                    {Number(r.totalOtHours).toFixed(1)}
                  </td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.totalRecords ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── AdminLeaveTab ─────────────────────────────────────────────────────────────

function AdminLeaveTab() {
  const addToast   = useToastStore((st) => st.toast)
  const [requests, setRequests]   = useState([])
  const [page,     setPage]       = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading,  setLoading]    = useState(true)
  const [reviewTarget, setReviewTarget] = useState(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listLeaveRequests({ status: 'pending', page, limit: 20 })
      .then((res) => {
        if (!cancelled) {
          setRequests(res.requests ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn nghỉ phép', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn nghỉ phép chờ duyệt
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
            Không có đơn nào chờ duyệt
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
                  <th>Lý do</th>
                  <th style={{ width: 140 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{req.userName}</td>
                    <td>{LEAVE_TYPE[req.leaveType] ?? req.leaveType}</td>
                    <td>{fmtDateVI(req.startDate)}</td>
                    <td>{fmtDateVI(req.endDate)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{req.daysCount ?? req.totalDays} ngày</td>
                    <td style={{ color: 'var(--color-muted)', maxWidth: 160 }}>{req.reason ?? '—'}</td>
                    <td>
                      <button
                        className={s.btnSuccess}
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        onClick={() => setReviewTarget(req)}
                      >
                        Xét duyệt
                      </button>
                    </td>
                  </tr>
                ))}
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

function AdminOvertimeTab() {
  const addToast   = useToastStore((st) => st.toast)
  const [requests, setRequests]   = useState([])
  const [page,     setPage]       = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [loading,  setLoading]    = useState(true)
  const [reviewTarget, setReviewTarget] = useState(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listOvertimeRequests({ status: 'pending', page, limit: 20 })
      .then((res) => {
        if (!cancelled) {
          setRequests(res.requests ?? res.data ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải đơn tăng ca', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Đơn tăng ca chờ duyệt
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
            Không có đơn nào chờ duyệt
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
                  <th>Lý do</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--color-text-soft)' }}>{req.userName}</td>
                    <td>{fmtDateVI(req.otDate)}</td>
                    <td style={{ fontWeight: 600 }}>{req.startTime ?? '—'}</td>
                    <td style={{ fontWeight: 600 }}>{req.endTime ?? '—'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-purple-bright)' }}>
                      {req.otHours != null ? `${Number(req.otHours).toFixed(1)}h` : '—'}
                    </td>
                    <td style={{ color: 'var(--color-muted)', maxWidth: 160 }}>{req.reason ?? '—'}</td>
                    <td>
                      <button
                        className={s.btnSuccess}
                        style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                        onClick={() => setReviewTarget(req)}
                      >
                        Xét duyệt
                      </button>
                    </td>
                  </tr>
                ))}
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

// ── ScheduleTab ───────────────────────────────────────────────────────────────

function ScheduleTab({ year, month, staffList }) {
  const addToast    = useToastStore((st) => st.toast)
  const [userId,    setUserId]    = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [busy,      setBusy]      = useState(false)
  const [result,    setResult]    = useState(null)

  async function handleGenerate() {
    if (!userId) { addToast('Vui lòng chọn nhân viên', 'error'); return }
    setBusy(true)
    setResult(null)
    try {
      const res = await attendanceApi.generateMonthlySchedule({ userId, month, year, overwrite })
      setResult(res)
      addToast(`Đã tạo lịch ca tháng ${month}/${year}`, 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể tạo lịch ca', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>Tạo lịch ca tháng — {monthName(year, month)}</h3>
      </div>
      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Nhân viên</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} className={s.formSelect}>
            <option value="">-- Chọn nhân viên --</option>
            {staffList.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm)', cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          <span>Ghi đè lịch đã có</span>
        </label>

        <button className={s.btnPrimary} onClick={handleGenerate} disabled={busy || !userId} style={{ alignSelf: 'flex-start' }}>
          {busy && <Loader2 size={13} className={s.spin} />}
          {busy ? 'Đang tạo...' : <><CalendarCheck2 size={13} /> Tạo lịch ca</>}
        </button>

        {result && (
          <div style={{ padding: '12px 16px', background: 'var(--color-success-bg-soft)', border: '1.5px solid var(--color-success-bg)', borderRadius: 8, fontSize: 'var(--fs-sm)' }}>
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-success-dark)' }}>Tạo lịch ca thành công!</p>
            {result.created != null && (
              <p style={{ margin: '4px 0 0', color: 'var(--color-muted)' }}>
                Đã tạo: {result.created} ngày · Bỏ qua: {result.skipped ?? 0} ngày
              </p>
            )}
          </div>
        )}
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
        <div style={{ padding: '10px 14px', background: 'var(--color-accent-bg-soft)', border: '1.5px solid var(--color-accent-bg)', borderRadius: 8, fontSize: 'var(--fs-sm)', color: 'var(--color-warning-amber)' }}>
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
