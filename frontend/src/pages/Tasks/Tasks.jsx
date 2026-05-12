import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import {
  Plus, Search, RotateCcw, List, Columns, Calendar,
  ChevronLeft, ChevronRight, ChevronDown, Filter, ClipboardList, Check,
  Trash2, Loader2, X, Eye, ArrowUpRight,
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, format, addMonths, subMonths, isToday, differenceInDays, parseISO,
  addDays, isAfter,
} from 'date-fns'
import { vi } from 'date-fns/locale'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as tasksApi from '../../api/tasks'
import { listCompanies } from '../../api/companies'
import { listUsers } from '../../api/users'
import TaskFormModal from './TaskFormModal'
import TaskQuickView from './TaskQuickView'
import {
  TASK_STATUSES, STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS,
  isTaskOverdue, fmtDate, progressPct,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import s from './tasks.module.css'

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'due_date:asc',    label: 'Hết hạn sớm nhất' },
  { value: 'due_date:desc',   label: 'Hết hạn muộn nhất' },
  { value: 'created_at:desc', label: 'Mới nhất' },
  { value: 'created_at:asc',  label: 'Cũ nhất' },
  { value: 'priority:desc',   label: 'Ưu tiên cao nhất' },
  { value: 'updated_at:desc', label: 'Cập nhật gần nhất' },
]

// ── Date helpers ──────────────────────────────────────────────────────────────

function yearMonthToDates(year, month) {
  if (!year) return { from: '', to: '' }
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` }
  const m = parseInt(month, 10)
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

function calcDays(task) {
  const base = task.startDate || task.createdAt
  if (!base) return null
  const start = parseISO(base)
  const end   = task.completedAt ? parseISO(task.completedAt) : new Date()
  return Math.max(0, differenceInDays(end, start))
}

// Status color map for quick-edit select in list view
const STATUS_SELECT_STYLE = {
  pending:        { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' },
  in_progress:    { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  on_hold:        { background: '#fff7ed', color: '#c2410c', borderColor: '#fed7aa' },
  pending_review: { background: '#faf5ff', color: '#7e22ce', borderColor: '#d8b4fe' },
  needs_revision: { background: '#fff1f2', color: '#be123c', borderColor: '#fda4af' },
  completed:      { background: '#f0fdf4', color: '#15803d', borderColor: '#86efac' },
}

// Priority color map for quick-edit select in list view
const PRIORITY_SELECT_STYLE = {
  urgent: { background: '#fef2f2', color: '#b91c1c', borderColor: '#fca5a5' },
  high:   { background: '#fff7ed', color: '#c2410c', borderColor: '#fdba74' },
  medium: { background: '#eff6ff', color: '#1d4ed8', borderColor: '#93c5fd' },
  low:    { background: '#f8fafc', color: '#64748b', borderColor: '#cbd5e1' },
}

// ── Column dot class map ──────────────────────────────────────────────────────

const COL_DOT = {
  pending:        s.dotPending,
  in_progress:    s.dotInProgress,
  on_hold:        s.dotOnHold,
  pending_review: s.dotPendingReview,
  needs_revision: s.dotNeedsRevision,
  completed:      s.dotCompleted,
}

// ── List due-date field: shows dd/MM/yyyy text, hidden native picker on click ──

function ListDateField({ value, onChange, isOverdue }) {
  const ref = useRef(null)
  const dateStr = value ? value.slice(0, 10) : ''
  return (
    <div
      className={`${s.qeDate} ${isOverdue ? s.qeDateOverdue : ''}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {dateStr ? fmtDate(dateStr) : '—'}
      </span>
      <input
        ref={ref}
        type="date"
        value={dateStr}
        onChange={onChange}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: 1 }}
        tabIndex={-1}
      />
    </div>
  )
}

// ── Shared badges ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  return (
    <span className={`${s.statusBadge} ${s[STATUS_CSS[status]]}`}>
      {getLabel('task_status', status, STATUS_LABELS[status])}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const getLabel = useEnumsStore((st) => st.getLabel)
  return (
    <span className={`${s.priorityBadge} ${s[PRIORITY_CSS[priority]]}`}>
      {getLabel('task_priority', priority, PRIORITY_LABELS[priority])}
    </span>
  )
}

// ── DeleteTaskModal ───────────────────────────────────────────────────────────

