import { useState, useEffect, useMemo, Fragment } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import {
  CalendarDays, Plus, Eye, Power, Pencil, Trash2, Loader2, AlertTriangle, RefreshCw, ChevronDown, GitBranch,
  ChevronLeft, ChevronRight, ChevronUp, Star,
} from 'lucide-react'
import * as schedulesApi from '../../api/schedules'
import { listTaskTypes, getChecklist, getSubtaskTemplates } from '../../api/taskTypes'
import { listUserOptions } from '../../api/users'
import { listHolidays } from '../../api/attendance'
import { getNextOccurrences, rollForwardToWorkday } from '../../utils/recurrencePreview'
import { diffOptionsOr, defaultPointsFor } from '../../utils/checklistDifficulty'
import { useEnumsStore } from '../../hooks/useEnums'
import { useToastStore } from '../../stores/toastStore'
import Modal from '../../components/ui/Modal'
import DeleteConfirmDialog, { useDeleteConfirm } from '../../components/ui/DeleteConfirmDialog'
import DateBox from './DateBox'
import {
  DragHeaderCell, DragRowCell, IndexHeaderCell, IndexRowCell,
  SelectionHeaderCell, SelectionRowCell, useRowReorder, useRowSelection,
} from '../../components/ui/data-table'
import { useCompanyFooter } from './companyFooter'
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

// Kỳ nghiệp vụ có thể LỆCH so với ngày làm việc: bảng lương tháng 6 thì làm
// trong tháng 7 → nhãn kỳ phải là T06 dù task sinh tháng 7.
// Lưu trong recurrenceConfig.period_offset, mặc định 0 (không lệch).
// Đơn vị lệch khớp với ĐỘ MỊN CỦA NHÃN KỲ, không phải chu kỳ lặp.
// Lịch hàng tuần có nhãn theo tháng (T07/2026) nên lệch cũng tính theo tháng.
const PERIOD_UNIT = {
  daily: 'ngày', weekly: 'ngày', quarterly: 'quý', yearly: 'năm',
}
const periodUnit = (type) => PERIOD_UNIT[type] || 'tháng'

function periodOffsetOptions(type) {
  const dv = periodUnit(type)
  return [
    { value: -3, label: `Lùi 3 ${dv}` },
    { value: -2, label: `Lùi 2 ${dv}` },
    { value: -1, label: `Lùi 1 ${dv}` },
    { value: 0,  label: 'Cùng kỳ (mặc định)' },
    { value: 1,  label: `Tiến 1 ${dv}` },
    { value: 2,  label: `Tiến 2 ${dv}` },
    { value: 3,  label: `Tiến 3 ${dv}` },
  ]
}

// Xem trước nhãn kỳ sẽ sinh ra, tính trên NGÀY HÔM NAY cho dễ hình dung
function previewPeriodLabel(type, offset) {
  const d = new Date()
  const off = Number(offset) || 0
  if (off) {
    if (type === 'daily' || type === 'weekly') d.setDate(d.getDate() + off)
    else if (type === 'quarterly') d.setMonth(d.getMonth() + off * 3)
    else if (type === 'yearly')    d.setFullYear(d.getFullYear() + off)
    else { d.setDate(1); d.setMonth(d.getMonth() + off) }
  }
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(-2)   // năm 2 chữ số (2026 → 26)
  if (type === 'daily' || type === 'weekly' || type === 'once' || type === 'custom_dates') return `${dd}/${mm}/${yy}`
  if (type === 'quarterly') return `Q${Math.ceil((d.getMonth() + 1) / 3)}/${yy}`
  if (type === 'yearly')    return `${yy}`
  return `T${mm}/${yy}`
}

const RECURRENCE_LABELS = Object.fromEntries(RECURRENCE_TYPES.map(r => [r.value, r.label]))

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const MONTH_LABELS   = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                        'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

// ── Helpers ────────────────────────────────────────────────────────────────────

// Hạn dự kiến của kỳ kế tiếp có vượt trần "ngày N hàng tháng" không → báo lỗi realtime.
function capViolation(type, config, offsetDays, maxDueDay) {
  if (maxDueDay == null) return null
  let occs
  try { occs = getNextOccurrences(type, config, new Date(), 1) } catch { return null }
  if (!occs || !occs.length) return null
  const due = addDays(parseISO(occs[0]), Number(offsetDays) || 0)
  const y = due.getFullYear(), m = due.getMonth() + 1
  const capDay = Math.min(maxDueDay, new Date(y, m, 0).getDate())
  const dueStr = format(due, 'yyyy-MM-dd')
  const ceiling = `${y}-${String(m).padStart(2, '0')}-${String(capDay).padStart(2, '0')}`
  return dueStr > ceiling ? { dueDisp: format(due, 'dd/MM/yyyy'), maxDueDay } : null
}

function emptyForm() {
  return {
    mode: 'template',   // 'template' = từ mẫu | 'manual' = tự tạo (tên riêng + checklist tự dựng)
    title: '',          // tên riêng khi tự tạo
    taskTypeId: '',
    assignedStaffId: '',
    recurrenceType: 'monthly_by_date',
    recurrenceConfig: { day: 1 },
    deadlineOffsetDays: 0,
    overrideSlaDays: '',
    checklist: [],   // KPI v2: checklist RIÊNG của lịch (draft: [{_key, stepText, level, difficulty, points, isImportant, sourceTemplateStepId}])
    subtasks: [],    // KPI v2: VIỆC CON của lịch (draft: [{_key, title, startOffset, deadlineOffset, sourceTemplateSubtaskId, items:[...]}])
    notes: '',
  }
}

// KPI v2 — helper draft checklist của lịch
let _clSeq = 0
function clKey() { return `cl_${Date.now()}_${_clSeq++}` }
function mapTemplateToDraft(steps) {
  return (steps || []).map((s) => ({
    _key: clKey(), stepText: s.stepText, level: s.level ?? 0,
    difficulty: s.difficulty ?? 'trung_binh', points: s.points ?? 4,
    isImportant: !!s.isImportant, sourceTemplateStepId: s.id ?? null,
  }))
}
function mapScheduleToDraft(items) {
  return (items || []).map((it) => ({
    _key: clKey(), stepText: it.stepText, level: it.level ?? 0,
    difficulty: it.difficulty ?? 'trung_binh', points: it.points ?? 4,
    isImportant: !!it.isImportant, sourceTemplateStepId: it.sourceTemplateStepId ?? null,
  }))
}

