import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import {
  CalendarDays, Plus, Eye, Power, Pencil, Trash2, Loader2, AlertTriangle, RefreshCw,
} from 'lucide-react'
import * as schedulesApi from '../../api/schedules'
import { listTaskTypes } from '../../api/taskTypes'
import { listUserOptions } from '../../api/users'
import { getNextOccurrences } from '../../utils/recurrencePreview'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import s from './companies.module.css'

// ── Constants ──────────────────────────────────────────────────────────────────

const RECURRENCE_TYPES = [
  { value: 'daily',              label: 'Hàng ngày' },
  { value: 'weekly',             label: 'Hàng tuần' },
  { value: 'monthly_by_date',    label: 'Hàng tháng (ngày cố định)' },
  { value: 'monthly_by_weekday', label: 'Hàng tháng (thứ N tuần M)' },
  { value: 'monthly_last_day',   label: 'Hàng tháng (ngày cuối)' },
  { value: 'quarterly',          label: 'Hàng quý' },
  { value: 'yearly',             label: 'Hàng năm' },
  { value: 'custom_dates',       label: 'Ngày chỉ định' },
  { value: 'once',               label: 'Một lần' },
]
const RECURRENCE_LABELS = Object.fromEntries(RECURRENCE_TYPES.map(r => [r.value, r.label]))

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const MONTH_LABELS   = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                        'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

// ── Helpers ────────────────────────────────────────────────────────────────────

function emptyForm() {
  return {
    taskTypeId: '',
    assignedStaffId: '',
    recurrenceType: 'monthly_by_date',
    recurrenceConfig: { day: 1 },
    deadlineOffsetDays: 0,
    overrideSlaDays: '',
    notes: '',
  }
}

function defaultConfig(type) {
  switch (type) {
    case 'daily':              return { every_n_days: 1 }
    case 'weekly':             return { weekdays: [1] }
    case 'monthly_by_date':    return { day: 1 }
    case 'monthly_by_weekday': return { weekday: 1, week: 1 }
    case 'monthly_last_day':   return {}
    case 'quarterly':          return { month_in_quarter: 1, day: 1 }
    case 'yearly':             return { month: 1, day: 1 }
    case 'custom_dates':       return { dates: [] }
    case 'once':               return { date: '' }
    default:                   return {}
  }
}

function describeRecurrence(type, cfg) {
  if (!cfg) return RECURRENCE_LABELS[type] || type
  switch (type) {
    case 'daily':
      return cfg.every_n_days === 1 ? 'Mỗi ngày' : `Mỗi ${cfg.every_n_days} ngày`
    case 'weekly': {
      const names = (cfg.weekdays || []).sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d])
      return names.length ? names.join(', ') : '—'
    }
    case 'monthly_by_date':
      return `Ngày ${cfg.day} hàng tháng`
    case 'monthly_by_weekday':
      return `Tuần ${cfg.week}, ${WEEKDAY_LABELS[cfg.weekday] || '?'} hàng tháng`
    case 'monthly_last_day':
      return 'Ngày cuối tháng'
    case 'quarterly':
      return `Quý: tháng ${cfg.month_in_quarter}, ngày ${cfg.day}`
    case 'yearly':
      return `${cfg.day}/${cfg.month} hàng năm`
    case 'custom_dates':
      return `${(cfg.dates || []).length} ngày chỉ định`
    case 'once':
      return cfg.date || '—'
    default:
      return type
  }
}