function DeleteTaskModal({ task, deleting, onClose, onConfirm }) {
  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Xóa công việc</h4>
        <p className={s.miniBody}>
          Bạn có chắc chắn muốn xóa công việc{' '}
          <strong>&ldquo;{task.title}&rdquo;</strong>?{' '}
          Hành động này không thể hoàn tác.
        </p>
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={deleting}>
            Hủy bỏ
          </button>
          <button onClick={onConfirm} disabled={deleting} className={s.btnDangerSolid}>
            {deleting
              ? <><Loader2 size={13} className={s.spinIcon} /> Đang xóa...</>
              : <><Trash2 size={13} /> Xóa</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── OnHoldModal ───────────────────────────────────────────────────────────────

function OnHoldModal({ task, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(task, 'on_hold', { reason: reason.trim() || null })
    } finally { setSaving(false) }
  }

  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Tạm hoãn công việc</h4>
        <p className={s.miniBody}>
          Nhập lý do tạm hoãn <strong>&ldquo;{task.title}&rdquo;</strong> (không bắt buộc):
        </p>
        <textarea
          className={s.miniTextarea}
          placeholder="Lý do tạm hoãn..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          autoFocus
        />
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button onClick={handleConfirm} disabled={saving} className={s.btnDanger}>
            {saving ? 'Đang cập nhật...' : 'Tạm hoãn'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ForceConfirmModal ─────────────────────────────────────────────────────────

function ForceConfirmModal({ task, newStatus, onConfirm, onClose }) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try { await onConfirm() } finally { setSaving(false) }
  }

  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Checklist chưa hoàn thành</h4>
        <p className={s.miniBody}>
          Công việc <strong>&ldquo;{task.title}&rdquo;</strong> còn các bước chưa hoàn thành.
          Bạn vẫn muốn chuyển sang <strong>&ldquo;{STATUS_LABELS[newStatus]}&rdquo;</strong>?
        </p>
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={saving}>Huỷ</button>
          <button onClick={handleConfirm} disabled={saving} className={s.btnPrimary}>
            {saving ? 'Đang cập nhật...' : 'Vẫn chuyển'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Board card inner ──────────────────────────────────────────────────────────

function BoardCardInner({ task, isAdmin, onDelete, onQuickView }) {
  const pct     = progressPct(task)
  const overdue = isTaskOverdue(task)
  const startShort = task.startDate ? fmtDate(task.startDate).slice(0, 5) : null
  const endShort   = task.dueDate   ? fmtDate(task.dueDate).slice(0, 5)   : null
  return (
    <>
      <div className={s.boardCardTitle}>{task.title}</div>
      {task.companyName && <div className={s.boardCardCompany}>{task.companyName}</div>}
      <div className={s.boardCardMeta}>
        <PriorityBadge priority={task.priority} />
        {(startShort || endShort) && (
          <span className={`${s.boardCardDates} ${overdue ? s.boardCardDateOver : ''}`}>
            {startShort ?? '—'} → {endShort ?? '—'}
          </span>
        )}
      </div>
      {task.status === 'on_hold' && task.onHoldReason && (
        <div className={s.boardCardOnHold}>{task.onHoldReason}</div>
      )}
      {pct !== null && (
        <div className={s.boardCardProgress}>
          <div className={s.progressBar}>
            <div
              className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={s.boardCardProgressText}>{pct}%</span>
        </div>
      )}
      {(onQuickView || (isAdmin && onDelete)) && (
        <div className={s.boardCardActions}>
          {onQuickView && (
            <button
              className={s.boardCardViewBtn}
              onClick={(e) => { e.stopPropagation(); onQuickView(task.id) }}
              title="Xem nhanh"
            >
              <Eye size={11} />
            </button>
          )}
          {isAdmin && onDelete && (
            <button
              className={s.boardCardDeleteBtn}
              onClick={(e) => { e.stopPropagation(); onDelete(task) }}
              title="Xóa công việc"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

function DraggableCard({ task, onOpen, isAdmin, onDelete, onQuickView }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${s.boardCard} ${isDragging ? s.boardCardDragging : ''}`}
      style={transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` } : undefined}
      onClick={() => !isDragging && onOpen(task.id)}
    >
      <BoardCardInner task={task} isAdmin={isAdmin} onDelete={onDelete} onQuickView={onQuickView} />
    </div>
  )
}

// ── DroppableColumn ───────────────────────────────────────────────────────────

function DroppableColumn({ status, tasks, onOpen, isAdmin, onDelete, onQuickView }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const getLabel = useEnumsStore((st) => st.getLabel)

  return (
    <div className={s.boardCol}>
      <div className={s.boardColHead}>
        <span className={`${s.boardColDot} ${COL_DOT[status]}`} />
        <span className={s.boardColTitle}>{getLabel('task_status', status, STATUS_LABELS[status])}</span>
        <span className={s.boardColCount}>{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`${s.boardCards} ${isOver ? s.boardCardsOver : ''}`}>
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} isAdmin={isAdmin} onDelete={onDelete} onQuickView={onQuickView} />
        ))}
        {tasks.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 11, padding: '16px 0' }}>
            Không có
          </p>
        )}
      </div>
    </div>
  )
}

// ── BoardView ─────────────────────────────────────────────────────────────────

