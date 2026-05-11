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
  Trash2, Loader2, X, Eye,
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, format, addMonths, subMonths, isToday, differenceInDays, parseISO,
} from 'date-fns'
import { vi } from 'date-fns/locale'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as tasksApi from '../../api/tasks'
import { listCompanies } from '../../api/companies'
import { listUsers } from '../../api/users'
import TaskFormModal from './TaskFormModal'
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
  if (!task.createdAt) return null
  const start = parseISO(task.createdAt)
  const end   = task.completedAt ? parseISO(task.completedAt) : new Date()
  return Math.max(0, differenceInDays(end, start))
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

function BoardCardInner({ task, isAdmin, onDelete }) {
  const pct     = progressPct(task)
  const overdue = isTaskOverdue(task)
  return (
    <>
      <div className={s.boardCardTitle}>{task.title}</div>
      {task.companyName && <div className={s.boardCardCompany}>{task.companyName}</div>}
      <div className={s.boardCardMeta}>
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className={overdue ? s.boardCardDateOver : s.boardCardDate}>
            {fmtDate(task.dueDate)}
          </span>
        )}
      </div>
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
      {isAdmin && onDelete && (
        <div className={s.boardCardActions}>
          <button
            className={s.boardCardDeleteBtn}
            onClick={(e) => { e.stopPropagation(); onDelete(task) }}
            title="Xóa công việc"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </>
  )
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

function DraggableCard({ task, onOpen, isAdmin, onDelete }) {
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
      <BoardCardInner task={task} isAdmin={isAdmin} onDelete={onDelete} />
    </div>
  )
}

// ── DroppableColumn ───────────────────────────────────────────────────────────