function validateForm(form) {
  const errors = {}
  const today = format(new Date(), 'yyyy-MM-dd')

  if (!form.taskTypeId) errors.taskTypeId = 'Vui lòng chọn loại công việc'

  const cfg = form.recurrenceConfig || {}
  switch (form.recurrenceType) {
    case 'daily':
      if (!Number.isInteger(cfg.every_n_days) || cfg.every_n_days < 1)
        errors.recurrenceConfig = 'Số ngày lặp phải >= 1'
      break
    case 'weekly':
      if (!cfg.weekdays || cfg.weekdays.length === 0)
        errors.recurrenceConfig = 'Chọn ít nhất một ngày trong tuần'
      break
    case 'monthly_by_date':
      if (!cfg.day || cfg.day < 1 || cfg.day > 31)
        errors.recurrenceConfig = 'Ngày phải từ 1 đến 31'
      break
    case 'monthly_by_weekday':
      if (cfg.weekday === undefined || cfg.weekday < 0 || cfg.weekday > 6)
        errors.recurrenceConfig = 'Chọn thứ trong tuần hợp lệ'
      else if (!cfg.week || cfg.week < 1 || cfg.week > 5)
        errors.recurrenceConfig = 'Tuần phải từ 1 đến 5'
      break
    case 'quarterly':
      if (!cfg.month_in_quarter || cfg.month_in_quarter < 1 || cfg.month_in_quarter > 3)
        errors.recurrenceConfig = 'Tháng trong quý phải từ 1 đến 3'
      else if (!cfg.day || cfg.day < 1 || cfg.day > 31)
        errors.recurrenceConfig = 'Ngày phải từ 1 đến 31'
      break
    case 'yearly':
      if (!cfg.month || cfg.month < 1 || cfg.month > 12)
        errors.recurrenceConfig = 'Tháng phải từ 1 đến 12'
      else if (!cfg.day || cfg.day < 1 || cfg.day > 31)
        errors.recurrenceConfig = 'Ngày phải từ 1 đến 31'
      break
    case 'custom_dates':
      if (!cfg.dates || cfg.dates.length === 0)
        errors.recurrenceConfig = 'Cần ít nhất một ngày'
      else if (cfg.dates.some(d => d <= today))
        errors.recurrenceConfig = 'Tất cả ngày phải trong tương lai'
      break
    case 'once':
      if (!cfg.date)
        errors.recurrenceConfig = 'Chọn ngày thực hiện'
      else if (cfg.date <= today)
        errors.recurrenceConfig = 'Ngày phải trong tương lai'
      break
    default:
      break
  }

  if (form.overrideSlaDays !== '' && form.overrideSlaDays !== null) {
    const v = parseInt(form.overrideSlaDays)
    if (isNaN(v) || v < 1) errors.overrideSlaDays = 'SLA override >= 1 ngày'
  }

  return errors
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CustomDatesPanel({ config, onChange }) {
  const [newDate, setNewDate] = useState('')
  const today = format(new Date(), 'yyyy-MM-dd')
  const dates = config.dates || []

  function addDate() {
    if (!newDate || dates.includes(newDate)) return
    onChange({ ...config, dates: [...dates, newDate].sort() })
    setNewDate('')
  }

  return (
    <div>
      <div className={s.scDatesAdd}>
        <input
          type="date"
          value={newDate}
          min={today}
          className={s.scConfigInput}
          onChange={e => setNewDate(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDate())}
        />
        <button
          type="button"
          className={s.scDatesAddBtn}
          onClick={addDate}
          disabled={!newDate}
        >
          Thêm
        </button>
      </div>
      <div className={s.scDatesList}>
        {dates.length === 0
          ? <div className={s.scDatesEmpty}>Chưa có ngày nào được thêm</div>
          : dates.map(d => (
            <div key={d} className={s.scDateItem}>
              <span className={s.scDateText}>{d}</span>
              <button
                type="button"
                className={s.scDateRemove}
                onClick={() => onChange({ ...config, dates: dates.filter(x => x !== d) })}
              >×</button>
            </div>
          ))
        }
      </div>
    </div>
  )
}

function RecurrenceConfigPanel({ type, config, onChange }) {
  switch (type) {
    case 'daily':
      return (
        <div className={s.scConfigRow}>
          <label className={s.scConfigLabel}>Mỗi N ngày</label>
          <input
            type="number" min="1" max="365"
            value={config.every_n_days ?? 1}
            className={s.scConfigInput}
            onChange={e => onChange({ ...config, every_n_days: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </div>
      )

    case 'weekly':
      return (
        <div className={s.scConfigRow}>
          <label className={s.scConfigLabel}>Ngày trong tuần</label>
          <div className={s.scWeekdays}>
            {WEEKDAY_LABELS.map((label, i) => {
              const active = (config.weekdays || []).includes(i)
              return (
                <button
                  key={i} type="button"
                  className={`${s.scWeekdayBtn} ${active ? s.scWeekdayActive : ''}`}
                  onClick={() => {
                    const wd = config.weekdays || []
                    onChange({
                      ...config,
                      weekdays: active
                        ? wd.filter(d => d !== i)
                        : [...wd, i].sort((a, b) => a - b),
                    })
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )

    case 'monthly_by_date':
      return (
        <div className={s.scConfigRow}>
          <label className={s.scConfigLabel}>Ngày trong tháng (1–31)</label>
          <input
            type="number" min="1" max="31"
            value={config.day ?? 1}
            className={s.scConfigInput}
            onChange={e => onChange({ ...config, day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
          />
        </div>
      )

    case 'monthly_by_weekday':
      return (
        <div className={s.scConfigGrid}>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Thứ trong tuần</label>
            <select
              value={config.weekday ?? 1}
              className={s.scConfigSelect}
              onChange={e => onChange({ ...config, weekday: parseInt(e.target.value) })}
            >
              {WEEKDAY_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
            </select>
          </div>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Tuần thứ mấy</label>
            <select
              value={config.week ?? 1}
              className={s.scConfigSelect}
              onChange={e => onChange({ ...config, week: parseInt(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Tuần {n}</option>)}
            </select>
          </div>
        </div>
      )

    case 'monthly_last_day':
      return (
        <div className={s.scConfigInfo}>
          Lịch sẽ kích hoạt vào ngày cuối cùng của mỗi tháng.
        </div>
      )

    case 'quarterly':
      return (
        <div className={s.scConfigGrid}>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Tháng trong quý</label>
            <select
              value={config.month_in_quarter ?? 1}
              className={s.scConfigSelect}
              onChange={e => onChange({ ...config, month_in_quarter: parseInt(e.target.value) })}
            >
              {[1, 2, 3].map(m => <option key={m} value={m}>Tháng {m} trong quý</option>)}
            </select>
          </div>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Ngày (1–31)</label>
            <input
              type="number" min="1" max="31"
              value={config.day ?? 1}
              className={s.scConfigInput}
              onChange={e => onChange({ ...config, day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
            />
          </div>
        </div>
      )

    case 'yearly':
      return (
        <div className={s.scConfigGrid}>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Tháng</label>
            <select
              value={config.month ?? 1}
              className={s.scConfigSelect}
              onChange={e => onChange({ ...config, month: parseInt(e.target.value) })}
            >
              {MONTH_LABELS.map((l, i) => <option key={i + 1} value={i + 1}>{l}</option>)}
            </select>
          </div>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Ngày (1–31)</label>
            <input
              type="number" min="1" max="31"
              value={config.day ?? 1}
              className={s.scConfigInput}
              onChange={e => onChange({ ...config, day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
            />
          </div>
        </div>
      )

    case 'custom_dates':
      return <CustomDatesPanel config={config} onChange={onChange} />

    case 'once':
      return (
        <div className={s.scConfigRow}>
          <label className={s.scConfigLabel}>Ngày thực hiện</label>
          <input
            type="date"
            value={config.date ?? ''}
            min={format(new Date(), 'yyyy-MM-dd')}
            className={s.scConfigInput}
            onChange={e => onChange({ ...config, date: e.target.value })}
          />
        </div>
      )

    default:
      return null
  }
}

function PreviewPanel({ type, config }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => {
    try { return getNextOccurrences(type, config, new Date(), 10) }
    catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(config)])

  return (
    <div className={s.scPreviewPanel}>
      <div className={s.scPreviewTitle}>
        <CalendarDays size={14} />
        10 lần kích hoạt tới
      </div>
      {dates.length === 0 ? (
        <div className={s.scPreviewEmpty}>Cấu hình chưa đủ để xem trước</div>
      ) : (
        <ol className={s.scPreviewList}>
          {dates.map((d, i) => (
            <li key={d} className={s.scPreviewItem}>
              <span className={s.scPreviewIdx}>{i + 1}</span>
              <span className={s.scPreviewDate}>{d}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SchedulesTab({ company, isAdmin }) {
  const toast = useToastStore(st => st.toast)

  const [schedules,  setSchedules]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [taskTypes,  setTaskTypes]  = useState([])
  const [staff,      setStaff]      = useState([])

  // Modal
  const [modal,      setModal]      = useState(null)  // null | { mode, schedule? }
  const [form,       setForm]       = useState(emptyForm())
  const [formErrors, setFormErrors] = useState({})
  const [saving,     setSaving]     = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  // Toggle
  const [togglingId, setTogglingId] = useState(null)

  // Server preview
  const [previewModal, setPreviewModal] = useState(null)  // null | { schedule, dates, loading }

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => { void load() }, [company.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [sched, ttResult, usersResult] = await Promise.all([
        schedulesApi.listCompanySchedules(company.id),
        listTaskTypes(),
        listUserOptions({ status: 'active' }),
      ])
      setSchedules(sched)
      setTaskTypes((ttResult.taskTypes || []).filter(tt => tt.isActive))
      setStaff(usersResult.users || [])
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Lỗi tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  function openCreate() {
    setForm(emptyForm())
    setFormErrors({})
    setModal({ mode: 'create' })
  }

  function openEdit(sc) {
    setForm({
      taskTypeId:         sc.taskTypeId,
      assignedStaffId:    sc.assignedStaffId || '',
      recurrenceType:     sc.recurrenceType,
      recurrenceConfig:   { ...(sc.recurrenceConfig || {}) },
      deadlineOffsetDays: sc.deadlineOffsetDays ?? 0,
      overrideSlaDays:    sc.overrideSlaDays != null ? String(sc.overrideSlaDays) : '',
      notes:              sc.notes || '',
    })
    setFormErrors({})
    setModal({ mode: 'edit', schedule: sc })
  }

  async function handleSave() {
    const errors = validateForm(form)
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    setSaving(true)
    try {
      const payload = {
        assignedStaffId:    form.assignedStaffId || null,
        recurrenceType:     form.recurrenceType,
        recurrenceConfig:   form.recurrenceConfig,
        deadlineOffsetDays: Number(form.deadlineOffsetDays) || 0,
        overrideSlaDays:    form.overrideSlaDays !== '' ? parseInt(form.overrideSlaDays) : null,
        notes:              form.notes || null,
      }

      if (modal.mode === 'create') {
        const created = await schedulesApi.createCompanySchedule(company.id, {
          taskTypeId: form.taskTypeId,
          ...payload,
        })
        setSchedules(prev => [created, ...prev])
        toast('Tạo lịch định kỳ thành công', 'success')
      } else {
        const updated = await schedulesApi.updateSchedule(modal.schedule.id, payload)
        setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s))
        toast('Cập nhật lịch thành công', 'success')
      }
      setModal(null)
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Lỗi khi lưu'
      setFormErrors(fe => ({ ...fe, submit: msg }))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(sc) {
    if (togglingId) return
    setTogglingId(sc.id)
    try {
      const updated = await schedulesApi.toggleSchedule(sc.id)
      setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s))
      toast(updated.isActive ? 'Đã bật lịch' : 'Đã tắt lịch', 'success')
    } catch {
      toast('Không thể chuyển đổi trạng thái', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await schedulesApi.deleteSchedule(deleteTarget.id)
      setSchedules(prev => prev.filter(s => s.id !== deleteTarget.id))
      toast('Đã xóa lịch định kỳ', 'success')
      setDeleteTarget(null)
    } catch (err) {
      const msg = err?.response?.status === 409
        ? 'Không thể xóa: lịch này đã sinh công việc'
        : 'Lỗi khi xóa lịch'
      toast(msg, 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function openServerPreview(sc) {
    setPreviewModal({ schedule: sc, dates: [], loading: true })
    try {
      const dates = await schedulesApi.previewSchedule(sc.id)
      setPreviewModal(prev => prev ? { ...prev, dates, loading: false } : null)
    } catch {
      setPreviewModal(prev => prev ? { ...prev, loading: false } : null)
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function setField(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    setFormErrors(fe => { const n = { ...fe }; delete n[key]; delete n.submit; return n })
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className={s.scHeader}>
        <div className={s.scHeaderLeft}>
          <span className={s.scHeaderTitle}>Lịch định kỳ</span>
          {!loading && (
            <span className={s.scHeaderCount}>{schedules.length}</span>
          )}
        </div>
        <div className={s.scHeaderRight}>
          <button className={s.btnGhost} onClick={load} title="Tải lại" disabled={loading}>
            <RefreshCw size={14} className={loading ? s.spin : ''} />
          </button>
          {isAdmin && (
            <button className={s.btnPrimary} onClick={openCreate}>
              <Plus size={14} />
              Thêm lịch
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className={s.loadingCenter}>
          <Loader2 size={20} className={s.spin} />
          Đang tải...
        </div>
      ) : error ? (
        <div className={s.errorState}>{error}</div>
      ) : schedules.length === 0 ? (
        <div className={s.emptyState}>
          <div className={s.emptyIcon}><CalendarDays size={24} /></div>
          <p className={s.emptyTitle}>Chưa có lịch định kỳ</p>
          <p className={s.emptyDesc}>
            {isAdmin
              ? 'Nhấn "Thêm lịch" để cấu hình lịch tự động sinh công việc cho công ty này.'
              : 'Chưa có lịch định kỳ nào được cấu hình.'}
          </p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Loại công việc</th>
                  <th>Lịch lặp</th>
                  <th>Nhân viên</th>
                  <th>Deadline / SLA</th>
                  <th>Trạng thái</th>
                  <th className={s.actionsHead}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map(sc => (
                  <tr key={sc.id}>
                    <td>
                      <div className={s.scTypeName}>{sc.taskTypeName}</div>
                    </td>
                    <td>
                      <div className={s.scRecurrenceLabel}>{RECURRENCE_LABELS[sc.recurrenceType]}</div>
                      <div className={s.scRecurrenceDesc}>{describeRecurrence(sc.recurrenceType, sc.recurrenceConfig)}</div>
                    </td>
                    <td>
                      {sc.assignedStaffName
                        ? <span className={s.scStaffName}>{sc.assignedStaffName}</span>
                        : <span className={s.unassigned}>Chưa phân công</span>
                      }
                    </td>
                    <td>
                      <div className={s.scDeadlineInfo}>
                        <span className={s.scDeadlineTag}>+{sc.deadlineOffsetDays}d</span>
                        {sc.overrideSlaDays != null && (
                          <span className={s.scSlaTag}>SLA {sc.overrideSlaDays}d</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`${s.scStatusBadge} ${sc.isActive ? s.scStatusOn : s.scStatusOff}`}>
                        <span className={s.statusDot} />
                        {sc.isActive ? 'Đang hoạt động' : 'Tạm dừng'}
                      </span>
                    </td>
                    <td>
                      <div className={s.rowActions}>
                        <button
                          className={`${s.rowActionBtn} ${s.rowActionView}`}
                          onClick={() => openServerPreview(sc)}
                          title="Xem lịch dự kiến"
                        >
                          <Eye size={14} />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              className={`${s.rowActionBtn} ${sc.isActive ? s.scToggleOff : s.scToggleOn}`}
                              onClick={() => handleToggle(sc)}
                              disabled={togglingId === sc.id}
                              title={sc.isActive ? 'Tắt lịch' : 'Bật lịch'}
                            >
                              {togglingId === sc.id
                                ? <Loader2 size={14} className={s.spin} />
                                : <Power size={14} />
                              }
                            </button>
                            <button
                              className={s.rowActionBtn}
                              onClick={() => openEdit(sc)}
                              title="Chỉnh sửa"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                              onClick={() => setDeleteTarget(sc)}
                              title="Xóa lịch"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      {modal && (
        <Modal
          title={modal.mode === 'create' ? 'Tạo lịch định kỳ' : 'Chỉnh sửa lịch định kỳ'}
          onClose={() => setModal(null)}
          wide
        >
          <div className={s.scModalGrid}>

            {/* Left: form */}
            <div className={s.scModalLeft}>
              {formErrors.submit && (
                <div className={s.errorBox}>{formErrors.submit}</div>
              )}

              {/* Task type — only on create */}
              {modal.mode === 'create' ? (
                <div className={s.formField}>
                  <label className={`${s.formLabel} ${s.formLabelReq}`}>Loại công việc</label>
                  <select
                    className={`${s.formSelect} ${formErrors.taskTypeId ? s.formInputError : ''}`}
                    value={form.taskTypeId}
                    onChange={e => setField('taskTypeId', e.target.value)}
                  >
                    <option value="">-- Chọn loại công việc --</option>
                    {taskTypes.map(tt => (
                      <option key={tt.id} value={tt.id}>{tt.name}</option>
                    ))}
                  </select>
                  {formErrors.taskTypeId && (
                    <div className={s.formError}>{formErrors.taskTypeId}</div>
                  )}
                </div>
              ) : (
                <div className={s.formField}>
                  <div className={s.scEditTypeLabel}>Loại công việc</div>
                  <div className={s.scEditTypeName}>{modal.schedule.taskTypeName}</div>
                </div>
              )}

              {/* Staff */}
              <div className={s.formField}>
                <label className={s.formLabel}>Nhân viên phụ trách</label>
                <select
                  className={s.formSelect}
                  value={form.assignedStaffId}
                  onChange={e => setField('assignedStaffId', e.target.value)}
                >
                  <option value="">-- Chưa phân công --</option>
                  {staff.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Recurrence type */}
              <div className={s.formField}>
                <label className={`${s.formLabel} ${s.formLabelReq}`}>Loại lịch lặp</label>
                <select
                  className={s.formSelect}
                  value={form.recurrenceType}
                  onChange={e => {
                    const t = e.target.value
                    setForm(f => ({ ...f, recurrenceType: t, recurrenceConfig: defaultConfig(t) }))
                    setFormErrors(fe => { const n = { ...fe }; delete n.recurrenceConfig; delete n.submit; return n })
                  }}
                >
                  {RECURRENCE_TYPES.map(rt => (
                    <option key={rt.value} value={rt.value}>{rt.label}</option>
                  ))}
                </select>
              </div>

              {/* Recurrence config */}
              <div className={s.scConfigSection}>
                <div className={s.scConfigSectionTitle}>Cấu hình lịch lặp</div>
                <RecurrenceConfigPanel
                  type={form.recurrenceType}
                  config={form.recurrenceConfig}
                  onChange={cfg => {
                    setForm(f => ({ ...f, recurrenceConfig: cfg }))
                    setFormErrors(fe => { const n = { ...fe }; delete n.recurrenceConfig; delete n.submit; return n })
                  }}
                />
                {formErrors.recurrenceConfig && (
                  <div className={s.formError}>{formErrors.recurrenceConfig}</div>
                )}
              </div>

              {/* Deadline offset + override SLA */}
              <div className={s.formGrid2}>
                <div className={s.formField}>
                  <label className={s.formLabel}>Deadline offset (ngày)</label>
                  <input
                    type="number" min="0"
                    className={s.formInput}
                    value={form.deadlineOffsetDays}
                    onChange={e => setField('deadlineOffsetDays', e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0))}
                  />
                  <div className={s.formHint}>Số ngày sau ngày kích hoạt</div>
                </div>
                <div className={s.formField}>
                  <label className={s.formLabel}>Override SLA (ngày)</label>
                  <input
                    type="number" min="1"
                    placeholder="Mặc định từ loại CV"
                    className={`${s.formInput} ${formErrors.overrideSlaDays ? s.formInputError : ''}`}
                    value={form.overrideSlaDays}
                    onChange={e => setField('overrideSlaDays', e.target.value)}
                  />
                  {formErrors.overrideSlaDays && (
                    <div className={s.formError}>{formErrors.overrideSlaDays}</div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className={s.formField}>
                <label className={s.formLabel}>Ghi chú</label>
                <textarea
                  rows={2}
                  className={s.formTextarea}
                  placeholder="Ghi chú thêm..."
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                />
              </div>
            </div>

            {/* Right: preview */}
            <div className={s.scModalRight}>
              <PreviewPanel type={form.recurrenceType} config={form.recurrenceConfig} />
            </div>
          </div>

          <div className={s.modalActions}>
            <button className={s.btnOutline} onClick={() => setModal(null)} disabled={saving}>
              Hủy
            </button>
            <button className={s.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving
                ? <><Loader2 size={13} className={s.spin} /> Đang lưu…</>
                : modal.mode === 'create' ? 'Tạo lịch' : 'Lưu thay đổi'
              }
            </button>
          </div>
        </Modal>
      )}

      {/* ── Server preview modal ── */}
      {previewModal && (
        <Modal
          title={`Lịch dự kiến — ${previewModal.schedule.taskTypeName}`}
          onClose={() => setPreviewModal(null)}
        >
          {previewModal.loading ? (
            <div className={s.loadingCenter}>
              <Loader2 size={18} className={s.spin} /> Đang tải...
            </div>
          ) : (
            <div className={s.scServerPreview}>
              <div className={s.scPreviewTitle}>
                <CalendarDays size={14} />
                10 lần kích hoạt tiếp theo
              </div>
              {previewModal.dates.length === 0 ? (
                <div className={s.scPreviewEmpty}>Không có ngày nào sắp tới.</div>
              ) : (
                <ol className={s.scPreviewList}>
                  {previewModal.dates.map((d, i) => (
                    <li key={d} className={s.scPreviewItem}>
                      <span className={s.scPreviewIdx}>{i + 1}</span>
                      <span className={s.scPreviewDate}>{d}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          <div className={s.modalActions}>
            <button className={s.btnOutline} onClick={() => setPreviewModal(null)}>Đóng</button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <Modal title="Xóa lịch định kỳ" onClose={() => setDeleteTarget(null)}>
          <div className={s.terminateWarn}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              Bạn chắc chắn muốn xóa lịch <strong>{deleteTarget.taskTypeName}</strong>?
              Chỉ có thể xóa nếu lịch chưa sinh công việc nào. Hành động này không thể hoàn tác.
            </div>
          </div>
          <div className={s.modalActions}>
            <button className={s.btnOutline} onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Hủy
            </button>
            <button className={s.btnDanger} onClick={handleDelete} disabled={deleting}>
              {deleting
                ? <><Loader2 size={13} className={s.spin} /> Đang xóa…</>
                : 'Xóa lịch'
              }
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