function BoardView({ tasks, onStatusChange, onOpen, isAdmin, onDelete, onQuickView }) {
  const [activeTask, setActiveTask] = useState(null)
  const addToast = useToastStore((state) => state.toast)
  const getLabel = useEnumsStore((st) => st.getLabel)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const byStatus = useMemo(() => {
    const map = {}
    for (const st of TASK_STATUSES) map[st] = []
    for (const t of tasks) { if (map[t.status]) map[t.status].push(t) }
    return map
  }, [tasks])

  function handleDragStart({ active }) {
    setActiveTask(tasks.find((t) => t.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return
    const src = active.data.current?.status
    const dst = over.id
    if (src === dst) return
    const validTargets = STATUS_TRANSITIONS[src] ?? []
    if (!validTargets.includes(dst)) {
      addToast(
        `Không thể chuyển từ "${getLabel('task_status', src, STATUS_LABELS[src])}" sang "${getLabel('task_status', dst, STATUS_LABELS[dst])}"`,
        'error'
      )
      return
    }
    const task = tasks.find((t) => t.id === active.id)
    if (task) onStatusChange(task, dst)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={s.boardWrap}>
        {TASK_STATUSES.map((status) => (
          <DroppableColumn
            key={status}
            status={status}
            tasks={byStatus[status] ?? []}
            onOpen={onOpen}
            isAdmin={isAdmin}
            onDelete={onDelete}
            onQuickView={onQuickView}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className={`${s.boardCard} ${s.boardCardOverlay}`}>
            <BoardCardInner task={activeTask} isAdmin={false} onDelete={null} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── CalendarView ──────────────────────────────────────────────────────────────

const WEEK_DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const CAL_PRIORITY_CLASS = {
  urgent: s.calTaskUrgent,
  high:   s.calTaskHigh,
  medium: s.calTaskMedium,
  low:    s.calTaskLow,
}

// Pixels: day-number area at top of each week row
const CAL_DAY_H   = 36
// Pixels: height per task bar slot
const CAL_SLOT_H  = 26
// Maximum visible task bar rows before showing "+N more"
const CAL_MAX_SL  = 3

function CalendarView({ tasks, onOpen }) {
  const [calMonth, setCalMonth]     = useState(new Date())
  const [dayPopover, setDayPopover] = useState(null)

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(calMonth),     { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])

  const weeks = useMemo(() => {
    const result = []
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7))
    return result
  }, [days])

  // For each week compute continuous bar positions + overflow counts
  const weekBars = useMemo(() => {
    return weeks.map((week) => {
      const wStart = format(week[0], 'yyyy-MM-dd')
      const wEnd   = format(week[6], 'yyyy-MM-dd')

      // Tasks that overlap this week
      const wTasks = tasks.filter((t) => {
        const ts = t.startDate || t.dueDate
        const te = t.dueDate   || t.startDate
        if (!ts && !te) return false
        return te >= wStart && ts <= wEnd
      })

      // Sort: earlier start first; longer span first on tie
      wTasks.sort((a, b) => {
        const as = a.startDate || a.dueDate || ''
        const bs = b.startDate || b.dueDate || ''
        if (as !== bs) return as.localeCompare(bs)
        const ad = a.dueDate && a.startDate ? new Date(a.dueDate) - new Date(a.startDate) : 0
        const bd = b.dueDate && b.startDate ? new Date(b.dueDate) - new Date(b.startDate) : 0
        return bd - ad
      })

      const dayIdxMap = {}
      week.forEach((d, i) => { dayIdxMap[format(d, 'yyyy-MM-dd')] = i })

      // slots[i] = last endIdx used in slot i (for greedy slot assignment)
      const slots         = []
      const bars          = []
      const overflowByDay = Array(7).fill(0)

      for (const t of wTasks) {
        const ts = t.startDate || t.dueDate
        const te = t.dueDate   || t.startDate
        const cs = ts < wStart ? wStart : ts          // clamped start
        const ce = te > wEnd   ? wEnd   : te          // clamped end
        const si = dayIdxMap[cs] ?? 0
        const ei = dayIdxMap[ce] ?? 6

        let slot = slots.findIndex((end) => end < si)
        if (slot === -1) slot = slots.length

        if (slot < CAL_MAX_SL) {
          slots[slot] = ei
          bars.push({
            task: t, si, ei, slot,
            continuesLeft:  !!t.startDate && t.startDate < wStart,
            continuesRight: !!t.dueDate   && t.dueDate   > wEnd,
          })
        } else {
          for (let d = si; d <= ei; d++) overflowByDay[d]++
        }
      }

      return { week, bars, overflowByDay }
    })
  }, [tasks, weeks])

  // All tasks per calendar day (for the popover — shows everything)
  const tasksByDay = useMemo(() => {
    const map      = {}
    const calStart = days[0]
    const calEnd   = days[days.length - 1]
    for (const t of tasks) {
      const ts = t.startDate || t.dueDate
      const te = t.dueDate   || t.startDate
      if (!ts && !te) continue
      let cur      = isAfter(parseISO(ts), calStart) ? parseISO(ts) : calStart
      const stopAt = isAfter(parseISO(te), calEnd)   ? calEnd       : parseISO(te)
      while (!isAfter(cur, stopAt)) {
        const key = format(cur, 'yyyy-MM-dd')
        if (!map[key]) map[key] = []
        if (!map[key].find((x) => x.id === t.id)) map[key].push(t)
        cur = addDays(cur, 1)
      }
    }
    return map
  }, [tasks, days])

  function taskBarClass(t) {
    if (t.status === 'completed') return s.calTaskDone
    if (isTaskOverdue(t))        return s.calTaskOverdue
    return CAL_PRIORITY_CLASS[t.priority] ?? s.calTaskLow
  }

  return (
    <div className={s.calWrap} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

      {/* Month navigation */}
      <div className={s.calNav}>
        <button className={s.calNavBtn} onClick={() => setCalMonth((m) => subMonths(m, 1))}>
          <ChevronLeft size={16} />
        </button>
        <button className={s.calTodayBtn} onClick={() => setCalMonth(new Date())}>Hôm nay</button>
        <span className={s.calNavTitle}>{format(calMonth, 'MMMM yyyy', { locale: vi })}</span>
        <button className={s.calNavBtn} onClick={() => setCalMonth((m) => addMonths(m, 1))}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header row */}
      <div className={s.calDayHeaders}>
        {WEEK_DAYS.map((d) => <div key={d} className={s.calDayHead}>{d}</div>)}
      </div>

      {/* Week rows — each row flex-fills the container height equally */}
      <div className={s.calWeeksContainer}>
        {weekBars.map(({ week, bars, overflowByDay }, wIdx) => {
          const isLast = wIdx === weekBars.length - 1
          return (
            <div
              key={format(week[0], 'yyyy-MM-dd')}
              className={`${s.calWeekRow} ${isLast ? s.calWeekRowLast : ''}`}
            >
              {/* Absolutely-positioned day column backgrounds */}
              {week.map((day, dIdx) => {
                const key      = format(day, 'yyyy-MM-dd')
                const isOther  = !isSameMonth(day, calMonth)
                const isTod    = isToday(day)
                const overflow = overflowByDay[dIdx]
                const dayTasks = tasksByDay[key] ?? []
                return (
                  <div
                    key={key}
                    className={`${s.calDayCol}
                      ${isOther  ? s.calColOther  : ''}
                      ${isTod    ? s.calColToday  : ''}
                      ${dIdx === 6 ? s.calColLast : ''}`}
                    style={{ left: `${(dIdx / 7) * 100}%`, width: `${100 / 7}%` }}
                  >
                    <div className={s.calDayNum}>
                      <span className={isTod ? s.calDayNumToday : ''}>{format(day, 'd')}</span>
                    </div>
                    {overflow > 0 && (
                      <button
                        className={s.calMoreBtn}
                        onClick={(e) => { e.stopPropagation(); setDayPopover({ date: key, tasks: dayTasks }) }}
                      >
                        +{overflow} thêm
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Continuous task bars */}
              {bars.map(({ task, si, ei, slot, continuesLeft, continuesRight }) => {
                const lm = continuesLeft  ? 0 : 3
                const rm = continuesRight ? 0 : 3
                return (
                  <div
                    key={task.id}
                    className={`${s.calTaskBar} ${taskBarClass(task)}
                      ${continuesLeft  ? s.calBarLeft  : ''}
                      ${continuesRight ? s.calBarRight : ''}`}
                    style={{
                      left:   `calc(${(si / 7) * 100}% + ${lm}px)`,
                      width:  `calc(${((ei - si + 1) / 7) * 100}% - ${lm + rm}px)`,
                      top:    `${CAL_DAY_H + slot * CAL_SLOT_H + 3}px`,
                      height: `${CAL_SLOT_H - 5}px`,
                    }}
                    onClick={() => onOpen(task.id)}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Day detail popover */}
      {dayPopover && (
        <div className={s.miniOverlay} onClick={() => setDayPopover(null)}>
          <div className={s.calDayPopover} onClick={(e) => e.stopPropagation()}>
            <div className={s.calDayPopoverHead}>
              <span className={s.calPopoverDate}>
                {dayPopover.date.split('-').reverse().join('/')}
              </span>
              <span className={s.calPopoverCount}>
                {dayPopover.tasks.length} công việc
              </span>
              <button className={s.btnIcon} style={{ marginLeft: 'auto' }} onClick={() => setDayPopover(null)}>
                <X size={14} />
              </button>
            </div>
            <div className={s.calDayPopoverList}>
              {dayPopover.tasks.map((t) => {
                const overdue = isTaskOverdue(t)
                return (
                  <div
                    key={t.id}
                    className={s.calDayPopoverItem}
                    onClick={() => { onOpen(t.id); setDayPopover(null) }}
                  >
                    <span className={`${s.statusBadge} ${s[STATUS_CSS[t.status]]}`} style={{ flexShrink: 0, minWidth: 100 }}>
                      {STATUS_LABELS[t.status]}
                    </span>
                    <div className={s.calPopoverMain}>
                      <div className={`${s.calPopoverTitle} ${overdue ? s.calPopoverOverdue : ''}`}>
                        {t.title}
                      </div>
                      {t.companyName && (
                        <div className={s.calPopoverMeta}>{t.companyName}</div>
                      )}
                    </div>
                    <div className={s.calPopoverRight}>
                      {(t.startDate || t.dueDate) && (
                        <span className={`${s.calPopoverDates} ${overdue ? s.calPopoverDatesOver : ''}`}>
                          {t.startDate ? fmtDate(t.startDate).slice(0, 5) : '—'}
                          {' → '}
                          {t.dueDate ? fmtDate(t.dueDate).slice(0, 5) : '—'}
                        </span>
                      )}
                      <PriorityBadge priority={t.priority} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MultiSelect ───────────────────────────────────────────────────────────────

function MultiSelect({ placeholder, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  function toggle(key) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  const count = selected.length
  const allChecked = options.length > 0 && count === options.length

  return (
    <div className={s.multiSelect} ref={ref}>
      <button
        type="button"
        className={`${s.multiSelectTrigger} ${count > 0 ? s.multiSelectActive : ''}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span className={s.multiSelectLabel}>
          {count === 0 ? placeholder : `${count} đã chọn`}
        </span>
        {count > 0 && <span className={s.multiSelectBadge}>{count}</span>}
        <ChevronDown
          size={11}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.13s' }}
        />
      </button>
      {open && (
        <div className={s.multiSelectDropdown}>
          <label className={s.multiSelectItem}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onChange(allChecked ? [] : options.map((o) => o.key))}
            />
            <span>Tất cả</span>
          </label>
          <div className={s.multiSelectDivider} />
          {options.map((o) => (
            <label
              key={o.key}
              className={`${s.multiSelectItem} ${selected.includes(o.key) ? s.multiSelectItemChecked : ''}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(o.key)}
                onChange={() => toggle(o.key)}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({
  tasks, loading, pagination, page, pageSize,
  onPageChange, onPageSizeChange, onOpen, onQuickView,
  selectedIds, onToggleSelect, onSelectAll,
  onStatusChange, onPriorityChange, onDueDateChange, onDelete,
  isAdmin,
}) {
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id))
  const from = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, pagination.total)

  function pageWindow() {
    const total = pagination.totalPages ?? 1
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', page - 1, page, page + 1, '…', total]
  }

  return (
    <div className={s.tableWrap}>
      <div style={{ overflowX: 'auto' }}>
        <table className={s.table}>
          <thead className={s.thead}>
            <tr>
              <th className={s.thCheck}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                />
              </th>
              <th className={s.th}>Tiêu đề / Khách hàng</th>
              <th className={s.th}>Ngày bắt đầu</th>
              <th className={s.th}>Số ngày</th>
              <th className={s.th}>Trạng thái</th>
              <th className={s.th}>Ưu tiên</th>
              <th className={s.th}>Hết hạn</th>
              <th className={s.th}>Tiến độ</th>
              <th className={s.th}>Giao cho</th>
              <th className={s.th} style={{ width: 100 }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  {[240, 80, 55, 110, 80, 80, 90, 110, 70].map((w, j) => (
                    <td key={j} className={s.td}>
                      <div style={{ width: w, height: 11, background: '#f1f5f9', borderRadius: 4, animation: 'app-pulse 1.5s ease-in-out infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <div className={s.emptyBox}>
                    <div className={s.emptyIcon}><ClipboardList size={32} /></div>
                    <p className={s.emptyTitle}>Không có công việc</p>
                    <p className={s.emptyText}>Thử thay đổi bộ lọc hoặc tạo công việc mới</p>
                  </div>
                </td>
              </tr>
            ) : tasks.map((t) => {
              const overdue = isTaskOverdue(t)
              const pct     = progressPct(t)
              const days    = calcDays(t)
              return (
                <tr
                  key={t.id}
                  className={`${s.tr} ${selectedIds.has(t.id) ? s.trSelected : ''} ${overdue ? s.trOverdue : ''}`}
                  onClick={() => onOpen(t.id)}
                >
                  <td className={s.tdCheck} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => onToggleSelect(t.id)}
                    />
                  </td>
                  <td className={s.td}>
                    <div className={`${s.taskTitle} ${overdue ? s.taskTitleOverdue : ''}`}>{t.title}</div>
                    {t.companyName && <div className={s.taskMeta}>{t.companyName}</div>}
                  </td>

                  {/* Ngày bắt đầu */}
                  <td className={s.td}>
                    <span className={s.dueDateNormal}>{fmtDate(t.startDate || t.createdAt)}</span>
                  </td>

                  {/* Số ngày thực hiện */}
                  <td className={s.td}>
                    {days !== null ? (
                      <span className={`${s.daysBadge} ${t.status === 'completed' ? s.daysBadgeDone : ''}`}>
                        {days}d
                      </span>
                    ) : <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>—</span>}
                  </td>

                  {/* Quick edit: status */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.status}
                      onChange={(e) => { if (e.target.value !== t.status) onStatusChange(t, e.target.value) }}
                      className={s.qeSelect}
                      title="Đổi trạng thái"
                      style={{ ...(STATUS_SELECT_STYLE[t.status] ?? {}), fontWeight: 600 }}
                    >
                      <option value={t.status}>
                        {getLabel('task_status', t.status, STATUS_LABELS[t.status])}
                      </option>
                      {(STATUS_TRANSITIONS[t.status] ?? []).map((st) => (
                        <option key={st} value={st}>
                          {getLabel('task_status', st, STATUS_LABELS[st])}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Quick edit: priority */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.priority}
                      onChange={(e) => onPriorityChange(t, e.target.value)}
                      className={s.qeSelect}
                      title="Đổi ưu tiên"
                      style={{ ...(PRIORITY_SELECT_STYLE[t.priority] ?? {}), fontWeight: 600 }}
                    >
                      {['urgent', 'high', 'medium', 'low'].map((p) => (
                        <option key={p} value={p}>
                          {getLabel('task_priority', p, PRIORITY_LABELS[p])}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Quick edit: due date */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    <ListDateField
                      value={t.dueDate ?? ''}
                      onChange={(e) => onDueDateChange(t, e.target.value)}
                      isOverdue={overdue}
                    />
                  </td>

                  <td className={s.td}>
                    {pct !== null ? (
                      <div className={s.progressWrap}>
                        <div className={s.progressBar}>
                          <div
                            className={`${s.progressFill} ${pct === 100 ? s.progressFillDone : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={s.progressText}>{pct}%</span>
                      </div>
                    ) : <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>—</span>}
                  </td>

                  <td className={s.td}>
                    {t.assignedToName ? (
                      <div className={s.assignedCell}>
                        <div className={s.avatarXs}>{t.assignedToName[0]?.toUpperCase()}</div>
                        <span>{t.assignedToName}</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>—</span>
                    )}
                  </td>

                  {/* Action column — always visible */}
                  <td className={s.tdAction} onClick={(e) => e.stopPropagation()}>
                    <div className={s.actionBtns}>
                      <button
                        className={s.btnActionView}
                        onClick={() => onQuickView(t.id)}
                        title="Xem nhanh"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        className={s.btnActionView}
                        onClick={() => onOpen(t.id)}
                        title="Mở chi tiết"
                      >
                        <ArrowUpRight size={13} />
                      </button>
                      {isAdmin && (
                        <button
                          className={s.btnActionDelete}
                          onClick={() => onDelete(t)}
                          title="Xóa công việc"
                        >
                          <Trash2 size={13} />
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

      {/* Pagination */}
      <div className={s.pagination}>
        <div className={s.paginationLeft}>
          <span className={s.paginationInfo}>
            {loading ? '...' : `${from}–${to} / ${pagination.total} công việc`}
          </span>
          <div className={s.pageSizeBtns}>
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                className={`${s.pageSizeBtn} ${pageSize === n ? s.pageSizeBtnActive : ''}`}
                onClick={() => onPageSizeChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className={s.paginationBtns}>
          <button className={s.pageBtn} onClick={() => onPageChange(1)} disabled={page === 1}>«</button>
          <button className={s.pageBtn} onClick={() => onPageChange(page - 1)} disabled={page === 1}>‹</button>
          {pageWindow().map((n, i) =>
            n === '…' ? (
              <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--color-muted)', fontSize: 12 }}>…</span>
            ) : (
              <button
                key={n}
                className={`${s.pageBtn} ${page === n ? s.pageBtnActive : ''}`}
                onClick={() => onPageChange(n)}
              >
                {n}
              </button>
            )
          )}
          <button className={s.pageBtn} onClick={() => onPageChange(page + 1)} disabled={page === (pagination.totalPages ?? 1)}>›</button>
          <button className={s.pageBtn} onClick={() => onPageChange(pagination.totalPages ?? 1)} disabled={page === (pagination.totalPages ?? 1)}>»</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Tasks page ───────────────────────────────────────────────────────────

const CUR_YEAR  = String(new Date().getFullYear())
const CUR_MONTH = String(new Date().getMonth() + 1)
const INIT_DATES = yearMonthToDates(CUR_YEAR, CUR_MONTH)

const FILTER_KEY = 'tasks_filter_v1'

function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) ?? {} }
  catch { return {} }
}
function saveFilters(obj) {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(obj)) } catch (_) {}
}

export default function Tasks() {
  const navigate    = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const addToast    = useToastStore((state) => state.toast)
  const getOptions  = useEnumsStore((st) => st.getOptions)
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const loadEnums   = useEnumsStore((st) => st.load)
  const isAdmin     = currentUser?.role === 'admin'

  // Restore saved filters from sessionStorage (once on mount)
  const [initF] = useState(() => loadSavedFilters())

  // View
  const [view, setView] = useState(initF.view ?? 'list')

  // Date filters — default: current month
  const [yearFilter,  setYearFilter]  = useState(initF.yearFilter  ?? CUR_YEAR)
  const [monthFilter, setMonthFilter] = useState(initF.monthFilter ?? CUR_MONTH)
  const [dueDateFrom, setDueDateFrom] = useState(initF.dueDateFrom ?? INIT_DATES.from)
  const [dueDateTo,   setDueDateTo]   = useState(initF.dueDateTo   ?? INIT_DATES.to)

  // Sort — default: newest first
  const [sortValue, setSortValue] = useState(initF.sortValue ?? 'created_at:desc')

  // Other filters (status/priority/source are multi-select arrays)
  const [searchInput, setSearchInput]       = useState(initF.searchInput    ?? '')
  const [search, setSearch]                 = useState(initF.searchInput    ?? '')
  const [companyFilter, setCompanyFilter]   = useState(initF.companyFilter  ?? '')
  const [staffFilter, setStaffFilter]       = useState(initF.staffFilter    ?? '')
  const [statusFilter, setStatusFilter]     = useState(initF.statusFilter   ?? [])
  const [priorityFilter, setPriorityFilter] = useState(initF.priorityFilter ?? [])
  const [sourceFilter, setSourceFilter]     = useState(initF.sourceFilter   ?? [])
  const [isOverdue, setIsOverdue]           = useState(initF.isOverdue      ?? false)

  // Stats (counts across base filters, ignoring status/priority/isOverdue)
  const [stats, setStats] = useState({
    total: 0, pending: 0, in_progress: 0, on_hold: 0,
    pending_review: 0, needs_revision: 0, completed: 0,
  })
  const [statsKey, setStatsKey] = useState(0)  // increment to force stats refresh

  // Refresh trigger (e.g. on tab-focus)
  const [refreshKey, setRefreshKey] = useState(0)

  // Pagination
  const [pageSize, setPageSize] = useState(initF.pageSize ?? 20)
  const [page, setPage]         = useState(1)

  // Data
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)

  // Reference data
  const [companies, setCompanies]       = useState([])
  const [staffList, setStaffList]       = useState([])
  const [availableYears, setAvailableYears] = useState([])

  // Modals
  const [showCreate, setShowCreate]         = useState(false)
  const [onHoldTarget, setOnHoldTarget]     = useState(null)
  const [forceTarget, setForceTarget]       = useState(null)
  const [deleteTarget, setDeleteTarget]     = useState(null)
  const [deleting, setDeleting]             = useState(false)
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting]     = useState(false)
  const [quickViewId, setQuickViewId]       = useState(null)

  // Bulk
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter changes
  useEffect(() => {
    setPage(1)
  }, [statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, pageSize, companyFilter, staffFilter, sortValue])

  // Load reference data + enums + years
  useEffect(() => {
    listCompanies({ limit: 300, status: 'active' }).then(({ companies: c }) => setCompanies(c)).catch(() => {})
    listUsers({ role: 'staff', status: 'active', limit: 100 }).then(({ users: u }) => setStaffList(u)).catch(() => {})
    loadEnums()
    tasksApi.getTaskYears()
      .then((years) => {
        setAvailableYears(years)
        // If current year not in list, fall back to first available year
        if (years.length > 0 && !years.includes(parseInt(CUR_YEAR, 10))) {
          const firstYear = String(years[0])
          setYearFilter(firstYear)
          const { from, to } = yearMonthToDates(firstYear, '')
          setDueDateFrom(from)
          setDueDateTo(to)
        }
      })
      .catch(() => {
        // Graceful fallback: generate last 3 years
        const y = parseInt(CUR_YEAR, 10)
        setAvailableYears([y, y - 1, y - 2])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh data when tab regains focus (catches changes made in other tabs / TaskDetail)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') {
        setRefreshKey((k) => k + 1)
        setStatsKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    saveFilters({
      view, yearFilter, monthFilter, dueDateFrom, dueDateTo,
      sortValue, searchInput, companyFilter, staffFilter,
      statusFilter, priorityFilter, sourceFilter, isOverdue, pageSize,
    })
  }, [view, yearFilter, monthFilter, dueDateFrom, dueDateTo, sortValue, searchInput, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, pageSize])

  // Load stats (always uses base date/company/staff filters, no status filter)
  useEffect(() => {
    let cancelled = false
    const base = {
      search:      search        || undefined,
      companyId:   companyFilter || undefined,
      assignedTo:  staffFilter   || undefined,
      dueDateFrom: dueDateFrom   || undefined,
      dueDateTo:   dueDateTo     || undefined,
      limit: 1, page: 1,
    }
    const statusKeys = ['pending', 'in_progress', 'on_hold', 'pending_review', 'needs_revision', 'completed']
    Promise.all([
      tasksApi.listTasks(base),
      ...statusKeys.map((st) => tasksApi.listTasks({ ...base, status: st })),
    ]).then(([all, ...bySt]) => {
      if (!cancelled) {
        const counts = { total: all.pagination.total }
        statusKeys.forEach((st, i) => { counts[st] = bySt[i].pagination.total })
        setStats(counts)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [search, companyFilter, staffFilter, dueDateFrom, dueDateTo, statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load tasks
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const [sortBy, sortDir] = sortValue.split(':')
    const params = {
      search:      search         || undefined,
      companyId:   companyFilter  || undefined,
      assignedTo:  staffFilter    || undefined,
      status:      statusFilter.length   > 0 ? statusFilter   : undefined,
      priority:    priorityFilter.length > 0 ? priorityFilter : undefined,
      source:      sourceFilter.length   > 0 ? sourceFilter[0] : undefined,
      isOverdue:   isOverdue      ? true : undefined,
      dueDateFrom: dueDateFrom    || undefined,
      dueDateTo:   dueDateTo      || undefined,
      limit:       view === 'list' ? pageSize : 500,
      page:        view === 'list' ? page : 1,
      sortBy,
      sortDir,
    }
    tasksApi.listTasks(params)
      .then(({ tasks: t, pagination: p }) => {
        if (!cancelled) {
          setTasks(t)
          setPagination(p ?? { page: 1, totalPages: 1, total: t.length })
          setSelectedIds(new Set())
        }
      })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, pageSize, page, view, sortValue, refreshKey])

  // ── Date filter handlers ──────────────────────────────────────────────────────

  function handleYearChange(year) {
    setYearFilter(year)
    const { from, to } = yearMonthToDates(year, year ? monthFilter : '')
    setDueDateFrom(from)
    setDueDateTo(to)
  }

  function handleMonthChange(month) {
    setMonthFilter(month)
    if (!yearFilter) return
    const { from, to } = yearMonthToDates(yearFilter, month)
    setDueDateFrom(from)
    setDueDateTo(to)
  }

  // ── Other handlers ────────────────────────────────────────────────────────────

  async function handleStatusChange(task, newStatus, extra = {}) {
    if (newStatus === 'on_hold' && !('reason' in extra)) {
      setOnHoldTarget({ task })
      return
    }
    try {
      const body = { status: newStatus }
      if (extra.reason !== undefined) body.onHoldReason = extra.reason || null
      if (extra.force)                body.force        = true

      const updated = await tasksApi.changeTaskStatus(task.id, body)
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      setStatsKey((k) => k + 1)
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      setOnHoldTarget(null)
      setForceTarget(null)
    } catch (err) {
      const status = err.response?.status
      const msg    = err.response?.data?.error?.message
      if (status === 409) {
        setOnHoldTarget(null)
        setForceTarget({ task, newStatus, prevExtra: extra })
      } else if (status === 422) {
        setOnHoldTarget(null)
        addToast(msg ?? 'Task bị chặn bởi dependency chưa hoàn thành', 'error')
      } else {
        addToast(msg ?? 'Không thể cập nhật trạng thái', 'error')
      }
    }
  }

  async function handlePriorityChange(task, priority) {
    try {
      const updated = await tasksApi.updateTask(task.id, { priority })
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      addToast(`Đã đổi ưu tiên → "${getLabel('task_priority', priority, PRIORITY_LABELS[priority])}"`, 'success')
    } catch {
      addToast('Không thể cập nhật ưu tiên', 'error')
    }
  }

  async function handleDueDateChange(task, dueDate) {
    try {
      const updated = await tasksApi.updateTask(task.id, { dueDate: dueDate || null })
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      addToast(dueDate ? 'Đã cập nhật ngày hết hạn' : 'Đã xóa ngày hết hạn', 'success')
    } catch {
      addToast('Không thể cập nhật ngày hết hạn', 'error')
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await tasksApi.deleteTask(deleteTarget.id)
      addToast(`Đã xoá "${deleteTarget.title}"`, 'success')
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n })
      const remaining = tasks.filter((t) => t.id !== deleteTarget.id)
      setTasks(remaining)
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }))
      if (remaining.length === 0 && page > 1) setPage((p) => p - 1)
      setDeleteTarget(null)
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá công việc', 'error')
    } finally {
      setDeleting(false)
    }
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setCompanyFilter(''); setStaffFilter('')
    setStatusFilter([]); setPriorityFilter([])
    setSourceFilter([]); setIsOverdue(false)
    setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH)
    setDueDateFrom(INIT_DATES.from)
    setDueDateTo(INIT_DATES.to)
    setSortValue('created_at:desc')
    setView('list'); setPageSize(20)
    setPage(1)
    try { sessionStorage.removeItem(FILTER_KEY) } catch (_) {}
  }

  const activeFilterCount = [search, companyFilter, staffFilter].filter(Boolean).length
    + statusFilter.length + priorityFilter.length + sourceFilter.length
    + (isOverdue ? 1 : 0)

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll(checked) {
    setSelectedIds(checked ? new Set(tasks.map((t) => t.id)) : new Set())
  }

  async function bulkComplete() {
    let done = 0
    for (const id of selectedIds) {
      const task = tasks.find((t) => t.id === id)
      if (!task || task.status === 'completed') continue
      try {
        await tasksApi.changeTaskStatus(id, { status: 'completed', force: true })
        done++
      } catch (_e) { /* skip individual failures */ }
    }
    if (done > 0) addToast(`Đã hoàn thành ${done} công việc`, 'success')
    setSelectedIds(new Set())
    if (done > 0) setPage(1)
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    let done = 0
    const ids = [...selectedIds]
    for (const id of ids) {
      try {
        await tasksApi.deleteTask(id)
        done++
      } catch (_e) { /* skip individual failures */ }
    }
    addToast(`Đã xoá ${done} công việc`, done > 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    setShowBulkDelete(false)
    setBulkDeleting(false)
    if (done > 0) setPage(1)
  }

  function openTask(id) { navigate(`/tasks/${id}`) }

  function onTaskCreated(task) {
    setShowCreate(false)
    addToast(`Đã tạo "${task.title}"`, 'success')
    if (view === 'list') {
      setTasks((prev) => [task, ...prev])
      setPagination((p) => ({ ...p, total: p.total + 1 }))
    }
  }

  function onTaskCreatedAndOpen(task) {
    setShowCreate(false)
    navigate(`/tasks/${task.id}`)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.toolbarLeft}>
            <h1 className={s.pageTitle}>Công việc</h1>
            {pagination.total > 0 && !loading && (
              <span className={s.totalBadge}>{pagination.total}</span>
            )}
          </div>

          <div className={s.toolbarRight}>
            <div className={s.viewSwitch}>
              <button className={`${s.viewBtn} ${view === 'list'     ? s.viewBtnActive : ''}`} onClick={() => setView('list')}>
                <List size={13} /> Danh sách
              </button>
              <button className={`${s.viewBtn} ${view === 'board'    ? s.viewBtnActive : ''}`} onClick={() => setView('board')}>
                <Columns size={13} /> Board
              </button>
              <button className={`${s.viewBtn} ${view === 'calendar' ? s.viewBtnActive : ''}`} onClick={() => setView('calendar')}>
                <Calendar size={13} /> Lịch
              </button>
            </div>

            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo công việc
            </button>
          </div>
        </div>

        {/* ── Unified filter panel (always visible) ── */}
        <div className={s.filterBar}>
          <div className={s.filterBarHead}>
            <div className={s.filterBarTitle}>
              <Filter size={12} />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className={s.filterActiveBadge}>{activeFilterCount} đang bật</span>
              )}
            </div>
            <button className={s.filterReset} onClick={resetFilters}>
              <RotateCcw size={11} /> Đặt lại
            </button>
          </div>

          <div className={s.filterGrid}>

            {/* NĂM */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Năm</label>
              <select value={yearFilter} onChange={(e) => handleYearChange(e.target.value)} className={s.filterSelect}>
                <option value="">Tất cả năm</option>
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>Năm {y}</option>
                ))}
              </select>
            </div>

            {/* THÁNG */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Tháng</label>
              <select value={monthFilter} onChange={(e) => handleMonthChange(e.target.value)} className={s.filterSelect} disabled={!yearFilter}>
                <option value="">Cả năm</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m)}>Tháng {m}</option>
                ))}
              </select>
            </div>

            {/* TỪ NGÀY */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Từ ngày</label>
              <input type="date" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); setPage(1) }} className={s.filterInput} />
            </div>

            {/* ĐẾN NGÀY */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Đến ngày</label>
              <input type="date" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); setPage(1) }} className={s.filterInput} />
            </div>

            {/* SẮP XẾP */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Sắp xếp</label>
              <select value={sortValue} onChange={(e) => setSortValue(e.target.value)} className={s.filterSelect}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* TỪ KHOÁ */}
            <div className={`${s.filterGroup} ${s.grow}`}>
              <label className={s.filterLabel}>Từ khoá</label>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={s.filterInput}
                  style={{ paddingLeft: 28 }}
                  placeholder="Tiêu đề công việc..."
                />
              </div>
            </div>

            {/* KHÁCH HÀNG */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Khách hàng</label>
              <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                <option value="">Tất cả</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* NHÂN VIÊN */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Nhân viên</label>
              <select value={staffFilter} onChange={(e) => { setStaffFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                <option value="">Tất cả</option>
                {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            {/* TRẠNG THÁI — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Trạng thái</label>
              <MultiSelect
                placeholder="Tất cả trạng thái"
                options={
                  getOptions('task_status').length > 0
                    ? getOptions('task_status')
                    : TASK_STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k] }))
                }
                selected={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(1) }}
              />
            </div>

            {/* ƯU TIÊN — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Ưu tiên</label>
              <MultiSelect
                placeholder="Tất cả ưu tiên"
                options={
                  getOptions('task_priority').length > 0
                    ? getOptions('task_priority')
                    : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
                }
                selected={priorityFilter}
                onChange={(v) => { setPriorityFilter(v); setPage(1) }}
              />
            </div>

            {/* NGUỒN — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Nguồn</label>
              <MultiSelect
                placeholder="Tất cả nguồn"
                options={
                  getOptions('task_source').length > 0
                    ? getOptions('task_source')
                    : [{ key: 'auto', label: 'Tự động' }, { key: 'manual', label: 'Thủ công' }]
                }
                selected={sourceFilter}
                onChange={(v) => { setSourceFilter(v); setPage(1) }}
              />
            </div>

            {/* QUÁ HẠN */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>&nbsp;</label>
              <button
                className={`${s.filterToggle} ${isOverdue ? s.filterToggleActive : ''}`}
                onClick={() => { setIsOverdue((p) => !p); setPage(1) }}
              >
                {isOverdue ? '✓ ' : ''}Quá hạn
              </button>
            </div>

          </div>

          {/* ── Stats row ── */}
          <div className={s.statsRow}>
            <div className={s.statItem}>
              <span className={s.statValue}>{stats.total}</span>
              <span className={s.statLabel}>Tổng</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={s.statValue}>{stats.pending ?? 0}</span>
              <span className={s.statLabel}>Chờ xử lý</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={`${s.statValue} ${s.statOrange}`}>{stats.in_progress ?? 0}</span>
              <span className={s.statLabel}>Đang thực hiện</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={s.statValue}>{stats.on_hold ?? 0}</span>
              <span className={s.statLabel}>Tạm hoãn</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={`${s.statValue} ${s.statPurple}`}>{stats.pending_review ?? 0}</span>
              <span className={s.statLabel}>Chờ duyệt</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={`${s.statValue} ${s.statRed}`}>{stats.needs_revision ?? 0}</span>
              <span className={s.statLabel}>Xem lại</span>
            </div>
            <span className={s.statDivider} />
            <div className={s.statItem}>
              <span className={`${s.statValue} ${s.statGreen}`}>{stats.completed ?? 0}</span>
              <span className={s.statLabel}>
                Hoàn thành{stats.total > 0 ? ` · ${Math.round((stats.completed ?? 0) / stats.total * 100)}%` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* ── Bulk action bar ── */}
        {selectedIds.size > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkCount}>{selectedIds.size} đã chọn</span>
            <span className={s.bulkDivider} />
            <button className={s.btnGhost} onClick={bulkComplete}>
              <Check size={13} /> Hoàn thành tất cả
            </button>
            {isAdmin && (
              <button
                className={s.btnGhost}
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setShowBulkDelete(true)}
              >
                <Trash2 size={13} /> Xóa đã chọn
              </button>
            )}
            <button className={s.btnGhost} onClick={() => setSelectedIds(new Set())}>
              Bỏ chọn
            </button>
          </div>
        )}

        {/* ── Content area ── */}
        {loading && view !== 'list' && (
          <div className={s.loadingBox}>
            <div className={s.spinner} />
            Đang tải...
          </div>
        )}

        {view === 'list' && (
          <ListView
            tasks={tasks}
            loading={loading}
            pagination={pagination}
            page={page}
            pageSize={pageSize}
            onPageChange={(p) => { setPage(p); setSelectedIds(new Set()) }}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
            onOpen={openTask}
            onQuickView={setQuickViewId}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onDueDateChange={handleDueDateChange}
            onDelete={setDeleteTarget}
            isAdmin={isAdmin}
          />
        )}

        {view === 'board' && !loading && (
          <BoardView
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onOpen={openTask}
            onQuickView={setQuickViewId}
            isAdmin={isAdmin}
            onDelete={setDeleteTarget}
          />
        )}

        {view === 'calendar' && !loading && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <CalendarView tasks={tasks} onOpen={openTask} />
          </div>
        )}

      </div>

      {/* ── Modals ── */}
      {showCreate && (
        <TaskFormModal
          onClose={() => setShowCreate(false)}
          onSaved={onTaskCreated}
          onSavedAndOpen={onTaskCreatedAndOpen}
        />
      )}

      {onHoldTarget && (
        <OnHoldModal
          task={onHoldTarget.task}
          onConfirm={handleStatusChange}
          onClose={() => setOnHoldTarget(null)}
        />
      )}

      {forceTarget && (
        <ForceConfirmModal
          task={forceTarget.task}
          newStatus={forceTarget.newStatus}
          onConfirm={() => handleStatusChange(forceTarget.task, forceTarget.newStatus, { ...forceTarget.prevExtra, force: true })}
          onClose={() => setForceTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          deleting={deleting}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {quickViewId && (
        <TaskQuickView
          taskId={quickViewId}
          onClose={() => setQuickViewId(null)}
          onUpdated={(updated) => setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))}
        />
      )}

      {showBulkDelete && (
        <div className={s.miniOverlay}>
          <div className={s.miniDialog}>
            <h4 className={s.miniTitle}>Xóa {selectedIds.size} công việc</h4>
            <p className={s.miniBody}>
              Bạn có chắc chắn muốn xóa <strong>{selectedIds.size}</strong> công việc đã chọn?{' '}
              Hành động này không thể hoàn tác.
            </p>
            <div className={s.miniActions}>
              <button
                onClick={() => setShowBulkDelete(false)}
                className={s.btnSecondary}
                disabled={bulkDeleting}
              >
                Hủy bỏ
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className={s.btnDangerSolid}
              >
                {bulkDeleting
                  ? <><Loader2 size={13} className={s.spinIcon} /> Đang xóa...</>
                  : <><Trash2 size={13} /> Xóa {selectedIds.size} mục</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