// ── VIỆC CON của lịch: helper draft ──────────────────────────────────────────
let _subSeq = 0
function subKey() { return `sub_${Date.now()}_${_subSeq++}` }
// Từ MẪU (getSubtaskTemplates → {title, dueOffsetDays, steps:[{stepText,level,difficulty,points,isImportant,id}]})
function mapTemplateSubsToDraft(subs) {
  return (subs || []).map((sub) => ({
    _key: subKey(), title: sub.title || '', startOffset: 0, deadlineOffset: sub.dueOffsetDays ?? 0,
    sourceTemplateSubtaskId: sub.id ?? null,
    items: mapTemplateToDraft(sub.steps || []),
  }))
}
// Từ LỊCH (getScheduleSubtasks → {title, startOffset, deadlineOffset, sourceTemplateSubtaskId, items:[...]})
function mapScheduleSubsToDraft(subs) {
  return (subs || []).map((sub) => ({
    _key: subKey(), title: sub.title || '', startOffset: sub.startOffset ?? 0, deadlineOffset: sub.deadlineOffset ?? 0,
    sourceTemplateSubtaskId: sub.sourceTemplateSubtaskId ?? null,
    items: mapScheduleToDraft(sub.items || []),
  }))
}
function newSubtaskDraft() {
  return { _key: subKey(), title: '', startOffset: 0, deadlineOffset: 0, sourceTemplateSubtaskId: null, items: [] }
}
function newSubStepDraft() {
  return { _key: clKey(), stepText: '', level: 0, difficulty: 'trung_binh', points: 4, isImportant: false, sourceTemplateStepId: null }
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
  if (form.mode === 'manual' && !(form.title || '').trim()) errors.title = 'Vui lòng nhập tên lịch'

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
        <DateBox
          value={newDate}
          min={today}
          className={s.scConfigDate}
          onChange={setNewDate}
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
        <>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Mỗi N ngày</label>
            <input
              type="number" min="1" max="365"
              value={config.every_n_days ?? 1}
              className={s.scConfigInput}
              onChange={e => onChange({ ...config, every_n_days: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Ngày bắt đầu</label>
            <DateBox
              value={config.start_date ?? ''}
              className={s.scConfigDate}
              onChange={(v) => {
                const next = { ...config }
                if (v) next.start_date = v; else delete next.start_date
                onChange(next)
              }}
            />
          </div>
          <div className={s.formHint} style={{ marginTop: 8 }}>
            Để trống = bắt đầu theo chu kỳ mặc định. Kỳ rơi CN/ngày lễ sẽ tự đẩy sang ngày làm việc kế.
          </div>
        </>
      )

    case 'weekly':
      return (
        <>
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
          <div className={s.scConfigRow}>
            <label className={s.scConfigLabel}>Ngày bắt đầu</label>
            <DateBox
              value={config.start_date ?? ''}
              className={s.scConfigDate}
              onChange={(v) => {
                const next = { ...config }
                if (v) next.start_date = v; else delete next.start_date
                onChange(next)
              }}
            />
          </div>
          <div className={s.formHint} style={{ marginTop: 8 }}>
            Để trống = bắt đầu ngay kỳ tới. Không sinh công việc trước ngày bắt đầu.
          </div>
        </>
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
          <DateBox
            value={config.date ?? ''}
            min={format(new Date(), 'yyyy-MM-dd')}
            className={s.scConfigDate}
            onChange={v => onChange({ ...config, date: v })}
          />
        </div>
      )

    default:
      return null
  }
}

function PreviewPanel({ type, config, holidaySet }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dates = useMemo(() => {
    try { return getNextOccurrences(type, config, new Date(), 10, holidaySet) }
    catch { return [] }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(config), holidaySet])

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
            <li key={i} className={s.scPreviewItem}>
              <span className={s.scPreviewIdx}>{i + 1}</span>
              <span className={s.scPreviewDate}>{d}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// Nhân bản 1 việc con nháp (tránh sửa trực tiếp danh sách trước khi bấm Lưu ở popup con).
function cloneSubtaskDraft(sub) {
  return { ...sub, items: (sub.items || []).map((it) => ({ ...it })) }
}

// ── Danh sách VIỆC CON (gọn) — thêm/sửa qua popup riêng SubtaskFormModal ──
function SubtaskList({ subtasks, onAdd, onEdit, onRemove, onResetFromTemplate, subPreviewOcc, previewSubDate }) {
  return (
    <div className={s.formField}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <label className={s.formLabel} style={{ margin: 0 }}>
          Việc con <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>· {subtasks.length}</span>
        </label>
        {onResetFromTemplate && (
          <button type="button" className={s.scClResetBtn} onClick={onResetFromTemplate} title="Nạp việc con từ mẫu của loại CV (ghi đè danh sách hiện tại)">
            <RefreshCw size={12} /> Lấy từ mẫu
          </button>
        )}
      </div>
      <div className={s.scStepPickHint}>
        Mỗi việc con là 1 công việc độc lập, có ngày bắt đầu &amp; hạn riêng (<b>ngày = ngày kỳ + số ngày offset</b>, tự đẩy khỏi CN/lễ) và checklist riêng có độ khó + điểm.
        {subPreviewOcc && <> Xem trước theo <b>kỳ sắp tới {format(subPreviewOcc, 'dd/MM/yyyy')}</b>.</>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {subtasks.length === 0 && <div className={s.scClEmpty}>Chưa có việc con. Bấm “+ Thêm việc con”.</div>}
        {subtasks.map((sub, i) => {
          const startN = Number(sub.startOffset) || 0
          const dueN = Math.max(Number(sub.deadlineOffset) || 0, startN)
          const invalid = Number(sub.deadlineOffset) < startN
          const totalPts = (sub.items || []).reduce((a, it) => a + (Number(it.points) || 0), 0)
          return (
            <div key={sub._key} style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--color-bg-soft, #f8fafc)' }}>
              <GitBranch size={13} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
              <button type="button" onClick={() => onEdit(i)} title="Sửa việc con"
                style={{ flex: '1 1 180px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, color: sub.title ? 'var(--color-text)' : 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sub.title || '(chưa đặt tên)'}
              </button>
              <span className={s.scDeadlineTag}>{(sub.items || []).length} bước · {totalPts}đ</span>
              <span className={s.scDeadlineTag} style={{ borderColor: invalid ? '#ef4444' : undefined, color: invalid ? '#ef4444' : undefined }}>BĐ +{startN}d · Hạn +{dueN}d</span>
              {subPreviewOcc && (
                <span style={{ fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>→ {previewSubDate(startN)} → {previewSubDate(dueN)}</span>
              )}
              <button type="button" className={s.rowActionBtn} onClick={() => onEdit(i)} title="Sửa"><Pencil size={13} /></button>
              <button type="button" className={s.scClDel} onClick={() => onRemove(i)} title="Xoá việc con"><Trash2 size={13} /></button>
            </div>
          )
        })}
      </div>
      <button type="button" className={s.scClAddBtn} onClick={onAdd} style={{ marginTop: 8 }}><Plus size={13} /> Thêm việc con</button>
    </div>
  )
}

// ── Popup THÊM/SỬA 1 việc con: tên + offset + checklist riêng (độ khó/điểm/★) ──
function SubtaskFormModal({ initial, isNew, diffOptions, subPreviewOcc, previewSubDate, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => cloneSubtaskDraft(initial))
  const [err, setErr] = useState('')

  const setNum = (field, v) => setDraft((d) => ({ ...d, [field]: v === '' ? 0 : Math.max(0, parseInt(v, 10) || 0) }))
  const setItemField = (j, field, value) => setDraft((d) => ({
    ...d,
    items: d.items.map((it, k) => {
      if (k !== j) return it
      const nx = { ...it, [field]: value }
      if (field === 'difficulty') nx.points = defaultPointsFor(value)
      return nx
    }),
  }))
  const addItem = () => setDraft((d) => ({ ...d, items: [...d.items, newSubStepDraft()] }))
  const removeItem = (j) => setDraft((d) => ({ ...d, items: d.items.filter((_, k) => k !== j) }))
  const moveItem = (j, dir) => setDraft((d) => {
    const items = d.items.slice()
    const t = j + dir
    if (t < 0 || t >= items.length) return d
    ;[items[j], items[t]] = [items[t], items[j]]
    return { ...d, items }
  })

  const startN = Number(draft.startOffset) || 0
  const dueN = Math.max(Number(draft.deadlineOffset) || 0, startN)
  const invalid = Number(draft.deadlineOffset) < startN
  const totalPts = draft.items.reduce((a, it) => a + (Number(it.points) || 0), 0)

  function submit() {
    if (!draft.title.trim()) { setErr('Vui lòng nhập tên việc con'); return }
    if (invalid) { setErr('Hạn không được nhỏ hơn ngày bắt đầu'); return }
    onSave({ ...draft, title: draft.title.trim() })
  }

  const inStyle = { width: 64, boxSizing: 'border-box', padding: '5px 8px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13, textAlign: 'center' }

  return (
    <Modal
      title={isNew ? 'Thêm việc con' : 'Sửa việc con'}
      onClose={onCancel}
      width="min(920px, calc(100vw - 40px))"
      maxWidth="920px"
    >
      {err && <div className={s.errorBox}>{err}</div>}

      <div className={s.formField}>
        <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên việc con</label>
        <input className={`${s.formInput} ${err && !draft.title.trim() ? s.formInputError : ''}`}
          value={draft.title} autoFocus
          onChange={(e) => { setErr(''); setDraft((d) => ({ ...d, title: e.target.value })) }}
          placeholder="VD: Đối chiếu công nợ" />
      </div>

      <div className={s.formGrid2}>
        <div className={s.formField}>
          <label className={s.formLabel}>Bắt đầu kỳ + (ngày)</label>
          <input type="number" min="0" className={s.formInput} value={draft.startOffset} onChange={(e) => { setErr(''); setNum('startOffset', e.target.value) }} />
        </div>
        <div className={s.formField}>
          <label className={s.formLabel}>Hạn kỳ + (ngày)</label>
          <input type="number" min="0" className={`${s.formInput} ${invalid ? s.formInputError : ''}`} value={draft.deadlineOffset} onChange={(e) => { setErr(''); setNum('deadlineOffset', e.target.value) }} />
        </div>
      </div>
      {subPreviewOcc && (
        <div style={{ margin: '2px 0 6px', fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: 'var(--color-muted)' }}>→ Kỳ {format(subPreviewOcc, 'dd/MM/yyyy')}:</span>
          <span className={s.scDeadlineTag} style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)' }}>bắt đầu {previewSubDate(startN)}</span>
          <span className={s.scDeadlineTag} style={{ background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)' }}>hạn {previewSubDate(dueN)}</span>
        </div>
      )}

      <div className={s.formField}>
        <label className={s.formLabel} style={{ margin: 0 }}>
          Checklist việc con <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>· {draft.items.length} bước · tổng {totalPts}đ</span>
        </label>
        <div className={s.scStepPickHint}>Đổi độ khó (tự gợi ý điểm) hoặc nhập điểm tay. <b>★</b> = bước quan trọng (hiện mặc định ở báo cáo).</div>
        <div className={s.scClList}>
          {draft.items.length === 0 && <div className={s.scClEmpty}>Chưa có bước nào. Bấm “+ Thêm bước”.</div>}
          {draft.items.map((it, j) => (
            <div key={it._key} className={`${s.scClRow} ${it.level === 1 ? s.scClRowChild : ''}`}>
              <div className={s.scClMove}>
                <button type="button" onClick={() => moveItem(j, -1)} disabled={j === 0} title="Lên"><ChevronUp size={12} /></button>
                <button type="button" onClick={() => moveItem(j, 1)} disabled={j === draft.items.length - 1} title="Xuống"><ChevronDown size={12} /></button>
              </div>
              <button type="button" className={s.scClIndent} onClick={() => setItemField(j, 'level', it.level === 1 ? 0 : 1)} title={it.level === 1 ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}>
                {it.level === 1 ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
              </button>
              <input className={s.scClText} value={it.stepText} onChange={(e) => setItemField(j, 'stepText', e.target.value)} placeholder="Nội dung bước…" />
              <button type="button" className={`${s.scClStar} ${it.isImportant ? s.scClStarOn : ''}`} onClick={() => setItemField(j, 'isImportant', !it.isImportant)} title={it.isImportant ? 'Bỏ quan trọng' : 'Đánh dấu quan trọng'}>
                <Star size={13} fill={it.isImportant ? 'currentColor' : 'none'} />
              </button>
              <select className={s.scClDiff} value={it.difficulty} onChange={(e) => setItemField(j, 'difficulty', e.target.value)} title="Độ khó">
                {diffOptionsOr(diffOptions).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <input type="number" min={0} max={100} className={s.scClPoints} value={it.points} onChange={(e) => setItemField(j, 'points', e.target.value)} title="Điểm" />
              <span className={s.scClUnit}>đ</span>
              <button type="button" className={s.scClDel} onClick={() => removeItem(j)} title="Xoá bước"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
        <button type="button" className={s.scClAddBtn} onClick={addItem}><Plus size={13} /> Thêm bước</button>
      </div>

      <div className={s.modalActions}>
        <button className={s.btnOutline} onClick={onCancel}>Hủy</button>
        <button className={s.btnPrimary} onClick={submit}>{isNew ? 'Thêm việc con' : 'Lưu việc con'}</button>
      </div>
    </Modal>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SchedulesTab({ company, isAdmin: _isAdmin }) {
  const confirmDelete = useDeleteConfirm()
  const toast = useToastStore(st => st.toast)
  const diffOptions = useEnumsStore((st) => st.getOptions)('checklist_difficulty')

  const [schedules,  setSchedules]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [taskTypes,  setTaskTypes]  = useState([])
  const [staff,      setStaff]      = useState([])
  const [holidaySet, setHolidaySet] = useState(null)  // Set 'yyyy-MM-dd' — để preview đẩy khỏi CN/lễ

  // Nạp ngày lễ (năm nay + năm sau) để preview khớp ngày task sinh thực tế
  useEffect(() => {
    let cancelled = false
    const y = new Date().getFullYear()
    Promise.all([listHolidays(y), listHolidays(y + 1)])
      .then(([a, b]) => {
        if (cancelled) return
        const set = new Set()
        for (const h of [...(a || []), ...(b || [])]) {
          const d = h.holidayDate || h.holiday_date
          if (d) set.add(String(d).slice(0, 10))
        }
        setHolidaySet(set)
      })
      .catch(() => { if (!cancelled) setHolidaySet(new Set()) })
    return () => { cancelled = true }
  }, [])

  // Modal
  const [modal,      setModal]      = useState(null)  // null | { mode, schedule? }
  const [form,       setForm]       = useState(emptyForm())
  const [formErrors, setFormErrors] = useState({})
  const [saving,     setSaving]     = useState(false)

  // KPI v2: khi TẠO lịch + chế độ TỪ MẪU → seed checklist VÀ việc con nháp từ mẫu của loại CV.
  // (Chế độ SỬA nạp từ chính lịch trong openEdit; chế độ tự tạo giữ bản tự dựng.)
  useEffect(() => {
    if (!modal || modal.mode !== 'create' || form.mode === 'manual' || !form.taskTypeId) return
    let cancelled = false
    getChecklist(form.taskTypeId)
      .then((steps) => { if (!cancelled) setForm((f) => ({ ...f, checklist: mapTemplateToDraft(steps) })) })
      .catch(() => { if (!cancelled) setForm((f) => ({ ...f, checklist: [] })) })
    getSubtaskTemplates(form.taskTypeId)
      .then((subs) => { if (!cancelled) setForm((f) => ({ ...f, subtasks: mapTemplateSubsToDraft(subs) })) })
      .catch(() => { if (!cancelled) setForm((f) => ({ ...f, subtasks: [] })) })
    return () => { cancelled = true }
  }, [modal?.mode, form.mode, form.taskTypeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Nạp việc con từ mẫu để GHI ĐÈ (nút "Lấy từ mẫu" trong editor).
  async function loadSubtasksFromTemplate() {
    if (!form.taskTypeId) return
    try {
      const subs = await getSubtaskTemplates(form.taskTypeId)
      setForm((f) => ({ ...f, subtasks: mapTemplateSubsToDraft(subs) }))
    } catch { toast('Không tải được việc con mẫu', 'error') }
  }

  // Kỳ SẮP TỚI (chưa đẩy CN/lễ) — mốc để xem trước ngày việc con, khớp cách generator tính.
  const subPreviewOcc = useMemo(() => {
    try {
      const [iso] = getNextOccurrences(form.recurrenceType, form.recurrenceConfig, new Date(), 1)
      return iso ? parseISO(iso) : null
    } catch { return null }
  }, [form.recurrenceType, JSON.stringify(form.recurrenceConfig)]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ngày việc con = ngày kỳ + offset, rồi ĐẨY khỏi CN/lễ (đúng như bộ sinh tự động).
  function previewSubDate(offset) {
    if (!subPreviewOcc) return '—'
    return format(rollForwardToWorkday(addDays(subPreviewOcc, Math.max(0, offset)), holidaySet), 'dd/MM/yyyy')
  }

  // Popup THÊM/SỬA 1 việc con — nháp riêng, chỉ ghi vào form.subtasks khi bấm Lưu ở popup con.
  const [subEdit, setSubEdit] = useState(null)   // null | { index: number | -1 (thêm mới), draft }
  const openAddSubtask  = () => setSubEdit({ index: -1, draft: newSubtaskDraft() })
  const openEditSubtask = (i) => setSubEdit({ index: i, draft: cloneSubtaskDraft(form.subtasks[i]) })
  const removeSubtask   = (i) => setForm((f) => ({ ...f, subtasks: f.subtasks.filter((_, k) => k !== i) }))
  const saveSubtask     = (draft) => {
    setForm((f) => {
      const list = f.subtasks.slice()
      if (subEdit.index === -1) list.push(draft)
      else list[subEdit.index] = draft
      return { ...f, subtasks: list }
    })
    setSubEdit(null)
  }

  // ── KPI v2: editor checklist nháp của lịch ──────────────────────────────────
  function setClField(idx, field, value) {
    setForm((f) => {
      const cl = f.checklist.slice()
      const it = { ...cl[idx], [field]: value }
      // Đổi độ khó → gợi ý điểm mặc định (vẫn cho sửa sau).
      if (field === 'difficulty') it.points = defaultPointsFor(value)
      cl[idx] = it
      return { ...f, checklist: cl }
    })
  }
  function addClRow() {
    setForm((f) => ({ ...f, checklist: [...f.checklist, {
      _key: clKey(), stepText: '', level: 0, difficulty: 'trung_binh', points: 4, isImportant: false, sourceTemplateStepId: null,
    }] }))
  }
  function removeClRow(idx) {
    setForm((f) => ({ ...f, checklist: f.checklist.filter((_, i) => i !== idx) }))
  }
  function moveClRow(idx, dir) {
    setForm((f) => {
      const cl = f.checklist.slice()
      const j = idx + dir
      if (j < 0 || j >= cl.length) return f
      ;[cl[idx], cl[j]] = [cl[j], cl[idx]]
      return { ...f, checklist: cl }
    })
  }
  async function resetClFromTemplate() {
    if (!form.taskTypeId) return
    try {
      const steps = await getChecklist(form.taskTypeId)
      setForm((f) => ({ ...f, checklist: mapTemplateToDraft(steps) }))
    } catch { toast('Không tải được checklist mẫu', 'error') }
  }

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting,     setDeleting]     = useState(false)

  // Toggle
  const [togglingId, setTogglingId] = useState(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Mở rộng dòng để xem việc con RIÊNG của lịch (nạp khi mở lần đầu)
  const [expandedId, setExpandedId] = useState(null)
  const [expandSubs, setExpandSubs] = useState({})   // { [scheduleId]: 'loading' | subs[] }
  async function toggleExpand(sc) {
    if (expandedId === sc.id) { setExpandedId(null); return }
    setExpandedId(sc.id)
    if (expandSubs[sc.id] === undefined) {
      setExpandSubs((m) => ({ ...m, [sc.id]: 'loading' }))
      try {
        const subs = await schedulesApi.getScheduleSubtasks(sc.id)
        setExpandSubs((m) => ({ ...m, [sc.id]: subs || [] }))
      } catch {
        setExpandSubs((m) => ({ ...m, [sc.id]: [] }))
      }
    }
  }

  // Phân trang client-side → footer trang
  const schTotal      = schedules.length
  const schTotalPages = Math.max(1, Math.ceil(schTotal / pageSize))
  const safePage      = Math.min(page, schTotalPages)
  const pageSchedules = schedules.slice((safePage - 1) * pageSize, safePage * pageSize)
  useEffect(() => { setPage(1) }, [pageSize])
  useCompanyFooter(loading ? null : {
    total: schTotal, from: (safePage - 1) * pageSize + 1, to: Math.min(safePage * pageSize, schTotal),
    page: safePage, pageSize, totalPages: schTotalPages, itemLabel: 'lịch',
    onPageChange: setPage, onPageSizeChange: setPageSize,
  })

  const selection = useRowSelection({ rows: schedules })
  const reorder = useRowReorder({
    rows: schedules, setRows: setSchedules, enabled: schTotalPages === 1,
    onError: () => toast('Không thể lưu thứ tự lịch định kỳ', 'error'),
    onPersist: (ordered, previous) => Promise.all(ordered
      .map((schedule, index) => ({ schedule, index }))
      .filter(({ schedule, index }) => previous[index]?.id !== schedule.id)
      .map(({ schedule, index }) => schedulesApi.updateSchedule(schedule.id, { sortOrder: index }))),
  })

  async function deleteSelected() {
    if (!selection.selectedCount || !(await confirmDelete({ title: 'Xóa lịch định kỳ', message: <>Bạn có chắc chắn muốn xóa <strong>{selection.selectedCount}</strong> lịch đã chọn?</>, confirmLabel: `Xóa ${selection.selectedCount} mục` }))) return
    const ids = [...selection.selectedIds]
    const results = await Promise.allSettled(ids.map((id) => schedulesApi.deleteSchedule(id)))
    const deleted = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'))
    setSchedules((current) => current.filter((schedule) => !deleted.has(schedule.id)))
    selection.remove(deleted)
    toast(deleted.size === ids.length ? `Đã xoá ${deleted.size} lịch` : `Đã xoá ${deleted.size}/${ids.length} lịch; lịch đã sinh công việc không thể xoá`, deleted.size ? 'success' : 'error')
  }

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
      mode:               sc.title ? 'manual' : 'template',
      title:              sc.title || '',
      taskTypeId:         sc.taskTypeId,
      assignedStaffId:    sc.assignedStaffId || '',
      recurrenceType:     sc.recurrenceType,
      recurrenceConfig:   { ...(sc.recurrenceConfig || {}) },
      deadlineOffsetDays: sc.deadlineOffsetDays ?? 0,
      overrideSlaDays:    sc.overrideSlaDays != null ? String(sc.overrideSlaDays) : '',
      checklist:          [],   // nạp async ngay dưới
      subtasks:           [],   // nạp async ngay dưới
      notes:              sc.notes || '',
    })
    setFormErrors({})
    setModal({ mode: 'edit', schedule: sc })
    // Nạp checklist + việc con RIÊNG của lịch (KPI v2)
    schedulesApi.getScheduleChecklist(sc.id)
      .then((cl) => setForm((f) => ({ ...f, checklist: mapScheduleToDraft(cl) })))
      .catch(() => { /* để trống nếu lỗi */ })
    schedulesApi.getScheduleSubtasks(sc.id)
      .then((subs) => setForm((f) => ({ ...f, subtasks: mapScheduleSubsToDraft(subs) })))
      .catch(() => { /* để trống nếu lỗi */ })
  }

  async function handleSave() {
    const errors = validateForm(form)
    if (Object.keys(errors).length) { setFormErrors(errors); return }

    // Chặn ngay khi nhập: hạn dự kiến không được vượt trần "ngày N" (nếu lịch có cap)
    if (modal?.schedule?.maxDueDay != null) {
      const v = capViolation(form.recurrenceType, form.recurrenceConfig, form.deadlineOffsetDays, modal.schedule.maxDueDay)
      if (v) {
        setFormErrors({ submit: `Hạn dự kiến ${v.dueDisp} vượt trần ngày ${v.maxDueDay} hàng tháng do Quản trị viên đặt. Giảm Deadline offset.` })
        return
      }
    }

    // Việc con: bỏ con không tên; ép số + đảm bảo hạn ≥ bắt đầu; kèm checklist riêng (bỏ bước trống).
    const subtasksPayload = []
    for (const sub of (form.subtasks || [])) {
      const title = (sub.title || '').trim()
      if (!title) continue
      const startOffset = Math.max(0, parseInt(sub.startOffset, 10) || 0)
      const deadlineOffset = parseInt(sub.deadlineOffset, 10) || 0
      if (deadlineOffset < startOffset) {
        setFormErrors({ submit: `Việc con "${title}": Hạn (+${deadlineOffset}) không được nhỏ hơn ngày bắt đầu (+${startOffset}).` })
        return
      }
      subtasksPayload.push({
        title, startOffset, deadlineOffset,
        sourceTemplateSubtaskId: sub.sourceTemplateSubtaskId ?? null,
        items: (sub.items || [])
          .filter((it) => it.stepText && it.stepText.trim())
          .map((it) => ({
            stepText: it.stepText.trim(), level: it.level === 1 ? 1 : 0,
            difficulty: it.difficulty || 'trung_binh',
            points: Math.max(0, Number(it.points) || 0),
            isImportant: !!it.isImportant,
            sourceTemplateStepId: it.sourceTemplateStepId ?? null,
          })),
      })
    }

    // Checklist: bỏ dòng trống, chuẩn hoá điểm; gửi cho backend ghi đè.
    const checklistPayload = (form.checklist || [])
      .filter((it) => it.stepText && it.stepText.trim())
      .map((it) => ({
        stepText: it.stepText.trim(), level: it.level === 1 ? 1 : 0,
        difficulty: it.difficulty || 'trung_binh',
        points: Math.max(0, Number(it.points) || 0),
        isImportant: !!it.isImportant,
        sourceTemplateStepId: it.sourceTemplateStepId ?? null,
      }))

    setSaving(true)
    try {
      const payload = {
        title:              form.mode === 'manual' ? (form.title.trim() || null) : null,
        assignedStaffId:    form.assignedStaffId || null,
        recurrenceType:     form.recurrenceType,
        recurrenceConfig:   form.recurrenceConfig,
        deadlineOffsetDays: Number(form.deadlineOffsetDays) || 0,
        overrideSlaDays:    form.overrideSlaDays !== '' ? parseInt(form.overrideSlaDays) : null,
        notes:              form.notes || null,
      }

      let scheduleId
      if (modal.mode === 'create') {
        const created = await schedulesApi.createCompanySchedule(company.id, {
          taskTypeId: form.taskTypeId,
          ...payload,
        })
        scheduleId = created.id
        // Ghi đè checklist + việc con theo bản đã sửa (backend đã seed mặc định từ mẫu khi tạo).
        await schedulesApi.replaceScheduleChecklist(scheduleId, checklistPayload)
        await schedulesApi.replaceScheduleSubtasks(scheduleId, subtasksPayload)
        const full = await schedulesApi.getSchedule(scheduleId)
        setSchedules(prev => [full, ...prev])
        toast('Tạo lịch định kỳ thành công', 'success')
      } else {
        scheduleId = modal.schedule.id
        const updated = await schedulesApi.updateSchedule(scheduleId, payload)
        await schedulesApi.replaceScheduleChecklist(scheduleId, checklistPayload)
        await schedulesApi.replaceScheduleSubtasks(scheduleId, subtasksPayload)
        const full = await schedulesApi.getSchedule(scheduleId)
        setSchedules(prev => prev.map(s => s.id === full.id ? full : s))
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
    <div className={s.scTab}>
      {/* Header */}
      <div className={s.scHeader}>
        <div className={s.scHeaderLeft}>
          <span className={s.scHeaderTitle}>Lịch định kỳ</span>
          {!loading && (
            <span className={s.scHeaderCount}>{schedules.length}</span>
          )}
        </div>
        <div className={s.scHeaderRight}>
          {selection.selectedCount > 0 && <button className={`${s.btnDanger} ${s.dataTableBulkDelete}`} onClick={deleteSelected}><Trash2 size={13} /> Xoá {selection.selectedCount} dòng</button>}
          <button className={s.btnGhost} onClick={load} title="Tải lại" disabled={loading}>
            <RefreshCw size={14} className={loading ? s.spin : ''} />
          </button>
          <button className={s.btnPrimary} onClick={openCreate}>
            <Plus size={14} />
            Thêm lịch
          </button>
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
          <p className={s.emptyDesc}>Nhấn &ldquo;Thêm lịch&rdquo; để cấu hình lịch tự động sinh công việc cho công ty này.</p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <div className={s.tableScroll}>
            <table className={`${s.table} ${s.scTable}`}>
              <colgroup><col className={s.dataTableColDrag} /><col className={s.dataTableColSelect} /><col className={s.dataTableColIndex} /></colgroup>
              <thead>
                <tr>
                  <DragHeaderCell />
                  <SelectionHeaderCell allSelected={selection.allSelected} someSelected={selection.someSelected} onToggle={selection.toggleAll} />
                  <IndexHeaderCell />
                  <th>Loại công việc</th>
                  <th>Lịch lặp</th>
                  <th>Nhân viên</th>
                  <th>Deadline / SLA</th>
                  <th>Trạng thái</th>
                  <th className={s.actionsHead}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageSchedules.map((sc, index) => (
                  <Fragment key={sc.id}>
                  <tr {...reorder.rowProps(sc.id)} className={reorder.dragOverId === sc.id ? s.dataTableRowDragOver : ''}>
                    <DragRowCell enabled={schTotalPages === 1} handleProps={reorder.handleProps(sc.id)} />
                    <SelectionRowCell checked={selection.selectedIds.has(sc.id)} onToggle={() => selection.toggle(sc.id)} />
                    <IndexRowCell index={(safePage - 1) * pageSize + index + 1} />
                    <td>
                      <div className={s.scTypeName}>{sc.title || sc.taskTypeName}</div>
                      {sc.title && <div className={s.scDeadlineTag} style={{ marginTop: 2, display: 'inline-block' }}>Tự tạo · {sc.taskTypeName}</div>}
                      {sc.subtaskCount > 0 && (
                        <button type="button"
                          className={s.scDeadlineTag}
                          style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', border: '1px solid var(--color-primary-ring)' }}
                          onClick={() => toggleExpand(sc)}
                          title="Xem/ẩn việc con & checklist của từng con">
                          {sc.subtaskCount} việc con
                          <ChevronDown size={11} style={{ transform: expandedId === sc.id ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                        </button>
                      )}
                    </td>
                    <td>
                      <div className={s.scRecurrenceLabel}>{RECURRENCE_LABELS[sc.recurrenceType]}</div>
                      <div className={s.scRecurrenceDesc}>
                        {describeRecurrence(sc.recurrenceType, sc.recurrenceConfig)}
                        {!!sc.recurrenceConfig?.period_offset && (
                          <span className={s.scDeadlineTag} style={{ marginLeft: 6 }}>
                            kỳ {sc.recurrenceConfig.period_offset < 0 ? 'lùi' : 'tiến'}{' '}
                            {Math.abs(sc.recurrenceConfig.period_offset)} {periodUnit(sc.recurrenceType)}
                          </span>
                        )}
                      </div>
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
                        {sc.maxDueDay != null && (
                          <span className={s.scCapTag} title="Trần ngày hoàn thành do Quản trị viên đặt — không được dời hạn vượt ngày này hàng tháng">
                            Trần: ngày {sc.maxDueDay}
                          </span>
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
                      </div>
                    </td>
                  </tr>

                  {expandedId === sc.id && (
                    <tr>
                      <td colSpan={9} style={{ background: 'var(--color-bg-soft, #f8fafc)', padding: '10px 16px' }}>
                        {expandSubs[sc.id] === 'loading' ? (
                          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}><Loader2 size={12} className={s.spin} /> Đang tải việc con…</span>
                        ) : !Array.isArray(expandSubs[sc.id]) || expandSubs[sc.id].length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>Không có việc con.</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                              Việc con — mỗi con là 1 công việc độc lập; offset tính từ ngày kỳ
                            </div>
                            {expandSubs[sc.id].map((sub) => {
                              const start = Number.isInteger(sub.startOffset) ? sub.startOffset : 0
                              const deadline = Number.isInteger(sub.deadlineOffset) ? sub.deadlineOffset : start
                              const pts = (sub.items || []).reduce((a, it) => a + (Number(it.points) || 0), 0)
                              return (
                                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
                                  <GitBranch size={12} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
                                  <span style={{ flex: '1 1 200px' }}>{sub.title}</span>
                                  {(sub.items?.length > 0) && <span className={s.scDeadlineTag}>{sub.items.length} bước · {pts}đ</span>}
                                  <span className={s.scDeadlineTag}>Bắt đầu kỳ +{start}d</span>
                                  <span className={s.scDeadlineTag}>Hạn kỳ +{deadline}d</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      {modal && (
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
              <span style={{ whiteSpace: 'nowrap' }}>{modal.mode === 'create' ? 'Tạo lịch định kỳ' : 'Chỉnh sửa lịch định kỳ'}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['template', 'Từ mẫu'], ['manual', 'Tự tạo (thủ công)']].map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setForm(f => ({
                    ...f, mode: m,
                    ...(m === 'template' ? { title: '' } : {}),
                    // Chỉ xoá checklist + việc con khi TẠO MỚI + chuyển sang thủ công. Khi SỬA giữ nguyên bản của lịch.
                    ...(modal.mode === 'create' && m === 'manual' ? { checklist: [], subtasks: [] } : {}),
                  }))}
                    style={{ height: 30, padding: '0 16px', borderRadius: 8, cursor: 'pointer', fontSize: 'var(--fs-2xs)', fontWeight: 600,
                      border: form.mode === m ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: form.mode === m ? 'var(--color-primary-bg)' : 'var(--color-white)',
                      color: form.mode === m ? 'var(--color-primary)' : 'var(--color-text-soft)' }}>{lbl}</button>
                ))}
              </div>
            </div>
          }
          onClose={() => { if (!subEdit) setModal(null) }}
          width="min(1180px, calc(100vw - 40px))"
          maxWidth="1180px"
        >
          <div className={s.scModalGrid}>

            {/* Left: form */}
            <div className={s.scModalLeft}>
              {formErrors.submit && (
                <div className={s.errorBox}>{formErrors.submit}</div>
              )}

              {/* Tên lịch — chế độ tự tạo */}
              {form.mode === 'manual' && (
                <div className={s.formField}>
                  <label className={`${s.formLabel} ${s.formLabelReq}`}>Tên lịch</label>
                  <input className={`${s.formInput} ${formErrors.title ? s.formInputError : ''}`}
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="VD: Đối chiếu kho định kỳ" />
                  {formErrors.title && <div className={s.formError}>{formErrors.title}</div>}
                </div>
              )}

              {/* Task type — only on create */}
              {modal.mode === 'create' ? (
                <div className={s.formField}>
                  <label className={`${s.formLabel} ${s.formLabelReq}`}>{form.mode === 'manual' ? 'Loại công việc (nhóm báo cáo)' : 'Loại công việc'}</label>
                  <select
                    className={`${s.formSelect} ${formErrors.taskTypeId ? s.formInputError : ''}`}
                    value={form.taskTypeId}
                    onChange={e => setForm(f => ({ ...f, taskTypeId: e.target.value, checklist: f.mode === 'manual' ? f.checklist : [], subtasks: f.mode === 'manual' ? f.subtasks : [] }))}
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

              {/* KPI v2 — Checklist RIÊNG của lịch (sửa được, có độ khó + điểm + ★ quan trọng) */}
              {form.taskTypeId && (
                <div className={s.formField}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label className={s.formLabel} style={{ margin: 0 }}>
                      Checklist của lịch{' '}
                      <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}>
                        · Tổng điểm {form.checklist.reduce((a, it) => a + (Number(it.points) || 0), 0)}
                      </span>
                    </label>
                    <button type="button" className={s.scClResetBtn} onClick={resetClFromTemplate} title="Nạp checklist từ mẫu của loại CV (ghi đè checklist hiện tại)">
                      <RefreshCw size={12} /> {form.mode === 'manual' ? 'Lấy từ mẫu' : 'Khôi phục về mẫu'}
                    </button>
                  </div>
                  <div className={s.scStepPickHint}>
                    Sửa checklist riêng cho công ty này — thêm/bớt bước, đổi độ khó (tự gợi ý điểm) hoặc nhập điểm tay. <b>★</b> = bước quan trọng (hiện mặc định ở báo cáo).
                  </div>
                  <div className={s.scClList}>
                    {form.checklist.length === 0 && <div className={s.scClEmpty}>Chưa có bước nào. Bấm “+ Thêm bước”.</div>}
                    {form.checklist.map((it, idx) => (
                      <div key={it._key} className={`${s.scClRow} ${it.level === 1 ? s.scClRowChild : ''}`}>
                        <div className={s.scClMove}>
                          <button type="button" onClick={() => moveClRow(idx, -1)} disabled={idx === 0} title="Lên"><ChevronUp size={12} /></button>
                          <button type="button" onClick={() => moveClRow(idx, 1)} disabled={idx === form.checklist.length - 1} title="Xuống"><ChevronDown size={12} /></button>
                        </div>
                        <button type="button" className={s.scClIndent} onClick={() => setClField(idx, 'level', it.level === 1 ? 0 : 1)} title={it.level === 1 ? 'Đưa lên mục chính' : 'Thụt thành mục phụ'}>
                          {it.level === 1 ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
                        </button>
                        <input
                          className={s.scClText}
                          value={it.stepText}
                          onChange={(e) => setClField(idx, 'stepText', e.target.value)}
                          placeholder="Nội dung bước..."
                        />
                        <button type="button" className={`${s.scClStar} ${it.isImportant ? s.scClStarOn : ''}`} onClick={() => setClField(idx, 'isImportant', !it.isImportant)} title={it.isImportant ? 'Bỏ quan trọng' : 'Đánh dấu quan trọng'}>
                          <Star size={13} fill={it.isImportant ? 'currentColor' : 'none'} />
                        </button>
                        <select className={s.scClDiff} value={it.difficulty} onChange={(e) => setClField(idx, 'difficulty', e.target.value)} title="Độ khó">
                          {diffOptionsOr(diffOptions).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                        </select>
                        <input type="number" min={0} max={100} className={s.scClPoints} value={it.points} onChange={(e) => setClField(idx, 'points', e.target.value)} title="Điểm" />
                        <span className={s.scClUnit}>đ</span>
                        <button type="button" className={s.scClDel} onClick={() => removeClRow(idx)} title="Xoá bước"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className={s.scClAddBtn} onClick={addClRow}><Plus size={13} /> Thêm bước</button>
                </div>
              )}

              {/* Việc con của lịch — danh sách gọn; thêm/sửa qua popup riêng (cả mẫu lẫn tự tạo) */}
              {form.taskTypeId && (
                <SubtaskList
                  subtasks={form.subtasks}
                  onAdd={openAddSubtask}
                  onEdit={openEditSubtask}
                  onRemove={removeSubtask}
                  onResetFromTemplate={loadSubtasksFromTemplate}
                  subPreviewOcc={subPreviewOcc}
                  previewSubDate={previewSubDate}
                />
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
                    // Giữ lại độ lệch kỳ khi đổi loại lịch — nó độc lập với
                    // cấu hình riêng của từng loại (ngày/thứ/tháng…)
                    setForm(f => ({
                      ...f,
                      recurrenceType: t,
                      recurrenceConfig: {
                        ...defaultConfig(t),
                        ...(f.recurrenceConfig?.period_offset
                          ? { period_offset: f.recurrenceConfig.period_offset }
                          : {}),
                      },
                    }))
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

              {/* Kỳ nghiệp vụ — lệch bao nhiêu so với ngày làm việc */}
              <div className={s.formField}>
                <label className={s.formLabel}>Kỳ nghiệp vụ của công việc</label>
                <select
                  className={s.formInput}
                  value={form.recurrenceConfig?.period_offset ?? 0}
                  onChange={e => setField('recurrenceConfig', {
                    ...(form.recurrenceConfig || {}),
                    period_offset: parseInt(e.target.value, 10) || 0,
                  })}
                >
                  {periodOffsetOptions(form.recurrenceType).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className={s.formHint}>
                  Tên công việc sinh hôm nay sẽ là{' '}
                  <b>[{previewPeriodLabel(form.recurrenceType, form.recurrenceConfig?.period_offset)}]</b>
                  {' '}— dùng khi kỳ nghiệp vụ khác tháng làm việc (vd bảng lương tháng 6 làm trong tháng 7).
                  Ngày bắt đầu và hạn chót KHÔNG đổi.
                </div>
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
                  {modal?.schedule?.maxDueDay != null && (() => {
                    const v = capViolation(form.recurrenceType, form.recurrenceConfig, form.deadlineOffsetDays, modal.schedule.maxDueDay)
                    return v
                      ? <div className={s.formError}>⚠ Hạn dự kiến {v.dueDisp} vượt trần ngày {v.maxDueDay} hàng tháng (Admin đặt). Giảm offset.</div>
                      : <div className={s.formHint} style={{ color: '#b45309' }}>Trần: ngày {modal.schedule.maxDueDay} hàng tháng (Admin đặt) — hạn không được vượt.</div>
                  })()}
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
              <PreviewPanel type={form.recurrenceType} config={form.recurrenceConfig} holidaySet={holidaySet} />
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

      {/* ── Popup THÊM/SỬA việc con (lồng trên popup lịch) ── */}
      {subEdit && (
        <SubtaskFormModal
          initial={subEdit.draft}
          isNew={subEdit.index === -1}
          diffOptions={diffOptions}
          subPreviewOcc={subPreviewOcc}
          previewSubDate={previewSubDate}
          onCancel={() => setSubEdit(null)}
          onSave={saveSubtask}
        />
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
              {previewModal.schedule.maxDueDay != null && (
                <div className={s.scCapNotice}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  <span>Trần ngày hoàn thành: <strong>ngày {previewModal.schedule.maxDueDay} hàng tháng</strong> (Quản trị viên đặt — không được dời hạn vượt ngày này).</span>
                </div>
              )}
              <div className={s.scPreviewTitle}>
                <CalendarDays size={14} />
                10 lần kích hoạt tiếp theo
              </div>
              {previewModal.dates.length === 0 ? (
                <div className={s.scPreviewEmpty}>Không có ngày nào sắp tới.</div>
              ) : (
                <ol className={s.scPreviewList}>
                  {previewModal.dates.map((d, i) => (
                    <li key={i} className={s.scPreviewItem}>
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
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa lịch định kỳ"
        message={deleteTarget ? <>Bạn có chắc chắn muốn xóa lịch <strong>“{deleteTarget.taskTypeName}”</strong>?</> : null}
        warning="Chỉ có thể xóa nếu lịch chưa sinh công việc nào."
        confirmLabel="Xóa lịch"
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  )
}
