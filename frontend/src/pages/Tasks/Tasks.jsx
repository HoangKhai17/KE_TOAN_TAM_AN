import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import {
  Plus, Search, RotateCcw, List, Columns, Calendar,
  ChevronLeft, ChevronRight, Filter, ClipboardList, Check,
  Trash2, Loader2, X,
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, format, addMonths, subMonths, isToday,
  startOfYear, endOfYear, startOfQuarter, endOfQuarter,
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

// ── Date preset helpers ───────────────────────────────────────────────────────

const DATE_PRESETS = [
  { key: 'today',        label: 'Hôm nay' },
  { key: 'this_week',    label: 'Tuần này' },
  { key: 'this_month',   label: 'Tháng này' },
  { key: 'this_quarter', label: 'Quý này' },
  { key: 'this_year',    label: 'Năm nay' },
  { key: 'custom',       label: 'Tùy chỉnh' },
]

function getPresetRange(preset) {
  const today = new Date()
  const fmt   = (d) => format(d, 'yyyy-MM-dd')
  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'this_week':
      return {
        from: fmt(startOfWeek(today, { weekStartsOn: 1 })),
        to:   fmt(endOfWeek(today,   { weekStartsOn: 1 })),
      }
    case 'this_month':
      return { from: fmt(startOfMonth(today)), to: fmt(endOfMonth(today)) }
    case 'this_quarter':
      return { from: fmt(startOfQuarter(today)), to: fmt(endOfQuarter(today)) }
    case 'this_year':
      return { from: fmt(startOfYear(today)), to: fmt(endOfYear(today)) }
    default:
      return { from: '', to: '' }
  }
}