function DroppableColumn({ status, tasks, onOpen, isAdmin, onDelete }) {
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
          <DraggableCard key={t.id} task={t} onOpen={onOpen} isAdmin={isAdmin} onDelete={onDelete} />
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

function BoardView({ tasks, onStatusChange, onOpen, isAdmin, onDelete }) {
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

function CalendarView({ tasks, onOpen }) {
  const [calMonth, setCalMonth]     = useState(new Date())
  const [dayPopover, setDayPopover] = useState(null)

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(calMonth),     { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [calMonth])

  const tasksByDay = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!t.dueDate) continue
      const key = t.dueDate.slice(0, 10)
      if (!map[key]) map[key] = []
      map[key].push(t)
    }
    return map
  }, [tasks])

  function calClass(t) {
    if (t.status === 'completed') return s.calTaskDone
    if (isTaskOverdue(t))        return s.calTaskOverdue
    return CAL_PRIORITY_CLASS[t.priority] ?? s.calTaskLow
  }

  return (
    <div className={s.calWrap}>
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

      <div className={s.calGrid}>
        {WEEK_DAYS.map((d) => (
          <div key={d} className={s.calDayHead}>{d}</div>
        ))}
        {days.map((day) => {
          const key      = format(day, 'yyyy-MM-dd')
          const dayTasks = tasksByDay[key] ?? []
          const isOther  = !isSameMonth(day, calMonth)
          const isTod    = isToday(day)

          return (
            <div
              key={key}
              className={`${s.calCell} ${isOther ? s.calCellOther : ''} ${isTod ? s.calCellToday : ''}`}
            >
              <div className={s.calDayNum}>{format(day, 'd')}</div>
              {dayTasks.slice(0, 3).map((t) => (
                <span
                  key={t.id}
                  className={`${s.calTask} ${calClass(t)}`}
                  onClick={() => onOpen(t.id)}
                  title={t.title}
                >
                  {t.title}
                </span>
              ))}
              {dayTasks.length > 3 && (
                <button
                  className={s.calMoreBtn}
                  onClick={(e) => { e.stopPropagation(); setDayPopover({ date: key, tasks: dayTasks }) }}
                >
                  +{dayTasks.length - 3} thêm
                </button>
              )}
            </div>
          )
        })}
      </div>

      {dayPopover && (
        <div className={s.miniOverlay} onClick={() => setDayPopover(null)}>
          <div className={s.calDayPopover} onClick={(e) => e.stopPropagation()}>
            <div className={s.calDayPopoverHead}>
              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                {dayPopover.date.split('-').reverse().join('/')}
              </span>
              <span style={{ color: 'var(--color-muted)', fontSize: 12, marginLeft: 6 }}>
                ({dayPopover.tasks.length} công việc)
              </span>
              <button
                className={s.btnIcon}
                style={{ marginLeft: 'auto' }}
                onClick={() => setDayPopover(null)}
              >
                <X size={13} />
              </button>
            </div>
            <div className={s.calDayPopoverList}>
              {dayPopover.tasks.map((t) => (
                <div
                  key={t.id}
                  className={s.calDayPopoverItem}
                  onClick={() => { onOpen(t.id); setDayPopover(null) }}
                >
                  <span className={`${s.calTask} ${calClass(t)}`} style={{ flexShrink: 0 }}>
                    {STATUS_LABELS[t.status]}
                  </span>
                  <span className={s.calDayPopoverTitle}>{t.title}</span>
                  {t.companyName && (
                    <span className={s.calDayPopoverCompany}>{t.companyName}</span>
                  )}
                </div>
              ))}
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
  onPageChange, onPageSizeChange, onOpen,
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
              <th className={s.th} style={{ width: 90 }}>Hành động</th>
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
                    <span className={s.dueDateNormal}>{fmtDate(t.createdAt)}</span>
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
                    <input
                      type="date"
                      value={t.dueDate?.slice(0, 10) ?? ''}
                      onChange={(e) => onDueDateChange(t, e.target.value)}
                      className={`${s.qeDate} ${overdue ? s.qeDateOverdue : ''}`}
                      title="Đổi ngày hết hạn"
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
                        onClick={() => onOpen(t.id)}
                        title="Xem chi tiết"
                      >
                        <Eye size={13} />
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

export default function Tasks() {
  const navigate    = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const addToast    = useToastStore((state) => state.toast)
  const getOptions  = useEnumsStore((st) => st.getOptions)
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const loadEnums   = useEnumsStore((st) => st.load)
  const isAdmin     = currentUser?.role === 'admin'

  // View
  const [view, setView] = useState('list')

  // Date filters — default: current month
  const [yearFilter,  setYearFilter]  = useState(CUR_YEAR)
  const [monthFilter, setMonthFilter] = useState(CUR_MONTH)
  const [dueDateFrom, setDueDateFrom] = useState(INIT_DATES.from)
  const [dueDateTo,   setDueDateTo]   = useState(INIT_DATES.to)

  // Sort — default: newest first
  const [sortValue, setSortValue] = useState('created_at:desc')

  // Other filters (status/priority/source are multi-select arrays)
  const [searchInput, setSearchInput]       = useState('')
  const [search, setSearch]                 = useState('')
  const [companyFilter, setCompanyFilter]   = useState('')
  const [staffFilter, setStaffFilter]       = useState('')
  const [statusFilter, setStatusFilter]     = useState([])
  const [priorityFilter, setPriorityFilter] = useState([])
  const [sourceFilter, setSourceFilter]     = useState([])
  const [isOverdue, setIsOverdue]           = useState(false)

  // Stats (counts across base filters, ignoring status/priority/isOverdue)
  const [stats, setStats] = useState({
    total: 0, pending: 0, in_progress: 0, on_hold: 0,
    pending_review: 0, needs_revision: 0, completed: 0,
  })

  // Pagination
  const [pageSize, setPageSize] = useState(20)
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
  }, [search, companyFilter, staffFilter, dueDateFrom, dueDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, pageSize, page, view, sortValue])

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
    } catch {
      addToast('Không thể cập nhật ưu tiên', 'error')
    }
  }

  async function handleDueDateChange(task, dueDate) {
    try {
      const updated = await tasksApi.updateTask(task.id, { dueDate: dueDate || null })
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
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
    setPage(1)
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
            isAdmin={isAdmin}
            onDelete={setDeleteTarget}
          />
        )}

        {view === 'calendar' && !loading && (
          <CalendarView tasks={tasks} onOpen={openTask} />
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
