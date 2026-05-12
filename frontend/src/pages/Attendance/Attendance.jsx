import { useState, useEffect, useCallback } from 'react'
import {
  Plus, ChevronLeft, ChevronRight, Loader2, CalendarDays,
  ClipboardList, BarChart3, Check, X, Trash2,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import * as usersApi from '../../api/users'
import s from './Attendance.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'attendance', label: 'Chấm công', icon: CalendarDays },
  { id: 'leave',      label: 'Nghỉ phép', icon: ClipboardList },
  { id: 'summary',    label: 'Tổng hợp',  icon: BarChart3 },
]

const ATT_STATUS = {
  present:  { label: 'Có mặt',     cls: s.badgePresent },
  absent:   { label: 'Vắng mặt',   cls: s.badgeAbsent },
  late:     { label: 'Đi muộn',    cls: s.badgeLate },
  half_day: { label: 'Nửa ngày',   cls: s.badgeHalfDay },
  remote:   { label: 'Làm từ xa',  cls: s.badgeRemote },
  holiday:  { label: 'Nghỉ lễ',    cls: s.badgeHoliday },
}

const LEAVE_TYPE = {
  annual:    'Nghỉ phép năm',
  sick:      'Nghỉ ốm',
  unpaid:    'Nghỉ không lương',
  maternity: 'Nghỉ thai sản',
  paternity: 'Nghỉ thai sản (nam)',
  other:     'Lý do khác',
}

const LEAVE_STATUS = {
  pending:   { label: 'Chờ duyệt', cls: s.badgePending },
  approved:  { label: 'Đã duyệt',  cls: s.badgeApproved },
  rejected:  { label: 'Từ chối',   cls: s.badgeRejected },
  cancelled: { label: 'Đã huỷ',    cls: s.badgeCancelled },
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function monthName(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Attendance() {
  const user    = useAuthStore((st) => st.user)
  const isAdmin = user?.role === 'admin'

  const now = new Date()
  const [activeTab, setActiveTab]   = useState('attendance')
  const [year, setYear]             = useState(now.getFullYear())
  const [month, setMonth]           = useState(now.getMonth() + 1)
  const [userFilter, setUserFilter] = useState('')
  const [staffList, setStaffList]   = useState([])

  // Load staff list for admin filters
  useEffect(() => {
    if (!isAdmin) return
    usersApi.listUsers({ status: 'active', limit: 200 }).then(({ users }) => setStaffList(users))
  }, [isAdmin])

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12) }
    else setMonth((m) => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1) }
    else setMonth((m) => m + 1)
  }

  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id !== 'summary')

  return (
    <AppLayout>
      <div className={s.page}>

        {/* Header */}
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
          {isAdmin && (
            <select
              className={s.filterSelect}
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            >
              <option value="">Tất cả nhân viên</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Tab content */}
        {activeTab === 'attendance' && (
          <AttendanceTab
            isAdmin={isAdmin}
            year={year}
            month={month}
            userId={isAdmin ? (userFilter || undefined) : user?.id}
            selfId={user?.id}
            staffList={staffList}
          />
        )}
        {activeTab === 'leave' && (
          <LeaveTab
            isAdmin={isAdmin}
            year={year}
            month={month}
            userId={isAdmin ? (userFilter || undefined) : user?.id}
          />
        )}
        {activeTab === 'summary' && isAdmin && (
          <SummaryTab year={year} month={month} />
        )}
      </div>
    </AppLayout>
  )
}

// ── AttendanceTab ─────────────────────────────────────────────────────────────

