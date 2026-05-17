import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, Power, Check, X, Clock } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import s from './settings.module.css'

const SHIFT_TYPES = [
  { value: 'fixed',    label: 'Cố định' },
  { value: 'flexible', label: 'Linh hoạt' },
  { value: 'shift',    label: 'Theo ca' },
]

const OT_MULTIPLIERS = [
  { value: 1.5, label: '× 1.5 (ngày thường)' },
  { value: 2.0, label: '× 2.0 (cuối tuần)' },
  { value: 3.0, label: '× 3.0 (ngày lễ)' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

// ── Sub-tab strip ─────────────────────────────────────────────────────────────

const TABS = [
  { key: 'shifts',   label: 'Ca làm việc' },
  { key: 'holidays', label: 'Ngày lễ quốc gia' },
]

const tabStyle = {
  wrap: { display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 20 },
  btn: (active) => ({
    padding: '7px 16px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? '#d97706' : '#6b7280',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #d97706' : '2px solid transparent',
    marginBottom: -2,
    cursor: 'pointer',
    transition: 'color .15s',
  }),
}

// ── ShiftModal ────────────────────────────────────────────────────────────────

const EMPTY_SHIFT = {
  name: '',
  type: 'fixed',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: 60,
  lateToleranceMinutes: 5,
  earlyLeaveToleranceMinutes: 5,
  isActive: true,
}

function ShiftModal({ shift, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const isEdit   = Boolean(shift)

  const [form, setForm]     = useState(isEdit ? {
    name:                     shift.name,
    type:                     shift.type,
    startTime:                shift.start_time?.slice(0, 5) ?? '08:00',
    endTime:                  shift.end_time?.slice(0, 5) ?? '17:00',
    breakMinutes:             shift.break_minutes ?? 60,
    lateToleranceMinutes:     shift.late_tolerance_minutes ?? 5,
    earlyLeaveToleranceMinutes: shift.early_leave_tolerance_minutes ?? 5,
    isActive:                 shift.is_active ?? true,
  } : { ...EMPTY_SHIFT })
  const [saving, setSaving] = useState(false)

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      addToast('Tên ca làm việc không được để trống', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        name:                       form.name.trim(),
        type:                       form.type,
        startTime:                  form.startTime,
        endTime:                    form.endTime,
        breakMinutes:               Number(form.breakMinutes),
        lateToleranceMinutes:       Number(form.lateToleranceMinutes),
        earlyLeaveToleranceMinutes: Number(form.earlyLeaveToleranceMinutes),
        isActive:                   form.isActive,
      }
      if (isEdit) {
        await attendanceApi.updateShift(shift.id, body)
        addToast('Đã cập nhật ca làm việc', 'success')
      } else {
        await attendanceApi.createShift(body)
        addToast('Đã tạo ca làm việc', 'success')
      }
      onSaved()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể lưu ca làm việc', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={isEdit ? 'Chỉnh sửa ca làm việc' : 'Tạo ca làm việc mới'}>
      <form onSubmit={handleSubmit} className={s.modalForm}>
        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Tên ca *</label>
            <input
              className={s.settingsInput}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="VD: Ca hành chính"
            />
          </div>
          <div>
            <label className={s.settingsLabel}>Loại ca</label>
            <select className={s.settingsSelect} value={form.type} onChange={(e) => set('type', e.target.value)}>
              {SHIFT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Giờ bắt đầu</label>
            <input
              type="time"
              className={s.settingsInput}
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </div>
          <div>
            <label className={s.settingsLabel}>Giờ kết thúc</label>
            <input
              type="time"
              className={s.settingsInput}
              value={form.endTime}
              onChange={(e) => set('endTime', e.target.value)}
            />
          </div>
        </div>

        <div className={s.formGrid2}>
          <div>
            <label className={s.settingsLabel}>Giờ nghỉ trưa (phút)</label>
            <input
              type="number" min={0} max={120}
              className={s.settingsInput}
              value={form.breakMinutes}
              onChange={(e) => set('breakMinutes', e.target.value)}
            />
          </div>
          <div>
            <label className={s.settingsLabel}>Dung sai đi trễ (phút)</label>
            <input
              type="number" min={0} max={60}
              className={s.settingsInput}
              value={form.lateToleranceMinutes}
              onChange={(e) => set('lateToleranceMinutes', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={s.settingsLabel}>Dung sai về sớm (phút)</label>
          <input
            type="number" min={0} max={60}
            className={s.settingsInput}
            style={{ maxWidth: 180 }}
            value={form.earlyLeaveToleranceMinutes}
            onChange={(e) => set('earlyLeaveToleranceMinutes', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <input
            id="shift-active"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set('isActive', e.target.checked)}
          />
          <label htmlFor="shift-active" className={s.settingsLabel} style={{ margin: 0 }}>
            Kích hoạt ca này
          </label>
        </div>

        <div className={s.modalActions}>
          <button type="button" className={s.btnOutline} onClick={onClose} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnSave} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            {isEdit ? 'Cập nhật' : 'Tạo ca'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── ShiftsTab ─────────────────────────────────────────────────────────────────

function ShiftsTab() {
  const addToast             = useToastStore((st) => st.toast)
  const [shifts, setShifts]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]    = useState(null) // null | 'create' | shift-object
  const [toggling, setToggling] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await attendanceApi.listShifts(false) // all shifts including inactive
      setShifts(data ?? [])
    } catch {
      addToast('Không thể tải danh sách ca làm việc', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load() }, [load])

  async function handleToggle(shift) {
    setToggling(shift.id)
    try {
      await attendanceApi.updateShift(shift.id, { isActive: !shift.is_active })
      addToast(shift.is_active ? 'Đã tắt ca làm việc' : 'Đã kích hoạt ca làm việc', 'success')
      load()
    } catch {
      addToast('Không thể cập nhật trạng thái', 'error')
    } finally {
      setToggling(null)
    }
  }

  function fmtTime(t) {
    if (!t) return '—'
    return t.slice(0, 5)
  }

  const shiftTypeName = (type) => SHIFT_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <div>
      <div className={s.usersToolbar} style={{ marginBottom: 12 }}>
        <p className={s.sectionText} style={{ margin: 0 }}>
          Quản lý các ca làm việc trong công ty. Mỗi nhân viên sẽ được gán vào một ca khi lập lịch tháng.
        </p>
        <button className={s.btnSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setModal('create')}>
          <Plus size={14} /> Tạo ca mới
        </button>
      </div>

      {loading ? (
        <div className={s.skeletonStack}>
          {[1, 2, 3].map((i) => <div key={i} className={s.skeletonLine} />)}
        </div>
      ) : shifts.length === 0 ? (
        <div className={s.emptyState}>
          <Clock size={32} style={{ color: '#d1d5db' }} />
          <p>Chưa có ca làm việc nào. Tạo ca đầu tiên để bắt đầu.</p>
        </div>
      ) : (
        <div className={s.userTableWrap}>
          <table className={s.settingsTable}>
            <thead>
              <tr>
                <th>Tên ca</th>
                <th>Loại</th>
                <th>Bắt đầu</th>
                <th>Kết thúc</th>
                <th>Nghỉ trưa</th>
                <th>Dung sai</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((sh) => (
                <tr key={sh.id}>
                  <td><strong>{sh.name}</strong></td>
                  <td>{shiftTypeName(sh.type)}</td>
                  <td>{fmtTime(sh.start_time)}</td>
                  <td>{fmtTime(sh.end_time)}</td>
                  <td>{sh.break_minutes ?? 0} phút</td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>
                    Trễ: {sh.late_tolerance_minutes ?? 0}p / Sớm: {sh.early_leave_tolerance_minutes ?? 0}p
                  </td>
                  <td>
                    {sh.is_active
                      ? <span className={s.statusActive}>Hoạt động</span>
                      : <span className={s.statusResigned}>Tắt</span>}
                  </td>
                  <td>
                    <div className={s.userActionsCell} style={{ justifyContent: 'flex-end' }}>
                      <button
                        className={s.iconBtn}
                        title={sh.is_active ? 'Tắt ca' : 'Kích hoạt ca'}
                        disabled={toggling === sh.id}
                        onClick={() => handleToggle(sh)}
                        style={{ color: sh.is_active ? '#dc2626' : '#059669' }}
                      >
                        {toggling === sh.id ? <Loader2 size={15} className={s.spin} /> : <Power size={15} />}
                      </button>
                      <button
                        className={s.iconBtn}
                        title="Chỉnh sửa"
                        onClick={() => setModal(sh)}
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'create' && (
        <ShiftModal onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
      {modal && modal !== 'create' && (
        <ShiftModal shift={modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} />
      )}
    </div>
  )
}

// ── HolidayModal ──────────────────────────────────────────────────────────────

function HolidayModal({ onClose, onSaved }) {
  const addToast             = useToastStore((st) => st.toast)
  const [form, setForm]      = useState({ holidayDate: '', name: '', otMultiplier: 3.0 })
  const [saving, setSaving]  = useState(false)

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.holidayDate) { addToast('Vui lòng chọn ngày lễ', 'error'); return }
    if (!form.name.trim()) { addToast('Tên ngày lễ không được để trống', 'error'); return }
    setSaving(true)
    try {
      await attendanceApi.createHoliday({
        holidayDate: form.holidayDate,
        name:        form.name.trim(),
        otMultiplier: Number(form.otMultiplier),
      })
      addToast('Đã thêm ngày lễ', 'success')
      onSaved()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể thêm ngày lễ', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Thêm ngày lễ">
      <form onSubmit={handleSubmit} className={s.modalForm}>
        <div>
          <label className={s.settingsLabel}>Ngày lễ *</label>
          <input
            type="date"
            className={s.settingsInput}
            value={form.holidayDate}
            onChange={(e) => set('holidayDate', e.target.value)}
          />
        </div>
        <div>
          <label className={s.settingsLabel}>Tên ngày lễ *</label>
          <input
            className={s.settingsInput}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="VD: Tết Nguyên Đán"
          />
        </div>
        <div>
          <label className={s.settingsLabel}>Hệ số OT ngày lễ</label>
          <select
            className={s.settingsSelect}
            value={form.otMultiplier}
            onChange={(e) => set('otMultiplier', e.target.value)}
          >
            {OT_MULTIPLIERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className={s.modalActions}>
          <button type="button" className={s.btnOutline} onClick={onClose} disabled={saving}>Huỷ</button>
          <button type="submit" className={s.btnSave} disabled={saving}>
            {saving && <Loader2 size={13} className={s.spin} />}
            Thêm ngày lễ
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── HolidaysTab ───────────────────────────────────────────────────────────────

function HolidaysTab() {
  const addToast               = useToastStore((st) => st.toast)
  const [year, setYear]        = useState(CURRENT_YEAR)
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading]  = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(async (y) => {
    setLoading(true)
    try {
      const data = await attendanceApi.listHolidays(y)
      setHolidays(Array.isArray(data) ? data : [])
    } catch {
      addToast('Không thể tải danh sách ngày lễ', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { load(year) }, [year, load])

  async function handleDelete(id) {
    setDeleting(id)
    try {
      await attendanceApi.deleteHoliday(id)
      addToast('Đã xoá ngày lễ', 'success')
      setDeleteTarget(null)
      load(year)
    } catch {
      addToast('Không thể xoá ngày lễ', 'error')
    } finally {
      setDeleting(null)
    }
  }

  function fmtDate(d) {
    if (!d) return '—'
    const dt = new Date(d)
    return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const dow = (d) => {
    if (!d) return ''
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    return days[new Date(d).getDay()]
  }

  return (
    <div>
      <div className={s.usersToolbar} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <p className={s.sectionText} style={{ margin: 0 }}>Quản lý ngày lễ quốc gia. Hệ số OT ngày lễ ảnh hưởng tính lương ngoài giờ.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Năm:</span>
            <select
              className={s.settingsSelect}
              style={{ width: 90 }}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button
          className={s.btnSave}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setShowModal(true)}
        >
          <Plus size={14} /> Thêm ngày lễ
        </button>
      </div>

      {loading ? (
        <div className={s.skeletonStack}>
          {[1, 2, 3, 4].map((i) => <div key={i} className={s.skeletonLine} />)}
        </div>
      ) : holidays.length === 0 ? (
        <div className={s.emptyState}>
          <p>Không có ngày lễ nào trong năm {year}.</p>
        </div>
      ) : (
        <div className={s.userTableWrap}>
          <table className={s.settingsTable}>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Thứ</th>
                <th>Tên ngày lễ</th>
                <th>Hệ số OT</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td><strong>{fmtDate(h.holiday_date)}</strong></td>
                  <td style={{ color: '#6b7280' }}>{dow(h.holiday_date)}</td>
                  <td>{h.name}</td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: '#fef3c7',
                      color: '#92400e',
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      × {Number(h.ot_multiplier).toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <div className={s.userActionsCell} style={{ justifyContent: 'flex-end' }}>
                      {deleteTarget === h.id ? (
                        <>
                          <span style={{ fontSize: 12, color: '#dc2626', marginRight: 4 }}>Xác nhận xoá?</span>
                          <button
                            className={s.iconBtn}
                            title="Xác nhận"
                            disabled={deleting === h.id}
                            onClick={() => handleDelete(h.id)}
                            style={{ color: '#dc2626' }}
                          >
                            {deleting === h.id ? <Loader2 size={14} className={s.spin} /> : <Check size={14} />}
                          </button>
                          <button
                            className={s.iconBtn}
                            title="Huỷ"
                            onClick={() => setDeleteTarget(null)}
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          className={s.iconBtn}
                          title="Xoá"
                          onClick={() => setDeleteTarget(h.id)}
                          style={{ color: '#dc2626' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <HolidayModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(year) }}
        />
      )}
    </div>
  )
}

// ── AttendanceConfigSection ───────────────────────────────────────────────────

export default function AttendanceConfigSection() {
  const [activeTab, setActiveTab] = useState('shifts')

  return (
    <div>
      <p className={s.sectionText}>
        Thiết lập ca làm việc và ngày lễ quốc gia — nền tảng để lập lịch chấm công và tính lương.
      </p>

      <div style={tabStyle.wrap}>
        {TABS.map((t) => (
          <button
            key={t.key}
            style={tabStyle.btn(activeTab === t.key)}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'shifts'   && <ShiftsTab />}
      {activeTab === 'holidays' && <HolidaysTab />}
    </div>
  )
}
