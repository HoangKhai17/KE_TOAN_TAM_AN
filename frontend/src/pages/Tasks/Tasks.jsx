import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import {
  Plus, Search, RotateCcw, List, Columns, Layers,
  ChevronRight, ChevronDown, Filter, ClipboardList, Check,
  Trash2, Loader2, X, Eye, ArrowUpRight, Maximize2, Minimize2, SlidersHorizontal, FileDown,
} from 'lucide-react'
import { vi } from 'date-fns/locale'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as tasksApi from '../../api/tasks'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useCompanyOptions, useStaffOptions } from '../../hooks/useReferenceData'
import TaskFormModal from './TaskFormModal'
import TaskQuickView from './TaskQuickView'
import PeriodPicker from './PeriodPicker'
import Modal from '../../components/ui/Modal'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import {
  TASK_STATUSES, STATUS_LABELS, STATUS_TRANSITIONS, STATUS_CSS,
  PRIORITY_LABELS, PRIORITY_CSS, SOURCE_LABELS,
  isTaskOverdue, fmtDate, progressPct,
  completionKind, taskStatusLabel, canEditDueDate, dateLockReason,
  calcDays, calcPlannedDays,
} from './taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import { useDataSync } from '../../hooks/useDataSync'
import useScrollRestore from '../../hooks/useScrollRestore'
import s from './tasks.module.css'

// ── Sort options ──────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  // Mặc định: gom theo việc CẦN XỬ LÝ TRƯỚC — trễ hạn lên đầu, đã xong xuống cuối.
  // Trong cùng một nhóm thì hạn gần nhất lên trước.
  { value: 'work_priority:asc', label: 'Ưu tiên xử lý (mặc định)' },
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

const STATUS_SELECT_CLASS = {
  pending: s.qeStatusPending,
  in_progress: s.qeStatusInProgress,
  on_hold: s.qeStatusOnHold,
  pending_review: s.qeStatusPendingReview,
  needs_revision: s.qeStatusNeedsRevision,
  completed: s.qeStatusCompleted,
}