function AttendanceTab({ isAdmin, year, month, userId, selfId, staffList }) {
  const addToast = useToastStore((st) => st.toast)
  const [records, setRecords]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editRec, setEditRec]   = useState(null)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.listAttendanceRecords({ userId, from, to, page, limit: 50 })
      .then((res) => {
        if (!cancelled) {
          setRecords(res.records ?? [])
          setPagination(res.pagination ?? { total: 0, totalPages: 1 })
        }
      })
      .catch(() => { if (!cancelled) addToast('Không thể tải dữ liệu chấm công', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, from, to, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { return load() }, [load])

  async function handleDelete(id) {
    if (!window.confirm('Xoá bản ghi chấm công này?')) return
    try {
      await attendanceApi.deleteAttendanceRecord(id)
      addToast('Đã xoá bản ghi', 'success')
      load()
    } catch {
      addToast('Không thể xoá', 'error')
    }
  }

  return (
    <>
      <div className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>
            Danh sách chấm công — {monthName(year, month)}
            {!loading && <span style={{ fontWeight: 600, color: '#64748b', marginLeft: 8, fontSize: 'var(--fs-sm)' }}>({pagination.total} bản ghi)</span>}
          </h3>
          {isAdmin && (
            <button className={s.btnPrimary} onClick={() => { setEditRec(null); setShowForm(true) }}>
              <Plus size={13} /> Thêm chấm công
            </button>
          )}
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : records.length === 0 ? (
          <div className={s.centered}>
            <CalendarDays size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
            Chưa có dữ liệu chấm công tháng này
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Ngày</th>
                  {isAdmin && <th>Nhân viên</th>}
                  <th>Trạng thái</th>
                  <th>Giờ vào</th>
                  <th>Giờ ra</th>
                  <th>Ghi chú</th>
                  {isAdmin && <th style={{ width: 60 }} />}
                </tr>
              </thead>
              <tbody>
                {records.map((rec) => {
                  const st = ATT_STATUS[rec.status] ?? { label: rec.status, cls: s.badgePresent }
                  return (
                    <tr key={rec.id}>
                      <td style={{ fontWeight: 600, color: '#1e293b' }}>
                        {fmtDate(rec.workDate)}
                      </td>
                      {isAdmin && (
                        <td style={{ fontWeight: 600 }}>{rec.userName ?? '—'}</td>
                      )}
                      <td>
                        <span className={`${s.badge} ${st.cls}`}>{st.label}</span>
                      </td>
                      <td>{rec.checkIn ?? '—'}</td>
                      <td>{rec.checkOut ?? '—'}</td>
                      <td style={{ color: 'var(--color-muted)', maxWidth: 180 }}>{rec.notes ?? '—'}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className={s.btnSecondary}
                              style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              onClick={() => { setEditRec(rec); setShowForm(true) }}
                            >
                              Sửa
                            </button>
                            <button
                              className={s.btnDanger}
                              style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              onClick={() => handleDelete(rec.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className={s.paginationBar}>
            <span className={s.paginationInfo}>Tổng: {pagination.total} bản ghi</span>
            <div className={s.paginationBtns}>
              <button className={s.paginationBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
              {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={`${s.paginationBtn} ${page === n ? s.paginationBtnActive : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button className={s.paginationBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <AttendanceFormModal
          existing={editRec}
          staffList={staffList}
          isAdmin={isAdmin}
          selfId={selfId}
          defaultFrom={from}
          onClose={() => { setShowForm(false); setEditRec(null) }}
          onSaved={() => { setShowForm(false); setEditRec(null); load() }}
        />
      )}
    </>
  )
}

// ── AttendanceFormModal ───────────────────────────────────────────────────────

function AttendanceFormModal({ existing, staffList, isAdmin, selfId, defaultFrom, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const [form, setForm] = useState({
    userId:   existing?.userId   ?? (isAdmin ? '' : selfId ?? ''),
    workDate: existing?.workDate ?? defaultFrom,
    checkIn:  existing?.checkIn  ?? '',
    checkOut: existing?.checkOut ?? '',
    status:   existing?.status   ?? 'present',
    notes:    existing?.notes    ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.workDate) { setError('Vui lòng chọn ngày'); return }
    if (isAdmin && !form.userId) { setError('Vui lòng chọn nhân viên'); return }
    setError(null)
    setSaving(true)
    try {
      await attendanceApi.upsertAttendanceRecord({
        userId:   form.userId || selfId,
        workDate: form.workDate,
        checkIn:  form.checkIn  || null,
        checkOut: form.checkOut || null,
        status:   form.status,
        notes:    form.notes || null,
      })
      addToast('Đã lưu chấm công', 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể lưu')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={existing ? 'Chỉnh sửa chấm công' : 'Thêm chấm công'} onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}

        {isAdmin && (
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Nhân viên</label>
            <select value={form.userId} onChange={set('userId')} className={s.formSelect} disabled={!!existing}>
              <option value="">Chọn nhân viên...</option>
              {staffList.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className={s.formGrid}>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Ngày</label>
            <input
              type="date"
              value={form.workDate}
              onChange={set('workDate')}
              className={s.formInput}
              disabled={!!existing}
            />
          </div>
          <div className={s.formGroup}>
            <label className={`${s.formLabel} ${s.req}`}>Trạng thái</label>
            <select value={form.status} onChange={set('status')} className={s.formSelect}>
              {Object.entries(ATT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Giờ vào</label>
            <input type="time" value={form.checkIn} onChange={set('checkIn')} className={s.formInput} />
          </div>
          <div className={s.formGroup}>
            <label className={s.formLabel}>Giờ ra</label>
            <input type="time" value={form.checkOut} onChange={set('checkOut')} className={s.formInput} />
          </div>
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú</label>
          <textarea value={form.notes} onChange={set('notes')} className={s.formTextarea} rows={2} placeholder="Ghi chú thêm..." />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnPrimary} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {saving ? 'Đang lưu...' : <><Check size={13} /> Lưu</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── LeaveTab ──────────────────────────────────────────────────────────────────

function LeaveTab({ isAdmin, year, month, userId }) {
  const addToast = useToastStore((st) => st.toast)
  const [requests, setRequests]   = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [reviewTarget, setReviewTarget] = useState(null)

  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

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
            {!loading && <span style={{ fontWeight: 600, color: '#64748b', marginLeft: 8, fontSize: 'var(--fs-sm)' }}>({pagination.total} đơn)</span>}
          </h3>
          <button className={s.btnPrimary} onClick={() => setShowForm(true)}>
            <Plus size={13} /> Tạo đơn xin nghỉ
          </button>
        </div>

        {loading ? (
          <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
        ) : requests.length === 0 ? (
          <div className={s.centered}>
            <ClipboardList size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
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
                  <th>Người duyệt</th>
                  <th style={{ width: 100 }} />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const st = LEAVE_STATUS[req.status] ?? { label: req.status, cls: s.badgePending }
                  return (
                    <tr key={req.id}>
                      {isAdmin && <td style={{ fontWeight: 600 }}>{req.userName}</td>}
                      <td>{LEAVE_TYPE[req.leaveType] ?? req.leaveType}</td>
                      <td>{fmtDate(req.startDate)}</td>
                      <td>{fmtDate(req.endDate)}</td>
                      <td style={{ fontWeight: 600, color: '#2563eb' }}>{req.daysCount} ngày</td>
                      <td style={{ color: 'var(--color-muted)', maxWidth: 160 }}>{req.reason ?? '—'}</td>
                      <td><span className={`${s.badge} ${st.cls}`}>{st.label}</span></td>
                      <td style={{ color: 'var(--color-muted)' }}>{req.reviewerName ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {isAdmin && req.status === 'pending' && (
                            <button
                              className={s.btnSuccess}
                              style={{ height: 28, padding: '0 8px', fontSize: 11 }}
                              onClick={() => setReviewTarget(req)}
                            >
                              Xét duyệt
                            </button>
                          )}
                          {req.status === 'pending' && (
                            <button
                              className={s.btnDanger}
                              style={{ height: 28, padding: '0 8px', fontSize: 11 }}
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
                >
                  {n}
                </button>
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
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    leaveType: 'annual',
    startDate: today,
    endDate:   today,
    reason:    '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field) {
    return (e) => setForm((p) => ({ ...p, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.startDate || !form.endDate) { setError('Vui lòng chọn ngày bắt đầu và kết thúc'); return }
    if (form.endDate < form.startDate) { setError('Ngày kết thúc phải sau ngày bắt đầu'); return }
    setError(null)
    setSaving(true)
    try {
      await attendanceApi.createLeaveRequest(form)
      addToast('Đã tạo đơn xin nghỉ phép', 'success')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.error?.message ?? 'Không thể tạo đơn')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Tạo đơn xin nghỉ phép" onClose={onClose}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        {error && <div className={s.errorBox}>{error}</div>}
        <div className={s.formGroup}>
          <label className={`${s.formLabel} ${s.req}`}>Loại nghỉ</label>
          <select value={form.leaveType} onChange={set('leaveType')} className={s.formSelect}>
            {Object.entries(LEAVE_TYPE).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
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
  const addToast = useToastStore((st) => st.toast)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving]         = useState(false)

  async function handleReview(status) {
    setSaving(true)
    try {
      await attendanceApi.reviewLeaveRequest(request.id, { status, reviewNote: reviewNote || null })
      addToast(status === 'approved' ? 'Đã duyệt đơn nghỉ phép' : 'Đã từ chối đơn', 'success')
      onSaved()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xét duyệt', 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title="Xét duyệt đơn nghỉ phép" onClose={onClose}>
      <div className={s.modalForm}>
        <div style={{ background: '#f8fbff', border: '1.5px solid #dbeafe', borderRadius: 8, padding: '12px 14px', fontSize: 'var(--fs-sm)' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1e3a8a' }}>{request.userName}</p>
          <p style={{ margin: '0 0 4px', color: 'var(--color-muted)' }}>{LEAVE_TYPE[request.leaveType] ?? request.leaveType}</p>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            {fmtDate(request.startDate)} → {fmtDate(request.endDate)} ({request.daysCount} ngày)
          </p>
          {request.reason && <p style={{ margin: '6px 0 0', color: 'var(--color-text-soft)', fontStyle: 'italic' }}>{request.reason}</p>}
        </div>

        <div className={s.formGroup}>
          <label className={s.formLabel}>Ghi chú phê duyệt</label>
          <textarea
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            className={s.formTextarea}
            rows={2}
            placeholder="Ghi chú khi duyệt hoặc từ chối..."
          />
        </div>

        <div className={s.modalActions}>
          <button type="button" onClick={onClose} className={s.btnSecondary} disabled={saving}>Đóng</button>
          <button className={s.btnDanger} disabled={saving} onClick={() => handleReview('rejected')}>
            <X size={13} /> Từ chối
          </button>
          <button className={s.btnSuccess} disabled={saving} onClick={() => handleReview('approved')}>
            <Check size={13} /> Duyệt
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── SummaryTab (admin only) ───────────────────────────────────────────────────

function SummaryTab({ year, month }) {
  const addToast = useToastStore((st) => st.toast)
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    attendanceApi.getAttendanceSummary({ year, month })
      .then((data) => { if (!cancelled) setRows(data) })
      .catch(() => { if (!cancelled) addToast('Không thể tải tổng hợp', 'error') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.section}>
      <div className={s.sectionHead}>
        <h3 className={s.sectionTitle}>Tổng hợp chấm công — {monthName(year, month)}</h3>
      </div>

      {loading ? (
        <div className={s.centered}><Loader2 size={20} className={s.spin} /> Đang tải...</div>
      ) : rows.length === 0 ? (
        <div className={s.centered}>
          <BarChart3 size={32} style={{ opacity: 0.35, marginBottom: 4 }} />
          Không có dữ liệu
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chức danh</th>
                <th style={{ color: '#15803d' }}>Có mặt</th>
                <th style={{ color: '#dc2626' }}>Vắng</th>
                <th style={{ color: '#a16207' }}>Đi muộn</th>
                <th style={{ color: '#c2410c' }}>Nửa ngày</th>
                <th style={{ color: '#2563eb' }}>Từ xa</th>
                <th>Tổng GC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td style={{ fontWeight: 600, color: '#1e293b' }}>{r.userName}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.jobTitle ?? '—'}</td>
                  <td style={{ fontWeight: 700, color: '#15803d' }}>{r.presentDays}</td>
                  <td style={{ fontWeight: 700, color: r.absentDays > 0 ? '#dc2626' : 'var(--color-muted)' }}>{r.absentDays}</td>
                  <td style={{ fontWeight: 700, color: r.lateDays > 0 ? '#a16207' : 'var(--color-muted)' }}>{r.lateDays}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.halfDays}</td>
                  <td style={{ color: 'var(--color-muted)' }}>{r.remoteDays}</td>
                  <td style={{ fontWeight: 700 }}>{r.totalRecords}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
