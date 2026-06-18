import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import {
  Plus, Search, RotateCcw, List, Columns, Layers,
  ChevronRight, ChevronDown, Filter, ClipboardList, Check,
  Trash2, Loader2, X, Eye, ArrowUpRight, Maximize2, Minimize2,
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
import { listUserOptions } from '../../api/users'
import TaskFormModal from './TaskFormModal'
import TaskQuickView from './TaskQuickView'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import {
  TASK_STATUSES, STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS,
  isTaskOverdue, fmtDate, progressPct,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import s from './tasks.module.css'

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'due_date:asc',    label: 'Hết hạn sớm nhất' },
  { value: 'due_date:desc',   label: 'Hết hạn muộn nhất' },
  { value: 'created_at:desc', label: 'Mới nhất' },
  { value: 'created_at:asc',  label: 'Cũ nhất' },
  { value: 'priority:asc',    label: 'Ưu tiên: Cao → Thấp' },
  { value: 'priority:desc',   label: 'Ưu tiên: Thấp → Cao' },
  { value: 'status:asc',      label: 'Trạng thái: Chờ → Hoàn thành' },
  { value: 'status:desc',     label: 'Trạng thái: Hoàn thành → Chờ' },
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

const STATUS_SELECT_CLASS = {
  pending: s.qeStatusPending,
  in_progress: s.qeStatusInProgress,
  on_hold: s.qeStatusOnHold,
  pending_review: s.qeStatusPendingReview,
  needs_revision: s.qeStatusNeedsRevision,
  completed: s.qeStatusCompleted,
}

const PRIORITY_SELECT_CLASS = {
  urgent: s.qePriorityUrgent,
  high: s.qePriorityHigh,
  medium: s.qePriorityMedium,
  low: s.qePriorityLow,
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
      className={`${s.qeDate} ${s.qeDateInteractive} ${isOverdue ? s.qeDateOverdue : ''}`}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span className={s.qeDateText}>
        {dateStr ? fmtDate(dateStr) : '—'}
      </span>
      <input
        ref={ref}
        type="date"
        value={dateStr}
        onChange={onChange}
        className={s.qeDateInputNative}
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
              className={`${s.progressFill} ${s.progressFillDynamic} ${pct === 100 ? s.progressFillDone : ''}`}
              style={{ '--progress-width': `${pct}%` }}
            />
          </div>
          <span className={s.boardCardProgressText}>{pct}%</span>
        </div>
      )}
      {(onQuickView || onDelete) && (
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
          {onDelete && (
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
      className={`${s.boardCard} ${isDragging ? s.boardCardDragging : ''} ${transform ? s.dragTransform : ''}`}
      style={transform ? { '--drag-x': `${transform.x}px`, '--drag-y': `${transform.y}px` } : undefined}
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
          <p className={s.boardEmptyText}>
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


// ── Column-header filter helpers (docs/018) for the list view ───────────────────

const STATUS_RANK   = { pending: 1, in_progress: 2, on_hold: 3, pending_review: 4, needs_revision: 5, completed: 6 }
const PRIORITY_RANK = { urgent: 1, high: 2, medium: 3, low: 4 }

const TASK_LIST_COL_TYPE = {
  title:          'text',
  companyName:    'enum',
  startDate:      'dateRange',
  days:           'numberRange',
  status:         'enum',
  priority:       'enum',
  dueDate:        'dateRange',
  progress:       'numberRange',
  assignedToName: 'enum',
}
function taskColFilterType(colKey) { return TASK_LIST_COL_TYPE[colKey] ?? 'text' }

// Raw value used for date/number filtering (must mirror what the column shows)
function taskColRawDate(t, colKey)   { return colKey === 'startDate' ? (t.startDate || t.createdAt) : t.dueDate }
function taskColRawNumber(t, colKey) { return colKey === 'days' ? calcDays(t) : progressPct(t) }

function taskColSortKey(t, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_RANK[t.status] ?? 99
    case 'priority':       return PRIORITY_RANK[t.priority] ?? 99
    case 'days':           { const d = calcDays(t);    return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'progress':       { const p = progressPct(t); return p == null ? -1 : p }
    case 'startDate':      return t.startDate || t.createdAt || ''
    case 'dueDate':        return t.dueDate || ''
    case 'companyName':    return (t.companyName || '').toLowerCase()
    case 'assignedToName': return (t.assignedToName || '').toLowerCase()
    default:               return (t.title || '').toLowerCase()
  }
}

// ── SourceBoardView — Kanban theo Nguồn công việc (drag để đổi nguồn) ────────────

function DraggableSourceCard({ task, onOpen, isAdmin, onDelete, onQuickView }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id, data: { source: task.source },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${s.boardCard} ${isDragging ? s.boardCardDragging : ''} ${transform ? s.dragTransform : ''}`}
      style={transform ? { '--drag-x': `${transform.x}px`, '--drag-y': `${transform.y}px` } : undefined}
      onClick={() => !isDragging && onOpen(task.id)}
    >
      <BoardCardInner task={task} isAdmin={isAdmin} onDelete={onDelete} onQuickView={onQuickView} />
    </div>
  )
}

function DroppableSourceColumn({ srcKey, label, tasks, onOpen, isAdmin, onDelete, onQuickView }) {
  const { setNodeRef, isOver } = useDroppable({ id: srcKey })
  return (
    <div className={s.boardCol}>
      <div className={s.boardColHead}>
        <span className={s.boardColDot} />
        <span className={s.boardColTitle}>{label}</span>
        <span className={s.boardColCount}>{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`${s.boardCards} ${isOver ? s.boardCardsOver : ''}`}>
        {tasks.map((t) => (
          <DraggableSourceCard key={t.id} task={t} onOpen={onOpen} isAdmin={isAdmin} onDelete={onDelete} onQuickView={onQuickView} />
        ))}
        {tasks.length === 0 && <p className={s.boardEmptyText}>Không có</p>}
      </div>
    </div>
  )
}

function SourceBoardView({ tasks, sourceOptions, onSourceChange, onOpen, onQuickView, isAdmin, onDelete }) {
  const [activeTask, setActiveTask] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const bySource = useMemo(() => {
    const map = {}
    for (const sc of sourceOptions) map[sc.key] = []
    for (const t of tasks) {
      if (map[t.source]) map[t.source].push(t)
      else (map.__other ??= []).push(t)
    }
    return map
  }, [tasks, sourceOptions])

  const cols = [...sourceOptions]
  if ((bySource.__other ?? []).length > 0) cols.push({ key: '__other', label: 'Khác' })

  function handleDragStart({ active }) { setActiveTask(tasks.find((t) => t.id === active.id) ?? null) }
  function handleDragEnd({ active, over }) {
    setActiveTask(null)
    if (!over) return
    const src = active.data.current?.source
    const dst = over.id
    if (src === dst || dst === '__other') return
    const task = tasks.find((t) => t.id === active.id)
    if (task) onSourceChange(task, dst)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={s.boardWrap}>
        {cols.map((sc) => (
          <DroppableSourceColumn
            key={sc.key} srcKey={sc.key} label={sc.label}
            tasks={bySource[sc.key] ?? []}
            onOpen={onOpen} isAdmin={isAdmin} onDelete={onDelete} onQuickView={onQuickView}
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
          className={`${s.chevronRotate} ${open ? s.chevronOpen : ''}`}
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

// ── FilterDateField: shows dd/MM/yyyy text, hidden native picker ──────────────

function FilterDateField({ value, onChange }) {
  const ref = useRef(null)
  return (
    <div className={s.filterDateField} onClick={() => ref.current?.showPicker?.()}>
      <span className={value ? s.filterDateFieldText : `${s.filterDateFieldText} ${s.filterDateFieldPlaceholder}`}>
        {value ? fmtDate(value) : 'dd/mm/yyyy'}
      </span>
      <input
        ref={ref}
        type="date"
        value={value}
        onChange={onChange}
        tabIndex={-1}
        className={s.filterDateFieldInput}
      />
    </div>
  )
}

// ── FilterCompanyPicker: searchable company dropdown for filter bar ───────────

function FilterCompanyPicker({ companies, value, onChange }) {
  const [search,   setSearch]   = useState('')
  const [open,     setOpen]     = useState(false)
  const wrapRef   = useRef(null)
  const searchRef = useRef(null)

  const selected = companies.find((c) => c.id === value)
  const filtered = search.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function select(id) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={wrapRef} className={s.companyPickerWrap}>
      <div
        className={`${s.cpTrigger} ${s.companyPickerTriggerCompact}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${s.cpTriggerText} ${selected ? s.companyPickerSelected : s.companyPickerPlaceholder}`}>
          {selected?.name ?? 'Tất cả'}
        </span>
        <ChevronDown size={11} className={`${s.iconMuted} ${s.chevronRotate} ${open ? s.chevronOpen : ''}`} />
      </div>

      {open && (
        <div className={s.cpDropdown}>
          <div className={s.cpSearch}>
            <Search size={12} className={s.iconMuted} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
              placeholder="Tìm khách hàng..."
              className={s.cpSearchInput}
            />
            {search && (
              <button type="button" className={s.cpSearchClear} onClick={() => setSearch('')}>
                <X size={10} />
              </button>
            )}
          </div>
          <div className={s.cpList}>
            <div
              className={`${s.cpItem} ${!value ? s.cpItemActive : ''}`}
              onClick={() => select('')}
            >
              Tất cả khách hàng
            </div>
            {filtered.map((c) => (
              <div
                key={c.id}
                className={`${s.cpItem} ${value === c.id ? s.cpItemActive : ''}`}
                onClick={() => select(c.id)}
              >
                {c.name}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={s.cpEmpty}>Không tìm thấy &quot;{search}&quot;</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── FilterCompanyMultiPicker: searchable multi-select company dropdown ─────────

function FilterCompanyMultiPicker({ companies, value, onChange }) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)
  const wrapRef   = useRef(null)
  const searchRef = useRef(null)

  const selectedSet = new Set(value)
  const filtered = search.trim()
    ? companies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    function onOutside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  function toggle(id) {
    onChange(selectedSet.has(id) ? value.filter((x) => x !== id) : [...value, id])
  }

  return (
    <div ref={wrapRef} className={s.companyPickerWrap}>
      <div className={`${s.cpTrigger} ${s.companyPickerTriggerCompact}`} onClick={() => setOpen((o) => !o)}>
        <span className={`${s.cpTriggerText} ${value.length ? s.companyPickerSelected : s.companyPickerPlaceholder}`}>
          {value.length === 0 ? 'Tất cả' : `${value.length} đã chọn`}
        </span>
        <ChevronDown size={11} className={`${s.iconMuted} ${s.chevronRotate} ${open ? s.chevronOpen : ''}`} />
      </div>
      {open && (
        <div className={s.cpDropdown}>
          <div className={s.cpSearch}>
            <Search size={12} className={s.iconMuted} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
              placeholder="Tìm khách hàng..."
              className={s.cpSearchInput}
            />
            {search && (
              <button type="button" className={s.cpSearchClear} onClick={() => setSearch('')}><X size={10} /></button>
            )}
          </div>
          <div className={s.cpList}>
            {value.length > 0 && (
              <div className={s.cpItem} onClick={() => onChange([])}>Bỏ chọn tất cả</div>
            )}
            {filtered.map((c) => (
              <label key={c.id} className={`${s.cpItem} ${s.cpItemMulti} ${selectedSet.has(c.id) ? s.cpItemActive : ''}`}>
                <input type="checkbox" checked={selectedSet.has(c.id)} onChange={() => toggle(c.id)} />
                <span>{c.name}</span>
              </label>
            ))}
            {filtered.length === 0 && <div className={s.cpEmpty}>Không tìm thấy &quot;{search}&quot;</div>}
          </div>
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
  sortColState, hasColFilter, onOpenColFilter, colFilterCount = 0, hasColSort = false,
}) {
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id))

  function Th({ colKey, children }) {
    const active = hasColFilter(colKey) || sortColState?.col === colKey
    return (
      <th className={s.th}>
        <div className={s.thFilterInner}>
          <span className={s.thFilterLabel}>{children}</span>
          <button
            data-colfilter-btn
            className={`${s.thFilterBtn} ${active ? s.thFilterBtnActive : ''}`}
            onClick={(e) => onOpenColFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }
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
      <div className={s.tableScrollX}>
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
              <Th colKey="title">Tiêu đề / Khách hàng</Th>
              <Th colKey="startDate">Ngày bắt đầu</Th>
              <Th colKey="days">Số ngày</Th>
              <Th colKey="status">Trạng thái</Th>
              <Th colKey="priority">Ưu tiên</Th>
              <Th colKey="dueDate">Hết hạn</Th>
              <Th colKey="progress">Tiến độ</Th>
              <Th colKey="assignedToName">Giao cho</Th>
              <th className={`${s.th} ${s.thAction}`}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  {[240, 80, 55, 110, 80, 80, 90, 110, 70].map((w, j) => (
                    <td key={j} className={s.td}>
                      <div className={s.tableSkeletonBar} style={{ '--skeleton-w': `${w}px` }} />
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
                  onClick={() => onQuickView(t.id)}
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
                    ) : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Quick edit: status */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={t.status}
                      onChange={(e) => { if (e.target.value !== t.status) onStatusChange(t, e.target.value) }}
                      className={`${s.qeSelect} ${s.qeSelectStyled} ${STATUS_SELECT_CLASS[t.status] ?? ''}`}
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
                      value={t.priority ?? ''}
                      onChange={(e) => onPriorityChange(t, e.target.value)}
                      className={`${s.qeSelect} ${s.qeSelectStyled} ${PRIORITY_SELECT_CLASS[t.priority] ?? ''}`}
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
                            className={`${s.progressFill} ${s.progressFillDynamic} ${pct === 100 ? s.progressFillDone : ''}`}
                            style={{ '--progress-width': `${pct}%` }}
                          />
                        </div>
                        <span className={s.progressText}>{pct}%</span>
                      </div>
                    ) : <span className={s.mutedDash}>—</span>}
                  </td>

                  <td className={s.td}>
                    {t.assignedToName ? (
                      <div className={s.assignedCell}>
                        <div className={s.avatarXs}>{t.assignedToName[0]?.toUpperCase()}</div>
                        <span>{t.assignedToName}</span>
                      </div>
                    ) : (
                      <span className={s.mutedDash}>—</span>
                    )}
                  </td>

                  {/* Action column — always visible */}
                  <td className={s.tdAction} onClick={(e) => e.stopPropagation()}>
                    <div className={s.actionBtns}>
                      <button
                        className={s.btnActionView}
                        onClick={() => onOpen(t.id)}
                        title="Mở chi tiết"
                      >
                        <ArrowUpRight size={13} />
                      </button>
                      <button
                        className={s.btnActionDelete}
                        onClick={() => onDelete(t)}
                        title="Xóa công việc"
                      >
                        <Trash2 size={13} />
                      </button>
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
            {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
            {hasColSort && ' · đang sắp xếp'}
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
              <span key={`e${i}`} className={s.paginationGap}>…</span>
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
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(obj)) } catch (_) { /* ignore storage errors */ }
}

export default function Tasks() {
  const navigate      = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentUser = useAuthStore((state) => state.user)
  const addToast    = useToastStore((state) => state.toast)
  const getOptions  = useEnumsStore((st) => st.getOptions)
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const loadEnums   = useEnumsStore((st) => st.load)
  const isAdmin = currentUser?.role === 'admin'

  // Handle URL params from header shortcuts (?new=1, ?search=...)
  const _urlNew    = searchParams.get('new')
  const _urlSearch = searchParams.get('search')

  // Restore saved filters from sessionStorage (once on mount)
  const [initF] = useState(() => {
    const saved = loadSavedFilters()
    if (_urlSearch) saved.searchInput = _urlSearch
    return saved
  })

  // View
  const [view, setView] = useState(initF.view ?? 'list')

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    function onFsChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

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
  const [companyFilter, setCompanyFilter]   = useState(() => Array.isArray(initF.companyFilter) ? initF.companyFilter : [])
  const [staffFilter, setStaffFilter]       = useState(() => Array.isArray(initF.staffFilter)   ? initF.staffFilter   : [])
  const [statusFilter, setStatusFilter]     = useState(initF.statusFilter   ?? [])
  const [priorityFilter, setPriorityFilter] = useState(initF.priorityFilter ?? [])
  const [sourceFilter, setSourceFilter]     = useState(initF.sourceFilter   ?? [])
  const [isOverdue, setIsOverdue]           = useState(initF.isOverdue      ?? false)

  // Column-header filter (docs/018) — client-side over the loaded set
  const [colFilters, setColFilters]     = useState({})
  const [sortColState, setSortColState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null)

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

  // On first mount: handle URL params from header shortcuts
  useEffect(() => {
    if (_urlNew === '1') setShowCreate(true)
    if (_urlNew || _urlSearch) {
      setSearchParams((prev) => {
        prev.delete('new')
        prev.delete('search')
        return prev
      }, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    listUserOptions({ status: 'active' }).then(({ users: u }) => setStaffList(u)).catch(() => {})
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

  // Live sync: reload when any user mutates a task
  useDataSync('data:task', () => {
    setRefreshKey((k) => k + 1)
    setStatsKey((k) => k + 1)
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
      search:      search                  || undefined,
      companyId:   companyFilter.length ? companyFilter : undefined,
      assignedTo:  isAdmin ? (staffFilter.length ? staffFilter : undefined) : (currentUser?.id || undefined),
      dueDateFrom: dueDateFrom             || undefined,
      dueDateTo:   dueDateTo               || undefined,
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
      search:      search              || undefined,
      companyId:   companyFilter.length ? companyFilter : undefined,
      assignedTo:  isAdmin ? (staffFilter.length ? staffFilter : undefined) : (currentUser?.id || undefined),
      status:      statusFilter.length   > 0 ? statusFilter   : undefined,
      priority:    priorityFilter.length > 0 ? priorityFilter : undefined,
      source:      sourceFilter.length   > 0 ? sourceFilter   : undefined,
      isOverdue:   isOverdue      ? true : undefined,
      dueDateFrom: dueDateFrom    || undefined,
      dueDateTo:   dueDateTo      || undefined,
      audience:    'internal',
      // Load the working set once; the list filters/sorts/paginates client-side
      // (column-header filter, docs/018). Board views group this set in memory.
      limit:       500,
      page:        1,
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
  }, [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo, view, sortValue, refreshKey])

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
    setCompanyFilter([]); setStaffFilter([])
    setStatusFilter([]); setPriorityFilter([])
    setSourceFilter([]); setIsOverdue(false)
    setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH)
    setDueDateFrom(INIT_DATES.from)
    setDueDateTo(INIT_DATES.to)
    setSortValue('created_at:desc')
    setColFilters({}); setSortColState({ col: null, dir: 'asc' })
    setView('list'); setPageSize(20)
    setPage(1)
    try { sessionStorage.removeItem(FILTER_KEY) } catch (_) { /* ignore storage errors */ }
  }

  // ── Column-header filter: helpers + handlers (docs/018) ───────────────────────
  const colDisplayLabel = useMemo(() => (row, colKey) => {
    switch (colKey) {
      case 'companyName':    return row.companyName || '(Không có)'
      case 'assignedToName': return row.assignedToName || '(Chưa giao)'
      case 'status':         return getLabel('task_status', row.status, STATUS_LABELS[row.status] ?? row.status)
      case 'priority':       return getLabel('task_priority', row.priority, PRIORITY_LABELS[row.priority] ?? row.priority)
      default: { const v = row[colKey]; return v != null && v !== '' ? String(v) : '(Trống)' }
    }
  }, [getLabel])

  function hasColFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = taskColFilterType(colKey)
    if (t === 'enum')        return f instanceof Set && f.size > 0
    if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
    if (t === 'dateRange')   return Boolean(f.from || f.to)
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length
  const hasColSort = sortColState.col !== null

  function openColFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) { setFilterPopup(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
  }
  function handleColFilterChange(colKey, val) {
    setColFilters((prev) => { const n = { ...prev }; if (val == null) delete n[colKey]; else n[colKey] = val; return n }); setPage(1)
  }
  function handleColSort(col, dir) { setSortColState({ col, dir }); setFilterPopup(null) }

  // Client-side filter + sort over the loaded working set
  const displayed = useMemo(() => {
    let result = [...tasks]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const ft = taskColFilterType(colKey)
      if (ft === 'enum') {
        if (fv instanceof Set && fv.size > 0) result = result.filter((r) => fv.has(colDisplayLabel(r, colKey)))
      } else if (ft === 'text') {
        if (typeof fv === 'string' && fv.trim()) {
          const q = fv.toLowerCase()
          result = result.filter((r) => colDisplayLabel(r, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'dateRange') {
        if (fv && (fv.from || fv.to)) {
          result = result.filter((r) => {
            const raw = taskColRawDate(r, colKey); if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (fv.from && d < fv.from) return false
            if (fv.to   && d > fv.to)   return false
            return true
          })
        }
      } else if (ft === 'numberRange') {
        if (fv && (fv.min !== '' || fv.max !== '')) {
          result = result.filter((r) => {
            const num = taskColRawNumber(r, colKey)
            if (num == null || isNaN(num)) return false
            if (fv.min !== '' && num < parseFloat(fv.min)) return false
            if (fv.max !== '' && num > parseFloat(fv.max)) return false
            return true
          })
        }
      }
    }
    if (sortColState.col) {
      result.sort((a, b) => {
        const ak = taskColSortKey(a, sortColState.col)
        const bk = taskColSortKey(b, sortColState.col)
        if (typeof ak === 'number' && typeof bk === 'number') return sortColState.dir === 'asc' ? ak - bk : bk - ak
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortColState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [tasks, colFilters, sortColState, colDisplayLabel])

  // Client pagination for the list view
  const clientTotalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, clientTotalPages)
  const pageRows = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)
  const clientPagination = { total: displayed.length, totalPages: clientTotalPages, page: safePage }

  // Source options for the Kanban-by-source view
  const sourceOptions = getOptions('task_source').length > 0
    ? getOptions('task_source')
    : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]

  async function handleSourceChange(task, newSource) {
    const prev = task.source
    setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, source: newSource } : t)))
    try {
      await tasksApi.updateTask(task.id, { source: newSource })
      addToast('Đã chuyển nguồn công việc', 'success')
    } catch (err) {
      setTasks((p) => p.map((t) => (t.id === task.id ? { ...t, source: prev } : t)))
      addToast(err.response?.data?.error?.message ?? 'Không thể chuyển nguồn', 'error')
    }
  }

  const activeFilterCount = [search].filter(Boolean).length
    + companyFilter.length + staffFilter.length
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
    setSelectedIds(checked ? new Set(pageRows.map((t) => t.id)) : new Set())
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
              <button className={`${s.viewBtn} ${view === 'board_source' ? s.viewBtnActive : ''}`} onClick={() => setView('board_source')}>
                <Layers size={13} /> Kanban nguồn
              </button>
            </div>

            <button
              className={`${s.fullscreenBtn} ${isFullscreen ? s.fullscreenActive : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

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
              <FilterDateField
                value={dueDateFrom}
                onChange={(e) => { setDueDateFrom(e.target.value); setPage(1) }}
              />
            </div>

            {/* ĐẾN NGÀY */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Đến ngày</label>
              <FilterDateField
                value={dueDateTo}
                onChange={(e) => { setDueDateTo(e.target.value); setPage(1) }}
              />
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
              <div className={s.filterSearchWrap}>
                <Search size={12} className={s.filterSearchIcon} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className={`${s.filterInput} ${s.filterInputWithIcon}`}
                  placeholder="Tiêu đề công việc..."
                />
              </div>
            </div>

            {/* KHÁCH HÀNG */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Khách hàng</label>
              <FilterCompanyMultiPicker
                companies={companies}
                value={companyFilter}
                onChange={(v) => { setCompanyFilter(v); setPage(1) }}
              />
            </div>

            {/* NHÂN VIÊN — admin only */}
            {isAdmin && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Nhân viên</label>
                <MultiSelect
                  placeholder="Tất cả"
                  options={staffList.map((u) => ({ key: u.id, label: u.name }))}
                  selected={staffFilter}
                  onChange={(v) => { setStaffFilter(v); setPage(1) }}
                />
              </div>
            )}

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

          {/* ── Active filter chips ── */}
          {(yearFilter || monthFilter || staffFilter.length > 0 || companyFilter.length > 0 || statusFilter.length > 0 || priorityFilter.length > 0 || sourceFilter.length > 0 || isOverdue || search) && (
            <div className={s.filterChipsRow}>
              {(yearFilter || monthFilter) && (
                <span className={s.filterChip}>
                  {monthFilter && yearFilter ? `T${monthFilter}/${yearFilter}` : yearFilter ? `Năm ${yearFilter}` : `T${monthFilter}`}
                  <button className={s.filterChipRemove} onClick={() => { setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH); const { from, to } = yearMonthToDates(CUR_YEAR, CUR_MONTH); setDueDateFrom(from); setDueDateTo(to); setPage(1) }}>×</button>
                </span>
              )}
              {companyFilter.map((cid) => (
                <span key={cid} className={s.filterChip}>
                  KH: {companies.find((c) => c.id === cid)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => { setCompanyFilter((p) => p.filter((x) => x !== cid)); setPage(1) }}>×</button>
                </span>
              ))}
              {isAdmin && staffFilter.map((sid) => (
                <span key={sid} className={s.filterChip}>
                  NV: {staffList.find((u) => u.id === sid)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => { setStaffFilter((p) => p.filter((x) => x !== sid)); setPage(1) }}>×</button>
                </span>
              ))}
              {statusFilter.map((st) => (
                <span key={st} className={s.filterChip}>
                  {getLabel('task_status', st, STATUS_LABELS[st])}
                  <button className={s.filterChipRemove} onClick={() => { setStatusFilter((prev) => prev.filter((x) => x !== st)); setPage(1) }}>×</button>
                </span>
              ))}
              {priorityFilter.map((pr) => (
                <span key={pr} className={s.filterChip}>
                  {getLabel('task_priority', pr, PRIORITY_LABELS[pr])}
                  <button className={s.filterChipRemove} onClick={() => { setPriorityFilter((prev) => prev.filter((x) => x !== pr)); setPage(1) }}>×</button>
                </span>
              ))}
              {sourceFilter.map((src) => (
                <span key={src} className={s.filterChip}>
                  {getLabel('task_source', src, src === 'auto' ? 'Tự động' : 'Thủ công')}
                  <button className={s.filterChipRemove} onClick={() => { setSourceFilter((prev) => prev.filter((x) => x !== src)); setPage(1) }}>×</button>
                </span>
              ))}
              {isOverdue && (
                <span className={`${s.filterChip} ${s.filterChipDanger}`}>
                  Quá hạn
                  <button className={s.filterChipRemove} onClick={() => { setIsOverdue(false); setPage(1) }}>×</button>
                </span>
              )}
              {search && (
                <span className={s.filterChip}>
                  &ldquo;{search}&rdquo;
                  <button className={s.filterChipRemove} onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}>×</button>
                </span>
              )}
            </div>
          )}

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
            <button
              className={`${s.btnGhost} ${s.btnDangerText}`}
              onClick={() => setShowBulkDelete(true)}
            >
              <Trash2 size={13} /> Xóa đã chọn
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
            tasks={pageRows}
            loading={loading}
            pagination={clientPagination}
            page={safePage}
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
            sortColState={sortColState}
            hasColFilter={hasColFilter}
            onOpenColFilter={openColFilter}
            colFilterCount={colFilterCount}
            hasColSort={hasColSort}
          />
        )}

        {/* Column-header filter dropdown (docs/018) — position:fixed, outside table */}
        {filterPopup && view === 'list' && (
          <ColumnFilterDropdown
            colKey={filterPopup.colKey}
            filterType={taskColFilterType(filterPopup.colKey)}
            allRows={tasks}
            getDisplayLabel={colDisplayLabel}
            currentFilter={colFilters[filterPopup.colKey] ?? null}
            sortState={sortColState}
            onSort={handleColSort}
            onFilterChange={handleColFilterChange}
            onClose={() => setFilterPopup(null)}
            style={{ '--cfd-top': `${filterPopup.top}px`, '--cfd-left': `${filterPopup.left}px` }}
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

        {view === 'board_source' && !loading && (
          <SourceBoardView
            tasks={tasks}
            sourceOptions={sourceOptions}
            onSourceChange={handleSourceChange}
            onOpen={openTask}
            onQuickView={setQuickViewId}
            isAdmin={isAdmin}
            onDelete={setDeleteTarget}
            getLabel={getLabel}
          />
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
