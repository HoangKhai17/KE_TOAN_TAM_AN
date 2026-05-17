import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Loader2, Power, Check, X, Clock } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import { useToastStore } from '../../stores/toastStore'
import * as attendanceApi from '../../api/attendance'
import s from './settings.module.css'

// shift_type enum values that actually exist in the DB (migration 035)
const SHIFT_TYPES = [
  { value: 'fixed',    label: 'Cố định' },
  { value: 'flexible', label: 'Linh hoạt' },
]

const OT_MULTIPLIERS = [
  { value: 1.5, label: '× 1.5 (ngày thường)' },
  { value: 2.0, label: '× 2.0 (cuối tuần)' },
  { value: 3.0, label: '× 3.0 (ngày lễ)' },
]

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

// Default values for a new shift form
const EMPTY_SHIFT = {
  name:         '',
  shiftType:    'fixed',
  startTime:    '08:00',
  endTime:      '17:00',
  breakMinutes: 60,
  toleranceIn:  5,
  toleranceOut: 5,
  isActive:     true,
}

function ShiftModal({ shift, onClose, onSaved }) {
  const addToast = useToastStore((st) => st.toast)
  const isEdit   = Boolean(shift)

  // Backend DTO uses camelCase: shiftType, startTime, endTime, breakMinutes, toleranceIn, toleranceOut, isActive
  const [form, setForm] = useState(
    isEdit
      ? {
          name:         shift.name,
          shiftType:    shift.shiftType    ?? 'fixed',
          startTime:    shift.startTime    ? String(shift.startTime).slice(0, 5) : '08:00',
          endTime:      shift.endTime      ? String(shift.endTime).slice(0, 5)   : '17:00',
          breakMinutes: shift.breakMinutes ?? 60,
          toleranceIn:  shift.toleranceIn  ?? 5,
          toleranceOut: shift.toleranceOut ?? 5,
          isActive:     shift.isActive     ?? true,
        }
      : { ...EMPTY_SHIFT }
  )
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
      // Send camelCase to match what shifts.router.js expects
      const body = {
        name:         form.name.trim(),
        shiftType:    form.shiftType,
        startTime:    form.startTime,
        endTime:      form.endTime,
        breakMinutes: Number(form.breakMinutes),
        toleranceIn:  Number(form.toleranceIn),
        toleranceOut: Number(form.toleranceOut),
        isActive:     form.isActive,
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
            <select
              className={s.settingsSelect}
              value={form.shiftType}
              onChange={(e) => set('shiftType', e.target.value)}
            >
              {SHIFT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
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
            <label className={s.settingsLabel}>Nghỉ trưa (phút)</label>
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
              value={form.toleranceIn}
              onChange={(e) => set('toleranceIn', e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className={s.settingsLabel}>Dung sai về sớm (phút)</label>
          <input
            type="number" min={0} max={60}
            className={s.settingsInput}
            style={{ maxWidth: 180 }}
            value={form.toleranceOut}
            onChange={(e) => set('toleranceOut', e.target.value)}
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
  const addToast              = useToastStore((st) => st.toast)
  const [shifts, setShifts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null) // null | 'create' | shift-object
  const [toggling, setToggling] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // activeOnly=false → show all including inactive
      const data = await attendanceApi.listShifts(false)
      setShifts(Array.isArray(data) ? data : [])
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
      // Only send isActive to avoid overwriting other fields with undefined
      await attendanceApi.updateShift(shift.id, { isActive: !shift.isActive })
      addToast(shift.isActive ? 'Đã tắt ca làm việc' : 'Đã kích hoạt ca làm việc', 'success')
      load()
    } catch {
      addToast('Không thể cập nhật trạng thái', 'error')
    } finally {
      setToggling(null)
    }
  }

  // Format TIME string "HH:MM:SS" → "HH:MM"
  function fmtTime(t) {
    if (!t) return '—'
    return String(t).slice(0, 5)
  }

  const shiftTypeName = (type) =>
    SHIFT_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <div>
      <div className={s.usersToolbar} style={{ marginBottom: 12 }}>
        <p className={s.sectionText} style={{ margin: 0 }}>
          Quản lý ca làm việc. Ca không thể xoá — chỉ có thể tắt nếu không muốn sử dụng.
        </p>
        <button
          className={s.btnSave}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          onClick={() => setModal('create')}
        >
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
                <tr key={sh.id} style={!sh.isActive ? { opacity: 0.55 } : {}}>
                  <td><strong>{sh.name}</strong></td>
                  <td>{shiftTypeName(sh.shiftType)}</td>
                  <td>{fmtTime(sh.startTime)}</td>
                  <td>{fmtTime(sh.endTime)}</td>
                  <td>{sh.breakMinutes ?? 0} phút</td>
                  <td style={{ fontSize: 12, color: '#6b7280' }}>
                    Trễ: {sh.toleranceIn ?? 0}p / Sớm: {sh.toleranceOut ?? 0}p
                  </td>
                  <td>
                    {sh.isActive
                      ? <span className={s.statusActive}>Hoạt động</span>
                      : <span className={s.statusResigned}>Đã tắt</span>}
                  </td>
                  <td>
                    <div className={s.userActionsCell} style={{ justifyContent: 'flex-end' }}>
                      <button
                        className={s.iconBtn}
                        title={sh.isActive ? 'Tắt ca' : 'Kích hoạt ca'}
                        disabled={toggling === sh.id}
                        onClick={() => handleToggle(sh)}
                        style={{ color: sh.isActive ? '#dc2626' : '#059669' }}
                      >
                        {toggling === sh.id
                          ? <Loader2 size={15} className={s.spin} />
                          : <Power size={15} />}
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
        <ShiftModal
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
      {modal && modal !== 'create' && (
        <ShiftModal
          shift={modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

// ── HolidayModal ──────────────────────────────────────────────────────────────

function HolidayModal({ onClose, onSaved }) {
  const addToast            = useToastStore((st) => st.toast)
  const [form, setForm]     = useState({ holidayDate: '', name: '', otMultiplier: 3.0 })
  const [saving, setSaving] = useState(false)

  function set(field, val) { setForm((f) => ({ ...f, [field]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.holidayDate) { addToast('Vui lòng chọn ngày lễ', 'error'); return }
    if (!form.name.trim()) { addToast('Tên ngày lễ không được để trống', 'error'); return }
    setSaving(true)
    try {
      await attendanceApi.createHoliday({
        holidayDate:  form.holidayDate,
        name:         form.name.trim(),
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
            {OT_MULTIPLIERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
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

const DOW_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

// Parse a date string (YYYY-MM-DD or ISO) safely in local timezone
function parseDateLocal(d) {
  if (!d) return null
  const s = typeof d === 'string' ? d : String(d)
  // Avoid UTC shift: treat "YYYY-MM-DD" as local date
  const [y, mo, day] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, mo - 1, day)
}

function fmtDateVI(d) {
  const dt = parseDateLocal(d)
  if (!dt) return '—'
  return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dowVI(d) {
  const dt = parseDateLocal(d)
  if (!dt) return ''
  return DOW_VI[dt.getDay()]
}

function HolidaysTab() {
  const addToast                = useToastStore((st) => st.toast)
  const [allHolidays, setAllHolidays] = useState([]) // all holidays ever loaded
  const [yearOptions, setYearOptions] = useState([]) // distinct years from data
  const [year, setYear]         = useState(null)     // currently selected year
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(null)

  // Load holidays WITHOUT year filter to get all years, then derive year list
  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const data = await attendanceApi.listHolidays() // no year → all holidays
      const holidays = Array.isArray(data) ? data : []
      setAllHolidays(holidays)

      // Derive distinct years from data
      const years = [...new Set(
        holidays.map((h) => {
          const dt = parseDateLocal(h.holidayDate)
          return dt ? dt.getFullYear() : null
        }).filter(Boolean)
      )].sort()

      const currentYear = new Date().getFullYear()
      if (!years.includes(currentYear)) years.push(currentYear)
      years.sort()

      setYearOptions(years)
      setYear((prev) => {
        if (prev && years.includes(prev)) return prev
        return currentYear
      })
    } catch {
      addToast('Không thể tải danh sách ngày lễ', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { loadAll() }, [loadAll])

  // Filter by selected year on the client side
  const holidays = year
    ? allHolidays.filter((h) => {
        const dt = parseDateLocal(h.holidayDate)
        return dt && dt.getFullYear() === year
      })
    : allHolidays

  async function handleDelete(id) {
    setDeleting(id)
    try {
      await attendanceApi.deleteHoliday(id)
      addToast('Đã xoá ngày lễ', 'success')
      setDeleteTarget(null)
      loadAll()
    } catch {
      addToast('Không thể xoá ngày lễ', 'error')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <div className={s.usersToolbar} style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p className={s.sectionText} style={{ margin: 0 }}>
            Quản lý ngày lễ quốc gia. Hệ số OT ngày lễ ảnh hưởng tính lương ngoài giờ.
          </p>
          {yearOptions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>Năm:</span>
              <select
                className={s.settingsSelect}
                style={{ width: 90 }}
                value={year ?? ''}
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button
          className={s.btnSave}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
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
          <p>Không có ngày lễ nào{year ? ` trong năm ${year}` : ''}.</p>
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
                  <td><strong>{fmtDateVI(h.holidayDate)}</strong></td>
                  <td style={{ color: '#6b7280' }}>{dowVI(h.holidayDate)}</td>
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
                      × {Number(h.otMultiplier).toFixed(1)}
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
                            {deleting === h.id
                              ? <Loader2 size={14} className={s.spin} />
                              : <Check size={14} />}
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
          onSaved={() => { setShowModal(false); loadAll() }}
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