function presetChipLabel(preset, from, to) {
  const today = new Date()
  if (preset === 'today')        return 'Hôm nay'
  if (preset === 'this_week')    return 'Tuần này'
  if (preset === 'this_month')   return `Tháng ${format(today, 'MM/yyyy')}`
  if (preset === 'this_quarter') return 'Quý này'
  if (preset === 'this_year')    return `Năm ${format(today, 'yyyy')}`
  if (from && to) {
    const fmtD = (s) => s.split('-').reverse().join('/')
    return `${fmtD(from)} – ${fmtD(to)}`
  }
  return 'Tùy chỉnh'
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
  const [calMonth, setCalMonth]   = useState(new Date())
  const [dayPopover, setDayPopover] = useState(null) // { date, tasks }

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

      {/* Day popover */}
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
  const colSpan = isAdmin ? 8 : 7

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
              <th className={s.th}>Trạng thái</th>
              <th className={s.th}>Ưu tiên</th>
              <th className={s.th}>Hết hạn</th>
              <th className={s.th}>Tiến độ</th>
              <th className={s.th}>Giao cho</th>
              {isAdmin && <th className={s.th} style={{ width: 44 }} />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  {[260, 110, 80, 80, 90, 110].map((w, j) => (
                    <td key={j} className={s.td}>
                      <div style={{ width: w, height: 11, background: '#f1f5f9', borderRadius: 4, animation: 'app-pulse 1.5s ease-in-out infinite' }} />
                    </td>
                  ))}
                  {isAdmin && <td className={s.td} />}
                </tr>
              ))
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
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

                  {isAdmin && (
                    <td className={s.tdAction} onClick={(e) => e.stopPropagation()}>
                      <button
                        className={s.btnDeleteRow}
                        onClick={() => onDelete(t)}
                        title="Xóa công việc"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  )}
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

  // Date preset
  const [datePreset, setDatePreset] = useState('this_month')
  const initRange = useMemo(() => getPresetRange('this_month'), [])
  const [dueDateFrom, setDueDateFrom] = useState(initRange.from)
  const [dueDateTo,   setDueDateTo]   = useState(initRange.to)

  // Other filters
  const [searchInput, setSearchInput]       = useState('')
  const [search, setSearch]                 = useState('')
  const [companyFilter, setCompanyFilter]   = useState('')
  const [staffFilter, setStaffFilter]       = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sourceFilter, setSourceFilter]     = useState('')
  const [isOverdue, setIsOverdue]           = useState(false)
  const [showFilter, setShowFilter]         = useState(false)

  // Pagination
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage]         = useState(1)

  // Data
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading, setLoading]       = useState(true)

  // Reference data
  const [companies, setCompanies] = useState([])
  const [staffList, setStaffList] = useState([])

  // Modals
  const [showCreate, setShowCreate]     = useState(false)
  const [onHoldTarget, setOnHoldTarget] = useState(null)
  const [forceTarget, setForceTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)

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
  }, [statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, pageSize, companyFilter, staffFilter])

  // Load reference data + enums
  useEffect(() => {
    listCompanies({ limit: 300, status: 'active' }).then(({ companies: c }) => setCompanies(c)).catch(() => {})
    listUsers({ role: 'staff', status: 'active', limit: 100 }).then(({ users: u }) => setStaffList(u)).catch(() => {})
    loadEnums()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load tasks
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = {
      search:      search         || undefined,
      companyId:   companyFilter  || undefined,
      assignedTo:  staffFilter    || undefined,
      status:      statusFilter   || undefined,
      priority:    priorityFilter || undefined,
      source:      sourceFilter   || undefined,
      isOverdue:   isOverdue      ? true : undefined,
      dueDateFrom: dueDateFrom    || undefined,
      dueDateTo:   dueDateTo      || undefined,
      limit:       view === 'list' ? pageSize : 500,
      page:        view === 'list' ? page : 1,
      sortBy:      'due_date',
      sortDir:     'asc',
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
  }, [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, pageSize, page, view])

  // ── Handlers ─────────────────────────────────────────────────────────────────

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

  function applyPreset(preset) {
    setDatePreset(preset)
    if (preset !== 'custom') {
      const { from, to } = getPresetRange(preset)
      setDueDateFrom(from)
      setDueDateTo(to)
    }
    setPage(1)
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setCompanyFilter(''); setStaffFilter('')
    setStatusFilter(''); setPriorityFilter('')
    setSourceFilter(''); setIsOverdue(false)
    const range = getPresetRange('this_month')
    setDatePreset('this_month')
    setDueDateFrom(range.from)
    setDueDateTo(range.to)
    setPage(1)
  }

  const activeFilterCount = [
    search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter,
  ].filter(Boolean).length + (isOverdue ? 1 : 0)

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

            <button
              className={`${s.btnSecondary} ${showFilter ? s.btnSecondaryActive : ''}`}
              style={{ height: 32, padding: '0 12px', fontSize: 13 }}
              onClick={() => setShowFilter((p) => !p)}
            >
              <Filter size={13} />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className={s.filterActiveBadge}>{activeFilterCount}</span>
              )}
            </button>

            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo công việc
            </button>
          </div>
        </div>

        {/* ── Quick filters ── */}
        <div className={s.quickFilters}>
          {/* Date presets */}
          <span className={s.qLabel}>Thời gian:</span>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              className={`${s.qBtn} ${datePreset === p.key ? s.qBtnActive : ''}`}
              onClick={() => applyPreset(p.key)}
            >
              {p.label}
            </button>
          ))}

          {/* Active date chip */}
          <span className={s.dateChip}>
            {presetChipLabel(datePreset, dueDateFrom, dueDateTo)}
          </span>

          <span className={s.qDivider} />

          {/* Status & role quick filters */}
          <span className={s.qLabel}>Nhanh:</span>
          <button
            className={`${s.qBtn} ${isOverdue ? s.qBtnActive : ''}`}
            onClick={() => { setIsOverdue((p) => !p); setPage(1) }}
          >
            Quá hạn
          </button>
          {currentUser && (
            <button
              className={`${s.qBtn} ${staffFilter === currentUser.id ? s.qBtnActive : ''}`}
              onClick={() => { setStaffFilter((p) => p === currentUser.id ? '' : currentUser.id); setPage(1) }}
            >
              Của tôi
            </button>
          )}
          <button
            className={`${s.qBtn} ${statusFilter === 'pending' ? s.qBtnActive : ''}`}
            onClick={() => { setStatusFilter((p) => p === 'pending' ? '' : 'pending'); setPage(1) }}
          >
            Chờ xử lý
          </button>
          <button
            className={`${s.qBtn} ${statusFilter === 'in_progress' ? s.qBtnActive : ''}`}
            onClick={() => { setStatusFilter((p) => p === 'in_progress' ? '' : 'in_progress'); setPage(1) }}
          >
            Đang thực hiện
          </button>

          {activeFilterCount > 0 && (
            <button className={s.qResetBtn} onClick={resetFilters}>
              <RotateCcw size={11} /> Đặt lại ({activeFilterCount})
            </button>
          )}
        </div>

        {/* ── Custom date range ── */}
        {datePreset === 'custom' && (
          <div className={s.customDateRow}>
            <label className={s.filterLabel}>Từ ngày</label>
            <input
              type="date"
              value={dueDateFrom}
              onChange={(e) => { setDueDateFrom(e.target.value); setPage(1) }}
              className={s.filterInput}
              style={{ width: 150 }}
            />
            <label className={s.filterLabel}>Đến ngày</label>
            <input
              type="date"
              value={dueDateTo}
              onChange={(e) => { setDueDateTo(e.target.value); setPage(1) }}
              className={s.filterInput}
              style={{ width: 150 }}
            />
          </div>
        )}

        {/* ── Advanced filter bar ── */}
        {showFilter && (
          <div className={s.filterBar}>
            <div className={s.filterBarHead}>
              <div className={s.filterBarTitle}>
                <Filter size={12} />
                Bộ lọc nâng cao
                {activeFilterCount > 0 && (
                  <span className={s.filterActiveBadge}>{activeFilterCount} đang bật</span>
                )}
              </div>
              <button className={s.filterReset} onClick={resetFilters}>
                <RotateCcw size={11} /> Đặt lại
              </button>
            </div>

            <div className={s.filterGrid}>
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

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Khách hàng</label>
                <select value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Nhân viên</label>
                <select value={staffFilter} onChange={(e) => { setStaffFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {staffList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Trạng thái</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {(getOptions('task_status').length > 0
                    ? getOptions('task_status')
                    : TASK_STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k] }))
                  ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Ưu tiên</label>
                <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {(getOptions('task_priority').length > 0
                    ? getOptions('task_priority')
                    : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))
                  ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Nguồn</label>
                <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {(getOptions('task_source').length > 0
                    ? getOptions('task_source')
                    : [{ key: 'auto', label: 'Tự động' }, { key: 'manual', label: 'Thủ công' }]
                  ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>&nbsp;</label>
                <button
                  className={`${s.filterToggle} ${isOverdue ? s.filterToggleActive : ''}`}
                  onClick={() => { setIsOverdue((p) => !p); setPage(1) }}
                >
                  Quá hạn
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Bulk action bar ── */}
        {selectedIds.size > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkCount}>{selectedIds.size} đã chọn</span>
            <span className={s.bulkDivider} />
            <button className={s.btnGhost} onClick={bulkComplete}>
              <Check size={13} /> Hoàn thành tất cả
            </button>
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
    </AppLayout>
  )
}