// Màu con số ở hàng thống kê — chỉ là style, nhãn luôn lấy từ enum task_status
const STAT_VALUE_CLASS = {
  in_progress: s.statOrange,
  pending_review: s.statPurple,
  needs_revision: s.statRed,
  completed: s.statGreen,
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

// ── Board card inner ──────────────────────────────────────────────────────────

function BoardCardInner({ task, isAdmin, onDelete, onQuickView }) {
  const pct     = progressPct(task)
  const overdue = isTaskOverdue(task)
  const startShort = task.startDate ? fmtDate(task.startDate).slice(0, 5) : null
  const endShort   = task.dueDate   ? fmtDate(task.dueDate).slice(0, 5)   : null
  const company = task.companyShortName || task.companyName
  return (
    <>
      {/* Hàng tiêu đề + icon thao tác (hover) ngang hàng title → card gọn hơn */}
      <div className={s.boardCardHead}>
        <div className={s.boardCardTitle}>{task.title}</div>
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
      </div>
      {company && <div className={s.boardCardCompany}>{company}</div>}
      {/* Hàng: mức độ + nhân sự phụ trách + ngày (gọn 1 dòng để rút height) */}
      <div className={s.boardCardMeta}>
        <PriorityBadge priority={task.priority} />
        {completionKind(task) && (
          <span className={`${s.boardCompBadge} ${completionKind(task) === 'late' ? s.boardCompLate : s.boardCompOnTime}`}>
            {completionKind(task) === 'late' ? 'Trễ hạn' : 'Trước hạn'}
          </span>
        )}
        {task.assignedToName && <span className={s.boardCardAssigneeName}>{task.assignedToName}</span>}
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
    </>
  )
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

function DraggableCard({ task, isAdmin, onDelete, onQuickView }) {
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
      onClick={() => !isDragging && onQuickView(task.id)}
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
  companyShort:   'text',
  startDate:      'dateRange',
  dueDate:        'dateRange',
  days:           'numberRange',
  plannedDays:    'numberRange',
  source:         'enum',
  createdAt:      'dateRange',
  status:         'enum',
  priority:       'enum',
  progress:       'numberRange',
  assignedToName: 'enum',
  latestComment:  'text',
}
function taskColFilterType(colKey) { return TASK_LIST_COL_TYPE[colKey] ?? 'text' }

// Danh mục cột danh sách (thứ tự hiển thị + nhãn) — dùng cho render, bộ chọn cột, skeleton.
// fixed: luôn hiện (không cho tắt).
const TASK_COLUMNS = [
  { key: 'title',          label: 'Tiêu đề',            fixed: true },
  { key: 'companyShort',   label: 'Tên viết tắt' },
  { key: 'startDate',      label: 'Ngày bắt đầu' },
  { key: 'dueDate',        label: 'Hết hạn' },
  { key: 'days',           label: 'Ngày HT' },
  { key: 'plannedDays',    label: 'Ngày KH' },
  { key: 'source',         label: 'Nguồn tạo' },
  { key: 'createdAt',      label: 'Ngày tạo' },
  { key: 'status',         label: 'Trạng thái' },
  { key: 'priority',       label: 'Ưu tiên' },
  { key: 'progress',       label: 'Tiến độ' },
  { key: 'assignedToName', label: 'Giao cho' },
  { key: 'latestComment',  label: 'Bình luận mới' },
]

const TASK_COLS_KEY = 'tasks_hidden_cols_v1'
function loadHiddenCols() {
  try { const a = JSON.parse(sessionStorage.getItem(TASK_COLS_KEY)); return new Set(Array.isArray(a) ? a : []) }
  catch { return new Set() }
}
function saveHiddenCols(set) {
  try { sessionStorage.setItem(TASK_COLS_KEY, JSON.stringify([...set])) } catch { /* ignore */ }
}

// Raw value used for date/number filtering (must mirror what the column shows)
function taskColRawDate(t, colKey) {
  if (colKey === 'startDate') return t.startDate || t.createdAt
  if (colKey === 'createdAt')  return t.createdAt
  return t.dueDate
}
function taskColRawNumber(t, colKey) {
  if (colKey === 'days')        return calcDays(t)
  if (colKey === 'plannedDays') return calcPlannedDays(t)
  return progressPct(t)
}

function taskColSortKey(t, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_RANK[t.status] ?? 99
    case 'priority':       return PRIORITY_RANK[t.priority] ?? 99
    case 'days':           { const d = calcDays(t);    return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'plannedDays':    { const d = calcPlannedDays(t); return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'progress':       { const p = progressPct(t); return p == null ? -1 : p }
    case 'startDate':      return t.startDate || t.createdAt || ''
    case 'dueDate':        return t.dueDate || ''
    case 'createdAt':      return t.createdAt || ''
    case 'companyShort':   return (t.companyShortName || t.companyName || '').toLowerCase()
    case 'source':         return t.source || ''
    case 'latestComment':  return (t.latestComment || '').toLowerCase()
    case 'companyName':    return (t.companyName || '').toLowerCase()
    case 'assignedToName': return (t.assignedToName || '').toLowerCase()
    default:               return (t.title || '').toLowerCase()
  }
}

// ── SourceBoardView — Kanban theo Nguồn công việc (drag để đổi nguồn) ────────────

function DraggableSourceCard({ task, isAdmin, onDelete, onQuickView }) {
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
      onClick={() => !isDragging && onQuickView(task.id)}
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
  hiddenCols,
}) {
  const getLabel    = useEnumsStore((st) => st.getLabel)
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id))
  const vis = (key) => !hiddenCols?.has(key)
  const visibleDataCols = TASK_COLUMNS.filter((c) => c.fixed || vis(c.key)).length
  const colSpanAll = visibleDataCols + 2   // + checkbox + actions

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
      {/* data-scroll-x: mốc ổn định để useScrollRestore nhớ vị trí cuộn NGANG của bảng */}
      <div className={s.tableScrollX} data-scroll-x="tasks">
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
              <Th colKey="title">Tiêu đề</Th>
              {vis('companyShort') && <Th colKey="companyShort">Tên viết tắt</Th>}
              {vis('startDate')    && <Th colKey="startDate">Ngày bắt đầu</Th>}
              {vis('dueDate')      && <Th colKey="dueDate">Hết hạn</Th>}
              {vis('days')         && <Th colKey="days">Ngày HT</Th>}
              {vis('plannedDays')  && <Th colKey="plannedDays">Ngày KH</Th>}
              {vis('source')       && <Th colKey="source">Nguồn tạo</Th>}
              {vis('createdAt')    && <Th colKey="createdAt">Ngày tạo</Th>}
              {vis('status')       && <Th colKey="status">Trạng thái</Th>}
              {vis('priority')     && <Th colKey="priority">Ưu tiên</Th>}
              {vis('progress')     && <Th colKey="progress">Tiến độ</Th>}
              {vis('assignedToName') && <Th colKey="assignedToName">Giao cho</Th>}
              {vis('latestComment') && <Th colKey="latestComment">Bình luận mới</Th>}
              <th className={`${s.th} ${s.thAction}`}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  {Array.from({ length: visibleDataCols }).map((_, j) => (
                    <td key={j} className={s.td}>
                      <div className={s.tableSkeletonBar} style={{ '--skeleton-w': `${j === 0 ? 220 : 80}px` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={colSpanAll}>
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
              const planned = calcPlannedDays(t)
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
                  {/* Tiêu đề (không còn tên KH bên dưới) */}
                  <td className={s.td}>
                    <div className={`${s.taskTitle} ${overdue ? s.taskTitleOverdue : ''}`}>{t.title}</div>
                  </td>

                  {/* Tên viết tắt (thiếu thì lấy tên công ty) */}
                  {vis('companyShort') && (
                    <td className={s.td}>
                      {(t.companyShortName || t.companyName)
                        ? <span className={s.taskMeta}>{t.companyShortName || t.companyName}</span>
                        : <span className={s.mutedDash}>—</span>}
                    </td>
                  )}

                  {/* Ngày bắt đầu */}
                  {vis('startDate') && (
                    <td className={s.td}>
                      <span className={s.dueDateNormal}>{fmtDate(t.startDate || t.createdAt)}</span>
                    </td>
                  )}

                  {/* Hết hạn — staff chỉ sửa được với task từ lịch định kỳ; nguồn khác chỉ admin */}
                  {vis('dueDate') && (
                    <td className={s.td} onClick={(e) => e.stopPropagation()}>
                      {canEditDueDate(t, isAdmin) ? (
                        <ListDateField
                          value={t.dueDate ?? ''}
                          onChange={(e) => onDueDateChange(t, e.target.value)}
                          isOverdue={overdue}
                        />
                      ) : (
                        <span className={s.dueDateNormal} title="Chỉ Quản trị viên được sửa (công việc này không phải từ lịch định kỳ)">
                          {t.dueDate ? fmtDate(t.dueDate) : '—'}
                        </span>
                      )}
                    </td>
                  )}

                  {/* Số ngày hoàn thành (thực tế) */}
                  {vis('days') && (
                    <td className={s.td}>
                      {days !== null ? (
                        <span className={`${s.daysBadge} ${t.status === 'completed' ? s.daysBadgeDone : ''}`}>
                          {days}d
                        </span>
                      ) : <span className={s.mutedDash}>—</span>}
                    </td>
                  )}

                  {/* Số ngày kế hoạch (hết hạn − bắt đầu) */}
                  {vis('plannedDays') && (
                    <td className={s.td}>
                      {planned !== null ? (
                        <span className={`${s.daysBadge} ${s.daysBadgePlan}`}>{planned}d</span>
                      ) : <span className={s.mutedDash}>—</span>}
                    </td>
                  )}

                  {/* Nguồn tạo */}
                  {vis('source') && (
                    <td className={s.td}>
                      <span className={s.taskMeta}>{getLabel('task_source', t.source, t.source === 'auto' ? 'Tự động' : 'Thủ công')}</span>
                    </td>
                  )}

                  {/* Ngày tạo (hệ thống tự lấy) */}
                  {vis('createdAt') && (
                    <td className={s.td}>
                      <span className={s.dueDateNormal}>{fmtDate(t.createdAt)}</span>
                    </td>
                  )}

                  {/* Quick edit: status */}
                  {vis('status') && (
                    <td className={s.td} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={t.status}
                        onChange={(e) => { if (e.target.value !== t.status) onStatusChange(t, e.target.value) }}
                        className={`${s.qeSelect} ${s.qeSelectStyled} ${(t.status === 'completed' && completionKind(t) === 'late') ? s.qeStatusCompletedLate : (STATUS_SELECT_CLASS[t.status] ?? '')}`}
                        title="Đổi trạng thái"
                      >
                        <option value={t.status}>
                          {taskStatusLabel(t, getLabel)}
                        </option>
                        {(STATUS_TRANSITIONS[t.status] ?? []).map((st) => (
                          <option key={st} value={st}>
                            {getLabel('task_status', st, STATUS_LABELS[st])}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}

                  {/* Quick edit: priority */}
                  {vis('priority') && (
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
                  )}

                  {/* Tiến độ */}
                  {vis('progress') && (
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
                  )}

                  {/* Giao cho */}
                  {vis('assignedToName') && (
                    <td className={s.td}>
                      {t.assignedToName ? (
                        <div className={s.assignedCell}>
                          <div className={s.avatarXs}>{t.assignedToName[0]?.toUpperCase()}</div>
                          <span>{t.assignedToName}</span>
                          {t.collaborators?.length > 0 && (
                            <span
                              title={`Hỗ trợ: ${t.collaborators.map((c) => c.name).join(', ')}`}
                              style={{ marginLeft: 4, padding: '0 6px', borderRadius: 10, fontSize: 11,
                                       background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', whiteSpace: 'nowrap' }}
                            >
                              +{t.collaborators.length} hỗ trợ
                            </span>
                          )}
                        </div>
                      ) : t.collaborators?.length > 0 ? (
                        <span
                          title={`Hỗ trợ: ${t.collaborators.map((c) => c.name).join(', ')}`}
                          style={{ padding: '0 6px', borderRadius: 10, fontSize: 11,
                                   background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', whiteSpace: 'nowrap' }}
                        >
                          +{t.collaborators.length} hỗ trợ
                        </span>
                      ) : (
                        <span className={s.mutedDash}>—</span>
                      )}
                    </td>
                  )}

                  {/* Bình luận mới nhất */}
                  {vis('latestComment') && (
                    <td className={s.td}>
                      {t.latestComment ? (
                        <div className={s.latestCommentCell} title={`${t.latestCommentBy ?? ''}: ${t.latestComment}`}>
                          {t.latestCommentBy && <span className={s.latestCommentBy}>{t.latestCommentBy}:</span>}
                          <span className={s.latestCommentText}>{t.latestComment}</span>
                        </div>
                      ) : (
                        <span className={s.mutedDash}>—</span>
                      )}
                    </td>
                  )}

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
                      {/* Chỉ admin mới thấy nút xoá (onDelete = null với nhân viên) */}
                      {onDelete && (
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

// Nâng lên v2 khi ĐỔI MẶC ĐỊNH sắp xếp (sang 'Ưu tiên xử lý'). Phiên cũ đã lưu
// 'created_at:desc' trong sessionStorage nên nếu giữ nguyên khoá thì người dùng
// sẽ không bao giờ thấy mặc định mới — cứ tưởng thay đổi không có tác dụng.
const FILTER_KEY = 'tasks_filter_v2'

function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) ?? {} }
  catch { return {} }
}
function saveFilters(obj) {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(obj)) } catch (_) { /* ignore storage errors */ }
}

// Bộ lọc header cột: enum là Set (không JSON hoá được) → chuyển Set↔Array khi lưu/khôi phục
function serializeColFilters(cf) {
  const out = {}
  for (const [k, v] of Object.entries(cf || {})) out[k] = v instanceof Set ? [...v] : v
  return out
}
function deserializeColFilters(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = (taskColFilterType(k) === 'enum' && Array.isArray(v)) ? new Set(v) : v
  }
  return out
}

export default function Tasks() {
  const navigate      = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
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
  const [sortValue, setSortValue] = useState(initF.sortValue ?? 'work_priority:asc')

  // Other filters (status/priority/source are multi-select arrays)
  const [searchInput, setSearchInput]       = useState(initF.searchInput    ?? '')
  const [search, setSearch]                 = useState(initF.searchInput    ?? '')
  const [companyFilter, setCompanyFilter]   = useState(() => Array.isArray(initF.companyFilter) ? initF.companyFilter : [])
  const [staffFilter, setStaffFilter]       = useState(() => Array.isArray(initF.staffFilter)   ? initF.staffFilter   : [])
  const [creatorFilter, setCreatorFilter]   = useState(() => Array.isArray(initF.creatorFilter) ? initF.creatorFilter : [])
  // "CV hỗ trợ": mảng userId là NGƯỜI HỖ TRỢ. Admin = multi-select nhân viên; nhân viên = chính mình (toggle).
  const [supportFilter, setSupportFilter]   = useState(() => Array.isArray(initF.supportFilter) ? initF.supportFilter : [])
  const [statusFilter, setStatusFilter]     = useState(initF.statusFilter   ?? [])
  const [priorityFilter, setPriorityFilter] = useState(initF.priorityFilter ?? [])
  const [sourceFilter, setSourceFilter]     = useState(initF.sourceFilter   ?? [])
  const [isOverdue, setIsOverdue]           = useState(initF.isOverdue      ?? false)
  const [scheduleToday, setScheduleToday]   = useState(initF.scheduleToday  ?? false)

  // Column-header filter (docs/018) — client-side over the loaded set. Khôi phục từ sessionStorage.
  const [colFilters, setColFilters]     = useState(() => deserializeColFilters(initF.colFilters))
  const [sortColState, setSortColState] = useState(initF.sortColState ?? { col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null)

  // Ẩn/hiện cột — lưu sessionStorage (giữ sau F5)
  const [hiddenCols, setHiddenCols] = useState(loadHiddenCols)
  useEffect(() => { saveHiddenCols(hiddenCols) }, [hiddenCols])

  // Thu gọn / mở panel bộ lọc — lưu sessionStorage
  const [filterCollapsed, setFilterCollapsed] = useState(initF.filterCollapsed ?? false)
  function toggleColVisible(key) {
    setHiddenCols((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef(null)
  useEffect(() => {
    if (!showColMenu) return
    function onDoc(e) { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showColMenu])

  // Stats (counts across base filters, ignoring status/priority/isOverdue)
  const [stats, setStats] = useState({
    total: 0, pending: 0, in_progress: 0, on_hold: 0,
    pending_review: 0, needs_revision: 0, completed: 0,
  })
  const [statsKey, setStatsKey] = useState(0)  // increment to force stats refresh


  // Pagination
  const [pageSize, setPageSize] = useState(initF.pageSize ?? 20)
  const [page, setPage]         = useState(() => (Number.isInteger(initF.page) && initF.page > 0 ? initF.page : 1))

  // Data (local mirror — được sync từ React Query để optimistic update vẫn hoạt động)
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })

  // Reference data (React Query — cache + gộp request dùng chung giữa các trang)
  const { data: companies = [] } = useCompanyOptions()
  const { data: staffList = [] } = useStaffOptions({ enabled: isAdmin })
  const [availableYears, setAvailableYears] = useState([])

  // Modals
  const [showCreate, setShowCreate]         = useState(false)
  const [showExport, setShowExport]         = useState(false)
  const [onHoldTarget, setOnHoldTarget]     = useState(null)
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

  // Debounce search → về trang 1. So sánh GIÁ TRỊ (không dùng cờ "lần đầu") để mount
  // không làm mất trang vừa khôi phục, và an toàn với StrictMode (dev chạy effect 2 lần).
  const appliedSearchRef = useRef(search) // `search` đã init sẵn từ sessionStorage
  useEffect(() => {
    if (searchInput === appliedSearchRef.current) return
    const t = setTimeout(() => {
      appliedSearchRef.current = searchInput
      setSearch(searchInput)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Đổi bộ lọc → về trang 1 (cũng so sánh giá trị, không dùng cờ "lần đầu").
  const filterKey = JSON.stringify([
    statusFilter, priorityFilter, sourceFilter, isOverdue, dueDateFrom, dueDateTo,
    pageSize, companyFilter, staffFilter, creatorFilter, supportFilter, sortValue,
  ])
  const appliedFilterKeyRef = useRef(filterKey)
  useEffect(() => {
    if (filterKey === appliedFilterKeyRef.current) return
    appliedFilterKeyRef.current = filterKey
    setPage(1)
  }, [filterKey])

  // Load enums + years (companies/staff đã chuyển sang React Query hooks)
  useEffect(() => {
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
        queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] })
        setStatsKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [queryClient])

  // Live sync: reload when any user mutates a task
  useDataSync('data:task', () => {
    queryClient.invalidateQueries({ queryKey: ['tasks', 'list'] })
    setStatsKey((k) => k + 1)
  }, [])

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    saveFilters({
      view, yearFilter, monthFilter, dueDateFrom, dueDateTo,
      sortValue, searchInput, companyFilter, staffFilter, creatorFilter, supportFilter,
      statusFilter, priorityFilter, sourceFilter, isOverdue, scheduleToday, pageSize, page,
      colFilters: serializeColFilters(colFilters), sortColState, filterCollapsed,
    })
  }, [view, yearFilter, monthFilter, dueDateFrom, dueDateTo, sortValue, searchInput, companyFilter, staffFilter, creatorFilter, supportFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, scheduleToday, pageSize, page, colFilters, sortColState, filterCollapsed])

  // Load stats (always uses base date/company/staff filters, no status filter)
  useEffect(() => {
    let cancelled = false
    const base = {
      search:      search                  || undefined,
      companyId:   companyFilter.length ? companyFilter : undefined,
      // Staff: KHÔNG ép assignedTo — backend tự giới hạn phạm vi (việc được giao HOẶC
      // việc thuộc công ty mình phụ trách). Ép assignedTo sẽ che mất việc đã nhờ đồng nghiệp hỗ trợ.
      assignedTo:  isAdmin ? (staffFilter.length ? staffFilter : undefined) : undefined,
      createdBy:   creatorFilter.length ? creatorFilter : undefined,
      collaboratorIds: supportFilter.length ? supportFilter : undefined,
      scheduleToday: scheduleToday ? true : undefined,
      dueDateFrom: scheduleToday ? undefined : (dueDateFrom || undefined),
      dueDateTo:   scheduleToday ? undefined : (dueDateTo   || undefined),
      limit: 1, page: 1,
    }
    const statusKeys = TASK_STATUSES
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
  }, [search, companyFilter, staffFilter, creatorFilter, supportFilter, dueDateFrom, dueDateTo, scheduleToday, statsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tasks list — React Query (cache theo bộ lọc + dedup + giữ data cũ khi đổi filter) ──
  // Tải "working set" (tối đa 500) rồi lọc/sắp/phân trang phía client (docs/018).
  const listParams = useMemo(() => {
    const [sortBy, sortDir] = sortValue.split(':')
    return {
      search:      search              || undefined,
      companyId:   companyFilter.length ? companyFilter : undefined,
      // Staff: KHÔNG ép assignedTo — backend tự giới hạn phạm vi (việc được giao HOẶC
      // việc thuộc công ty mình phụ trách). Ép assignedTo sẽ che mất việc đã nhờ đồng nghiệp hỗ trợ.
      assignedTo:  isAdmin ? (staffFilter.length ? staffFilter : undefined) : undefined,
      createdBy:   creatorFilter.length ? creatorFilter : undefined,
      collaboratorIds: supportFilter.length ? supportFilter : undefined,
      status:      statusFilter.length   > 0 ? statusFilter   : undefined,
      priority:    priorityFilter.length > 0 ? priorityFilter : undefined,
      source:      sourceFilter.length   > 0 ? sourceFilter   : undefined,
      isOverdue:     scheduleToday ? undefined : (isOverdue ? true : undefined),
      scheduleToday: scheduleToday ? true : undefined,
      // "Hôm nay" cần cả việc quá hạn từ trước → bỏ giới hạn khoảng ngày (tháng)
      dueDateFrom:   scheduleToday ? undefined : (dueDateFrom || undefined),
      dueDateTo:     scheduleToday ? undefined : (dueDateTo   || undefined),
      audience:    'internal',
      limit:       500,
      page:        1,
      sortBy,
      sortDir,
    }
  }, [search, companyFilter, staffFilter, creatorFilter, supportFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, scheduleToday, dueDateFrom, dueDateTo, sortValue, isAdmin, currentUser?.id])

  const listQuery = useQuery({
    queryKey: ['tasks', 'list', listParams],
    queryFn: () => tasksApi.listTasks(listParams),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const loading = listQuery.isFetching

  // Nhớ & khôi phục vị trí cuộn: vào detail rồi back, hoặc đổi menu rồi quay lại, đều về đúng chỗ.
  // ready = ĐÃ CÓ DÒNG THẬT trên bảng (không phải chỉ "có data"), vì bảng render từ state `tasks`
  // — nếu khôi phục lúc bảng còn rỗng thì scrollTop bị kẹp về 0.
  const rowsReady = tasks.length > 0
  useScrollRestore('tasks', { ready: rowsReady })                       // cuộn dọc (khung .appMain)
  useScrollRestore('tasks:x', {                                          // cuộn ngang (bảng nhiều cột)
    ready: rowsReady,
    getEl: () => document.querySelector('[data-scroll-x="tasks"]'),
  })

  // Sync kết quả query → local state (để optimistic update qua setTasks vẫn hoạt động)
  useEffect(() => {
    if (!listQuery.data) return
    const { tasks: t, pagination: p } = listQuery.data
    setTasks(t)
    setPagination(p ?? { page: 1, totalPages: 1, total: t.length })
    setSelectedIds(new Set())
  }, [listQuery.data])

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

  // Đặt "Kỳ" trọn gói (năm + tháng + khoảng ngày dẫn xuất) trong 1 lần
  function setPeriod(year, month) {
    setYearFilter(year)
    setMonthFilter(month)
    const { from, to } = yearMonthToDates(year, month)
    setDueDateFrom(from)
    setDueDateTo(to)
    setPage(1)
  }

  function applyPeriodPreset(key) {
    if (key === 'tm')  return setPeriod(CUR_YEAR, CUR_MONTH)
    if (key === 'ty')  return setPeriod(CUR_YEAR, '')
    if (key === 'all') return setPeriod('', '')
    if (key === 'lm') {           // tháng trước
      let y = parseInt(CUR_YEAR, 10)
      let m = parseInt(CUR_MONTH, 10) - 1
      if (m < 1) { m = 12; y -= 1 }
      return setPeriod(String(y), String(m))
    }
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

      const updated = await tasksApi.changeTaskStatus(task.id, body)
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      setStatsKey((k) => k + 1)
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      setOnHoldTarget(null)
    } catch (err) {
      const status = err.response?.status
      const msg    = err.response?.data?.error?.message
      if (status === 409) {
        // Checklist chưa đủ → chặn hoàn thành (không còn "ép hoàn thành")
        setOnHoldTarget(null)
        addToast(msg ?? 'Còn mục checklist chưa hoàn thành. Vui lòng tích đủ checklist trước khi hoàn thành.', 'error')
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
    setCompanyFilter([]); setStaffFilter([]); setCreatorFilter([]); setSupportFilter([])
    setStatusFilter([]); setPriorityFilter([])
    setSourceFilter([]); setIsOverdue(false); setScheduleToday(false)
    setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH)
    setDueDateFrom(INIT_DATES.from)
    setDueDateTo(INIT_DATES.to)
    setSortValue('work_priority:asc')
    setColFilters({}); setSortColState({ col: null, dir: 'asc' })
    setView('list'); setPageSize(20)
    setPage(1)
    try { sessionStorage.removeItem(FILTER_KEY) } catch (_) { /* ignore storage errors */ }
  }

  // ── Column-header filter: helpers + handlers (docs/018) ───────────────────────
  const colDisplayLabel = useMemo(() => (row, colKey) => {
    switch (colKey) {
      case 'companyName':    return row.companyName || '(Không có)'
      case 'companyShort':   return row.companyShortName || row.companyName || '(Không có)'
      case 'assignedToName': return row.assignedToName || '(Chưa giao)'
      case 'source':         return getLabel('task_source', row.source, row.source === 'auto' ? 'Tự động' : 'Thủ công')
      case 'latestComment':  return row.latestComment || '(Chưa có)'
      case 'status':         return taskStatusLabel(row, getLabel)
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

  const totalCount = displayed.length

  // Client pagination for the list view
  const clientTotalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, clientTotalPages)
  const pageRows = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)
  const clientPagination = { total: displayed.length, totalPages: clientTotalPages, page: safePage }

  // Trạng thái: 1 nguồn nhãn duy nhất cho cả bộ lọc và hàng thống kê
  const statusOptions = getOptions('task_status').length > 0
    ? getOptions('task_status')
    : TASK_STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k] }))

  // Click vào 1 ô thống kê = bật/tắt trạng thái đó trong bộ lọc "Trạng thái"
  function toggleStatusFilter(key) {
    setStatusFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
    setPage(1)
  }

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
    + companyFilter.length + staffFilter.length + creatorFilter.length
    + (isAdmin ? supportFilter.length : (supportFilter.length ? 1 : 0))
    + statusFilter.length + priorityFilter.length + sourceFilter.length
    + (isOverdue ? 1 : 0) + (scheduleToday ? 1 : 0)

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
    let done = 0, blocked = 0
    for (const id of selectedIds) {
      const task = tasks.find((t) => t.id === id)
      if (!task || task.status === 'completed') continue
      try {
        await tasksApi.changeTaskStatus(id, { status: 'completed' })
        done++
      } catch (err) {
        // 409 = còn checklist chưa đủ (không ép hoàn thành nữa)
        if (err.response?.status === 409) blocked++
      }
    }
    if (done > 0)    addToast(`Đã hoàn thành ${done} công việc`, 'success')
    if (blocked > 0) addToast(`${blocked} công việc chưa tích đủ checklist nên không thể hoàn thành.`, 'error')
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

            {view === 'list' && (
              <div className={s.colMenuWrap} ref={colMenuRef}>
                <button
                  className={`${s.fullscreenBtn} ${showColMenu ? s.fullscreenActive : ''}`}
                  onClick={() => setShowColMenu((v) => !v)}
                  title="Chọn cột hiển thị"
                >
                  <SlidersHorizontal size={14} />
                </button>
                {showColMenu && (
                  <div className={s.colMenu}>
                    <div className={s.colMenuHead}>
                      <span>Cột hiển thị</span>
                      <button className={s.colMenuReset} onClick={() => setHiddenCols(new Set())}>Hiện tất cả</button>
                    </div>
                    {TASK_COLUMNS.map((c) => (
                      <label key={c.key} className={`${s.colMenuItem} ${c.fixed ? s.colMenuItemFixed : ''}`}>
                        <input
                          type="checkbox"
                          checked={c.fixed || !hiddenCols.has(c.key)}
                          disabled={c.fixed}
                          onChange={() => toggleColVisible(c.key)}
                        />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              className={`${s.fullscreenBtn} ${isFullscreen ? s.fullscreenActive : ''}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button className={s.btnSecondary} onClick={() => setShowExport(true)} disabled={!totalCount}>
              <FileDown size={14} /> Xuất Excel
            </button>

            <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Tạo công việc
            </button>
          </div>
        </div>

        {/* ── Unified filter panel (always visible) ── */}
        <div className={s.filterBar}>
          <div className={s.filterBarHead}>
            <button
              className={s.filterCollapseBtn}
              onClick={() => setFilterCollapsed((v) => !v)}
              title={filterCollapsed ? 'Mở bộ lọc' : 'Thu gọn bộ lọc'}
            >
              {filterCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className={s.filterBarTitle}>
                <Filter size={12} />
                Bộ lọc
                {activeFilterCount > 0 && (
                  <span className={s.filterActiveBadge}>{activeFilterCount} đang bật</span>
                )}
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              {/* Toggle nhanh — chuyển từ grid lên header cho gọn */}
              <button
                className={`${s.filterToggle} ${scheduleToday ? s.filterToggleActive : ''}`}
                style={{ height: 28 }}
                onClick={() => { setScheduleToday((p) => !p); setPage(1) }}
                title="Lịch làm việc hôm nay: việc chưa hoàn thành đã bắt đầu (đến hạn hôm nay, quá hạn trước đó, đang trong giai đoạn làm)"
              >
                {scheduleToday ? '✓ ' : ''}Hôm nay
              </button>
              <button
                className={`${s.filterToggle} ${isOverdue ? s.filterToggleActive : ''}`}
                style={{ height: 28 }}
                onClick={() => { setIsOverdue((p) => !p); setPage(1) }}
                disabled={scheduleToday}
                title={scheduleToday ? '"Hôm nay" đã bao gồm việc trễ hạn' : undefined}
              >
                {isOverdue ? '✓ ' : ''}Trễ hạn
              </button>
              <button className={s.filterReset} onClick={resetFilters}>
                <RotateCcw size={11} /> Đặt lại
              </button>
            </div>
          </div>

          {!filterCollapsed && (
          <div className={s.filterGrid}>

            {/* KỲ — gộp Năm + Tháng + Từ ngày + Đến ngày */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Kỳ</label>
              <PeriodPicker
                year={yearFilter}
                month={monthFilter}
                from={dueDateFrom}
                to={dueDateTo}
                availableYears={availableYears}
                disabled={scheduleToday}
                onYear={handleYearChange}
                onMonth={handleMonthChange}
                onFrom={(e) => { setDueDateFrom(e.target.value); setPage(1) }}
                onTo={(e) => { setDueDateTo(e.target.value); setPage(1) }}
                onPreset={applyPeriodPreset}
                disabledTitle="“Hôm nay” không dùng bộ lọc theo kỳ"
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

            {/* NGƯỜI TẠO — vd: admin xem tiến độ những việc chính mình tạo & giao cho nhân viên */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Người tạo</label>
              <MultiSelect
                placeholder="Tất cả"
                options={staffList.map((u) => ({ key: u.id, label: u.name }))}
                selected={creatorFilter}
                onChange={(v) => { setCreatorFilter(v); setPage(1) }}
              />
            </div>

            {/* CV HỖ TRỢ — admin: multi-select nhân viên; nhân viên: toggle "việc mình hỗ trợ" */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>CV hỗ trợ</label>
              {isAdmin ? (
                <MultiSelect
                  placeholder="Tất cả"
                  options={staffList.map((u) => ({ key: u.id, label: u.name }))}
                  selected={supportFilter}
                  onChange={(v) => { setSupportFilter(v); setPage(1) }}
                />
              ) : (
                <button
                  className={`${s.filterToggle} ${supportFilter.length ? s.filterToggleActive : ''}`}
                  onClick={() => { setSupportFilter((p) => (p.length ? [] : [currentUser?.id].filter(Boolean))); setPage(1) }}
                  title="Chỉ hiện công việc mình đang hỗ trợ đồng nghiệp"
                >
                  {supportFilter.length ? '✓ ' : ''}Việc tôi hỗ trợ
                </button>
              )}
            </div>

            {/* TRẠNG THÁI — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Trạng thái</label>
              <MultiSelect
                placeholder="Tất cả trạng thái"
                options={statusOptions}
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

          </div>
          )}

          {/* ── Active filter chips ── */}
          {(yearFilter || monthFilter || staffFilter.length > 0 || creatorFilter.length > 0 || supportFilter.length > 0 || companyFilter.length > 0 || statusFilter.length > 0 || priorityFilter.length > 0 || sourceFilter.length > 0 || isOverdue || scheduleToday || search) && (
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
              {creatorFilter.map((cid) => (
                <span key={`creator-${cid}`} className={s.filterChip}>
                  Tạo bởi: {staffList.find((u) => u.id === cid)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => { setCreatorFilter((p) => p.filter((x) => x !== cid)); setPage(1) }}>×</button>
                </span>
              ))}
              {supportFilter.length > 0 && (
                isAdmin ? supportFilter.map((sid) => (
                  <span key={`support-${sid}`} className={s.filterChip}>
                    Hỗ trợ: {staffList.find((u) => u.id === sid)?.name ?? '?'}
                    <button className={s.filterChipRemove} onClick={() => { setSupportFilter((p) => p.filter((x) => x !== sid)); setPage(1) }}>×</button>
                  </span>
                )) : (
                  <span className={s.filterChip}>
                    Việc tôi hỗ trợ
                    <button className={s.filterChipRemove} onClick={() => { setSupportFilter([]); setPage(1) }}>×</button>
                  </span>
                )
              )}
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
              {scheduleToday && (
                <span className={s.filterChip}>
                  Hôm nay
                  <button className={s.filterChipRemove} onClick={() => { setScheduleToday(false); setPage(1) }}>×</button>
                </span>
              )}
              {isOverdue && (
                <span className={`${s.filterChip} ${s.filterChipDanger}`}>
                  Trễ hạn
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
            {/* Tổng — click để bỏ lọc trạng thái */}
            <button
              type="button"
              className={`${s.statItem} ${statusFilter.length === 0 ? s.statItemActive : ''}`}
              onClick={() => { setStatusFilter([]); setPage(1) }}
              title="Xem tất cả trạng thái"
            >
              <span className={s.statValue}>{stats.total}</span>
              <span className={s.statLabel}>Tổng</span>
            </button>

            {statusOptions.map((opt) => {
              const active = statusFilter.includes(opt.key)
              return (
                <Fragment key={opt.key}>
                  <span className={s.statDivider} />
                  <button
                    type="button"
                    className={`${s.statItem} ${active ? s.statItemActive : ''}`}
                    onClick={() => toggleStatusFilter(opt.key)}
                    title={active ? `Bỏ lọc: ${opt.label}` : `Lọc theo: ${opt.label}`}
                  >
                    <span className={`${s.statValue} ${STAT_VALUE_CLASS[opt.key] ?? ''}`}>
                      {stats[opt.key] ?? 0}
                    </span>
                    <span className={s.statLabel}>
                      {opt.label}
                      {opt.key === 'completed' && stats.total > 0
                        ? ` · ${Math.round((stats.completed ?? 0) / stats.total * 100)}%`
                        : ''}
                    </span>
                  </button>
                </Fragment>
              )
            })}
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
                className={`${s.btnGhost} ${s.btnDangerText}`}
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
            onDelete={isAdmin ? setDeleteTarget : null}
            isAdmin={isAdmin}
            sortColState={sortColState}
            hasColFilter={hasColFilter}
            onOpenColFilter={openColFilter}
            colFilterCount={colFilterCount}
            hasColSort={hasColSort}
            hiddenCols={hiddenCols}
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
            onDelete={isAdmin ? setDeleteTarget : null}
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
            onDelete={isAdmin ? setDeleteTarget : null}
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

      {showExport && (
        <TaskExportModal
          rows={displayed}
          onClose={() => setShowExport(false)}
        />
      )}

      {onHoldTarget && (
        <OnHoldModal
          task={onHoldTarget.task}
          onConfirm={handleStatusChange}
          onClose={() => setOnHoldTarget(null)}
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

// ── TaskExportModal ─────────────────────────────────────────────────────────────
// Sinh dữ liệu bằng CHÍNH các hàm render của bảng (getLabel enum, calcDays…) rồi gửi
// backend chỉ để định dạng → file xuất khớp 100% với bảng, KHÔNG map cứng, KHÔNG lệch.
const EXPORT_COLUMNS = [
  { key: 'title',          label: 'Tiêu đề',            group: 'Cột trong bảng', value: (r) => r.title ?? '' },
  { key: 'companyShort',   label: 'Tên viết tắt',       group: 'Cột trong bảng', value: (r) => r.companyShortName || r.companyName || '' },
  { key: 'startDate',      label: 'Ngày bắt đầu',       group: 'Cột trong bảng', value: (r) => fmtDate(r.startDate || r.createdAt) },
  { key: 'dueDate',        label: 'Hết hạn',            group: 'Cột trong bảng', value: (r) => (r.dueDate ? fmtDate(r.dueDate) : '') },
  { key: 'days',           label: 'Số ngày hoàn thành', group: 'Cột trong bảng', value: (r) => { const d = calcDays(r); return d == null ? '' : d } },
  { key: 'plannedDays',    label: 'Số ngày kế hoạch',   group: 'Cột trong bảng', value: (r) => { const d = calcPlannedDays(r); return d == null ? '' : d } },
  { key: 'source',         label: 'Nguồn tạo',          group: 'Cột trong bảng', value: (r, gl) => gl('task_source', r.source, r.source === 'auto' ? 'Tự động' : 'Thủ công') },
  { key: 'createdAt',      label: 'Ngày tạo',           group: 'Cột trong bảng', value: (r) => fmtDate(r.createdAt) },
  { key: 'status',         label: 'Trạng thái',         group: 'Cột trong bảng', value: (r, gl) => taskStatusLabel(r, gl) },
  { key: 'priority',       label: 'Ưu tiên',            group: 'Cột trong bảng', value: (r, gl) => gl('task_priority', r.priority, PRIORITY_LABELS[r.priority] ?? r.priority) },
  { key: 'progress',       label: 'Tiến độ',            group: 'Cột trong bảng', value: (r) => { const p = progressPct(r); return p != null ? `${p}%` : '' } },
  { key: 'assignedToName', label: 'Giao cho',           group: 'Cột trong bảng', value: (r) => r.assignedToName || '' },
  { key: 'latestComment',  label: 'Bình luận mới nhất', group: 'Cột trong bảng', value: (r) => r.latestComment || '' },
  { key: 'companyName',    label: 'Khách hàng (đầy đủ)', group: 'Thông tin bổ sung', value: (r) => r.companyName || '' },
  { key: 'taskTypeName',   label: 'Loại công việc',      group: 'Thông tin bổ sung', value: (r) => r.taskTypeName || '' },
  { key: 'createdByName',  label: 'Người tạo',           group: 'Thông tin bổ sung', value: (r) => r.createdByName || '' },
  { key: 'completedAt',    label: 'Ngày hoàn thành',     group: 'Thông tin bổ sung', value: (r) => fmtDate(r.completedAt) },
  { key: 'slaDays',        label: 'SLA (ngày)',          group: 'Thông tin bổ sung', value: (r) => r.slaDays ?? '' },
  { key: 'periodLabel',    label: 'Kỳ',                  group: 'Thông tin bổ sung', value: (r) => r.periodLabel || '' },
  { key: 'description',    label: 'Mô tả',               group: 'Thông tin bổ sung', value: (r) => r.description || '' },
]
const EXPORT_GROUPS = ['Cột trong bảng', 'Thông tin bổ sung']

function TaskExportModal({ rows, onClose }) {
  const addToast = useToastStore((st) => st.toast)
  const getLabel = useEnumsStore((st) => st.getLabel)
  const [selected, setSelected]   = useState(() => new Set(EXPORT_COLUMNS.filter((c) => c.group === 'Cột trong bảng').map((c) => c.key)))
  const [exporting, setExporting] = useState(false)
  const total = rows.length

  const groups = EXPORT_GROUPS.map((g) => ({ label: g, fields: EXPORT_COLUMNS.filter((c) => c.group === g) }))
  const isGroupAll = (g) => g.fields.every((f) => selected.has(f.key))
  const toggleGroup = (g) => setSelected((prev) => {
    const next = new Set(prev); const on = g.fields.every((f) => prev.has(f.key))
    g.fields.forEach((f) => (on ? next.delete(f.key) : next.add(f.key))); return next
  })
  const toggleField = (k) => setSelected((prev) => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next
  })

  const selectedCols = EXPORT_COLUMNS.filter((c) => selected.has(c.key))

  async function handleExport() {
    if (!selectedCols.length) { addToast('Vui lòng chọn ít nhất một cột', 'error'); return }
    setExporting(true)
    try {
      const body = {
        sheetName: 'Cong viec',
        columns: selectedCols.map((c) => c.label),
        rows: rows.map((r) => selectedCols.map((c) => { const v = c.value(r, getLabel); return v == null ? '' : v })),
      }
      const blob = await tasksApi.exportTasksExcel(body)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `cong-viec-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(url)
      addToast(`Đã xuất ${total} công việc`, 'success')
      onClose()
    } catch {
      addToast('Xuất Excel thất bại', 'error')
    } finally { setExporting(false) }
  }

  return (
    <Modal title="Xuất Excel — Công việc" onClose={onClose} wide>
      <div className={s.exportModalBody}>
        <div className={s.exportSidebar}>
          <div className={s.exportSidebarTitle}>Chọn cột xuất</div>
          {groups.map((g) => (
            <div key={g.label} className={s.exportGroup}>
              <label className={s.exportGroupLabel}>
                <input type="checkbox" checked={isGroupAll(g)} onChange={() => toggleGroup(g)} />
                <span>{g.label}</span>
              </label>
              {g.fields.map((f) => (
                <label key={f.key} className={s.exportFieldItem}>
                  <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggleField(f.key)} />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className={s.exportPreviewPane}>
          <div className={s.exportPreviewTitle}>Xem trước ({total} công việc)</div>
          <div className={s.exportPreviewWrap}>
            {selectedCols.length === 0 ? (
              <div className={s.exportPreviewEmpty}>Chưa chọn cột nào</div>
            ) : total === 0 ? (
              <div className={s.exportPreviewEmpty}>Không có công việc nào để xuất</div>
            ) : (
              <table className={s.exportPreviewTable}>
                <thead><tr>{selectedCols.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.taskId || r.id}>
                      {selectedCols.map((c) => {
                        const v = c.value(r, getLabel)
                        return <td key={c.key}>{v === '' || v == null ? '—' : String(v)}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className={s.exportFooter}>
        <span className={s.exportCount}>{selectedCols.length} cột · {total} công việc</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={s.btnSecondary} onClick={onClose} disabled={exporting}>Hủy</button>
          <button className={s.btnPrimary} onClick={handleExport} disabled={exporting || !selectedCols.length || total === 0}>
            {exporting ? <><Loader2 size={13} className={s.spinIcon} /> Đang xuất...</> : <><FileDown size={13} /> Xuất Excel</>}
          </button>
        </div>
      </div>
    </Modal>
  )
}
