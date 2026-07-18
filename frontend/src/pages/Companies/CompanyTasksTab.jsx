import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ListTodo, Loader2, Trash2, Plus, Search, RotateCcw, Filter, Eye,
  SlidersHorizontal, ChevronDown, Check, LayoutGrid, List,
} from 'lucide-react'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCenter, useDraggable, useDroppable,
} from '@dnd-kit/core'
import Modal from '../../components/ui/Modal'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as tasksApi from '../../api/tasks'
import TaskFormModal from '../Tasks/TaskFormModal'
import TaskQuickView from '../Tasks/TaskQuickView'
import PeriodPicker from '../Tasks/PeriodPicker'
import {
  TASK_STATUSES,
  STATUS_LABELS, STATUS_CSS, PRIORITY_LABELS, PRIORITY_CSS, SOURCE_LABELS,
  STATUS_TRANSITIONS, isTaskOverdue, fmtDate as fmtTaskDate, progressPct,
  completionKind, taskStatusLabel, canEditDueDate, calcDays, calcPlannedDays,
  resolvePeriodRange, periodRangeLabel,
} from '../Tasks/taskUtils'
import { useEnumsStore } from '../../hooks/useEnums'
import ts from '../Tasks/tasks.module.css'
import s from './companies.module.css'

// ── Tone màu chip trạng thái (chỉ tab Công việc dùng) ─────────────────────────

const COMPANY_TASK_STATUS_TONE = {
  '': s.cTaskStatusAll,
  pending: s.cTaskStatusPending,
  in_progress: s.cTaskStatusProgress,
  on_hold: s.cTaskStatusHold,
  pending_review: s.cTaskStatusReview,
  needs_revision: s.cTaskStatusRevision,
  completed: s.cTaskStatusCompleted,
}

// ── DeleteTaskModal ────────────────────────────────────────────────────────────

function DeleteTaskModal({ task, deleting, onClose, onConfirm }) {
  return (
    <Modal title="Xoá công việc" onClose={onClose}>
      <div className={s.modalForm}>
        <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
          <AlertTriangle size={16} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
          <span className={s.textSmall}>
            Bạn có chắc chắn muốn xoá công việc{' '}
            <strong>&ldquo;{task.title}&rdquo;</strong>?
            Hành động này không thể hoàn tác.
          </span>
        </div>
        <div className={`${s.modalActions} ${s.infoNoteWrap}`}>
          <button onClick={onClose} className={s.btnOutline} disabled={deleting}>Huỷ bỏ</button>
          <button onClick={onConfirm} disabled={deleting} className={s.btnDanger}>
            {deleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
            {deleting ? 'Đang xoá...' : 'Xoá công việc'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Cột danh sách công việc (đồng bộ với trang Tasks) ─────────────────────────
// Bỏ "Tên viết tắt" vì trong 1 công ty mọi dòng đều cùng công ty.
const CT_TASK_COLUMNS = [
  { key: 'title',          label: 'Tiêu đề', fixed: true },
  { key: 'startDate',      label: 'Ngày bắt đầu' },
  { key: 'dueDate',        label: 'Hết hạn' },
  { key: 'days',           label: 'Số ngày hoàn thành' },
  { key: 'plannedDays',    label: 'Số ngày kế hoạch' },
  { key: 'source',         label: 'Nguồn tạo' },
  { key: 'createdAt',      label: 'Ngày tạo' },
  { key: 'status',         label: 'Trạng thái' },
  { key: 'priority',       label: 'Ưu tiên' },
  { key: 'progress',       label: 'Tiến độ' },
  { key: 'assignedToName', label: 'Giao cho' },
  { key: 'latestComment',  label: 'Bình luận mới nhất' },
]

const CT_STATUS_SELECT_CLASS = {
  pending: ts.qeStatusPending,
  in_progress: ts.qeStatusInProgress,
  on_hold: ts.qeStatusOnHold,
  pending_review: ts.qeStatusPendingReview,
  needs_revision: ts.qeStatusNeedsRevision,
  completed: ts.qeStatusCompleted,
}
const CT_PRIORITY_SELECT_CLASS = {
  urgent: ts.qePriorityUrgent,
  high: ts.qePriorityHigh,
  medium: ts.qePriorityMedium,
  low: ts.qePriorityLow,
}

// Ô chỉnh nhanh Ngày hết hạn (đồng bộ giao diện với trang Tasks)
function CtListDateField({ value, onChange, isOverdue }) {
  const ref = useRef(null)
  const dateStr = value ? value.slice(0, 10) : ''
  return (
    <div
      className={`${ts.qeDate} ${ts.qeDateInteractive} ${isOverdue ? ts.qeDateOverdue : ''}`}
      onClick={() => ref.current?.showPicker?.()}
    >
      <span className={ts.qeDateText}>{dateStr ? fmtTaskDate(dateStr) : '—'}</span>
      <input ref={ref} type="date" value={dateStr} onChange={onChange} className={ts.qeDateInputNative} tabIndex={-1} />
    </div>
  )
}

// ── Column-header filter machinery (per docs/018) ─────────────────────────────

/** Filter kind per task column */
function getTaskColumnFilterType(colKey) {
  if (colKey === 'status' || colKey === 'priority' || colKey === 'assignedToName' || colKey === 'source') return 'enum'
  if (colKey === 'createdAt' || colKey === 'dueDate' || colKey === 'startDate') return 'dateRange'
  if (colKey === 'progress' || colKey === 'days' || colKey === 'plannedDays') return 'numberRange'
  return 'text'
}

/** Display string used in enum checkboxes / text search */
function getTaskDisplayLabel(row, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_LABELS[row.status] ?? row.status
    case 'priority':       return PRIORITY_LABELS[row.priority] ?? row.priority
    case 'startDate':      { const d = row.startDate || row.createdAt; return d ? fmtTaskDate(d) : '(Trống)' }
    case 'createdAt':      return row.createdAt ? fmtTaskDate(row.createdAt) : '(Trống)'
    case 'dueDate':        return row.dueDate ? fmtTaskDate(row.dueDate) : '(Trống)'
    case 'days':           { const d = calcDays(row);        return d !== null ? `${d}d` : '(Trống)' }
    case 'plannedDays':    { const d = calcPlannedDays(row); return d !== null ? `${d}d` : '(Trống)' }
    case 'assignedToName': return row.assignedToName || '(Chưa giao)'
    case 'latestComment':  return row.latestComment || '(Trống)'
    case 'source':         return SOURCE_LABELS[row.source] ?? row.source ?? '(Trống)'
    case 'progress': {
      const p = progressPct(row)
      return p !== null ? `${p}%` : '(Trống)'
    }
    default: {
      const v = row[colKey]
      return v != null && v !== '' ? String(v) : '(Trống)'
    }
  }
}

/** Sortable primitive for the given column */
function getTaskSortKey(row, colKey) {
  switch (colKey) {
    case 'status':         return STATUS_LABELS[row.status] ?? ''
    case 'priority':       return ({ urgent: 1, high: 2, medium: 3, low: 4 })[row.priority] ?? 5
    case 'startDate':      return row.startDate || row.createdAt || ''
    case 'createdAt':      return row.createdAt ?? ''
    case 'dueDate':        return row.dueDate ?? ''
    case 'days':           { const d = calcDays(row);        return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'plannedDays':    { const d = calcPlannedDays(row); return d == null ? Number.MAX_SAFE_INTEGER : d }
    case 'progress':       return progressPct(row) ?? -1
    case 'assignedToName': return (row.assignedToName ?? '').toLowerCase()
    case 'latestComment':  return (row.latestComment ?? '').toLowerCase()
    case 'source':         return SOURCE_LABELS[row.source] ?? row.source ?? ''
    default:               return String(row[colKey] ?? '').toLowerCase()
  }
}

function TaskEnumFilterSection({ colKey, allRows, currentFilter, onFilterChange, onClose }) {
  const allValues = useMemo(() => {
    const seen = new Set()
    const vals = []
    for (const row of allRows) {
      const lbl = getTaskDisplayLabel(row, colKey)
      if (!seen.has(lbl)) { seen.add(lbl); vals.push(lbl) }
    }
    return vals.sort((a, b) => a.localeCompare(b, 'vi', { numeric: true }))
  }, [allRows, colKey])

  const selected = useMemo(
    () => (!currentFilter ? new Set(allValues) : currentFilter),
    [currentFilter, allValues]
  )

  function toggleValue(val) {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onFilterChange(colKey, next.size === allValues.length ? null : next)
  }
  function toggleAll() {
    onFilterChange(colKey, selected.size === allValues.length ? new Set() : null)
  }

  const allChecked  = selected.size === allValues.length
  const noneChecked = selected.size === 0

  return (
    <>
      <label className={s.hdldDdSelectAll}>
        <input
          type="checkbox"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = !allChecked && !noneChecked }}
          onChange={toggleAll}
        />
        Chọn tất cả ({allValues.length})
      </label>
      <div className={s.hdldDdValueList}>
        {allValues.map((val) => (
          <label key={val} className={s.hdldDdValueItem}>
            <input type="checkbox" checked={selected.has(val)} onChange={() => toggleValue(val)} />
            <span className={s.hdldDdValueText}>{val}</span>
          </label>
        ))}
      </div>
      <div className={s.hdldDdFooter}>
        <button className={s.hdldDdClearBtn} onClick={() => { onFilterChange(colKey, null); onClose() }}>
          Xoá bộ lọc
        </button>
      </div>
    </>
  )
}

function TaskTextFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [query, setQuery] = useState(typeof currentFilter === 'string' ? currentFilter : '')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  return (
    <div className={s.hdldDdFilterSection}>
      <input
        ref={inputRef}
        type="text"
        className={s.hdldDdInput}
        placeholder="Tìm kiếm..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); onFilterChange(colKey, e.target.value.trim() || null) }}
      />
      {query && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn} onClick={() => { setQuery(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskDateRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [from, setFrom] = useState(currentFilter?.from ?? '')
  const [to,   setTo  ] = useState(currentFilter?.to   ?? '')
  function apply(f, t) { onFilterChange(colKey, f || t ? { from: f, to: t } : null) }
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Từ ngày</span>
          <input type="date" className={s.hdldDdInput} value={from}
            onChange={(e) => { setFrom(e.target.value); apply(e.target.value, to) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Đến ngày</span>
          <input type="date" className={s.hdldDdInput} value={to}
            onChange={(e) => { setTo(e.target.value); apply(from, e.target.value) }} />
        </div>
      </div>
      {(from || to) && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setFrom(''); setTo(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskNumberRangeFilterSection({ colKey, currentFilter, onFilterChange }) {
  const [minVal, setMinVal] = useState(currentFilter?.min ?? '')
  const [maxVal, setMaxVal] = useState(currentFilter?.max ?? '')
  function apply(mn, mx) { onFilterChange(colKey, mn !== '' || mx !== '' ? { min: mn, max: mx } : null) }
  return (
    <div className={s.hdldDdFilterSection}>
      <div className={s.hdldDdRangeGroup}>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối thiểu</span>
          <input type="number" className={s.hdldDdInput} placeholder="0" value={minVal}
            onChange={(e) => { setMinVal(e.target.value); apply(e.target.value, maxVal) }} />
        </div>
        <div className={s.hdldDdRangeRow}>
          <span className={s.hdldDdRangeLabel}>Tối đa</span>
          <input type="number" className={s.hdldDdInput} placeholder="∞" value={maxVal}
            onChange={(e) => { setMaxVal(e.target.value); apply(minVal, e.target.value) }} />
        </div>
      </div>
      {(minVal !== '' || maxVal !== '') && (
        <div className={s.hdldDdFooter}>
          <button className={s.hdldDdClearBtn}
            onClick={() => { setMinVal(''); setMaxVal(''); onFilterChange(colKey, null) }}>
            Xoá bộ lọc
          </button>
        </div>
      )}
    </div>
  )
}

function TaskColumnFilterDropdown({ colKey, allRows, currentFilter, sortState, onSort, onFilterChange, onClose, style }) {
  const dropRef    = useRef(null)
  const filterType = getTaskColumnFilterType(colKey)

  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        if (!e.target.closest('[data-hdld-filter-btn]')) onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const activeAsc  = sortState.col === colKey && sortState.dir === 'asc'
  const activeDesc = sortState.col === colKey && sortState.dir === 'desc'

  return (
    <div ref={dropRef} className={s.hdldFilterDropdown} style={style}>
      <div className={s.hdldDdSortSection}>
        <button className={`${s.hdldDdSortBtn} ${activeAsc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'asc')}>↑&nbsp; Sắp xếp A → Z</button>
        <button className={`${s.hdldDdSortBtn} ${activeDesc ? s.hdldDdSortBtnActive : ''}`}
          onClick={() => onSort(colKey, 'desc')}>↓&nbsp; Sắp xếp Z → A</button>
      </div>
      {filterType === 'enum' && (
        <TaskEnumFilterSection colKey={colKey} allRows={allRows} currentFilter={currentFilter}
          onFilterChange={onFilterChange} onClose={onClose} />
      )}
      {filterType === 'text' && (
        <TaskTextFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'dateRange' && (
        <TaskDateRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
      {filterType === 'numberRange' && (
        <TaskNumberRangeFilterSection colKey={colKey} currentFilter={currentFilter} onFilterChange={onFilterChange} />
      )}
    </div>
  )
}

// ── Multi-select dropdown (status / priority / source filter) ─────────────────

function TaskMultiSelect({ placeholder, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  function toggle(key) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  const count = selected.length
  const allChecked = options.length > 0 && count === options.length

  return (
    <div className={ts.multiSelect} ref={ref}>
      <button
        type="button"
        className={`${ts.multiSelectTrigger} ${count > 0 ? ts.multiSelectActive : ''}`}
        onClick={() => setOpen((p) => !p)}
      >
        <span className={ts.multiSelectLabel}>{count === 0 ? placeholder : `${count} đã chọn`}</span>
        {count > 0 && <span className={ts.multiSelectBadge}>{count}</span>}
        <ChevronDown size={11} className={`${ts.chevronRotate} ${open ? ts.chevronOpen : ''}`} />
      </button>
      {open && (
        <div className={ts.multiSelectDropdown}>
          <label className={ts.multiSelectItem}>
            <input type="checkbox" checked={allChecked}
              onChange={() => onChange(allChecked ? [] : options.map((o) => o.key))} />
            <span>Tất cả</span>
          </label>
          <div className={ts.multiSelectDivider} />
          {options.map((o) => (
            <label key={o.key} className={`${ts.multiSelectItem} ${selected.includes(o.key) ? ts.multiSelectItemChecked : ''}`}>
              <input type="checkbox" checked={selected.includes(o.key)} onChange={() => toggle(o.key)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── CompanyTasksTab ────────────────────────────────────────────────────────────

// ── sessionStorage: remember Công việc tab filters/view per company (survives F5) ─
const CT_STATE_KEY = (cid) => `company_tasks_state:${cid}`
function loadCtState(cid) {
  try { return JSON.parse(sessionStorage.getItem(CT_STATE_KEY(cid))) ?? {} }
  catch { return {} }
}
function saveCtState(cid, obj) {
  try { sessionStorage.setItem(CT_STATE_KEY(cid), JSON.stringify(obj)) } catch { /* ignore */ }
}

// ── Kanban board grouped by task source (Nguồn công việc) ───────────────────────

function SourceCardInner({ task, getLabel }) {
  const overdue = isTaskOverdue(task)
  const pct     = progressPct(task)
  return (
    <>
      <div className={`${s.cTaskTitle} ${overdue ? s.cTaskTitleOverdue : ''}`}>{task.title}</div>
      <div className={s.srcCardMeta}>
        <span className={`${ts.statusBadge} ${ts[STATUS_CSS[task.status]]}`}>
          {getLabel('task_status', task.status, STATUS_LABELS[task.status])}
        </span>
        <span className={`${ts.priorityBadge} ${ts[PRIORITY_CSS[task.priority]]}`}>
          {getLabel('task_priority', task.priority, PRIORITY_LABELS[task.priority])}
        </span>
      </div>
      <div className={s.srcCardFoot}>
        <span className={overdue ? s.cTaskDueOverdue : ''}>{fmtTaskDate(task.dueDate) ?? 'Chưa có hạn'}</span>
        <span>{task.assignedToName ?? '—'}</span>
      </div>
      {pct !== null && (
        <div className={s.cTaskProgressBar}>
          <div
            className={`${s.cTaskProgressFill} ${pct === 100 ? s.cTaskProgressFillDone : ''}`}
            style={{ '--progress-width': `${pct}%` }}
          />
        </div>
      )}
    </>
  )
}

function DraggableSourceCard({ task, onOpen, getLabel }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id, data: { source: task.source },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${ts.boardCard} ${isDragging ? ts.boardCardDragging : ''} ${transform ? ts.dragTransform : ''}`}
      style={transform ? { '--drag-x': `${transform.x}px`, '--drag-y': `${transform.y}px` } : undefined}
      onClick={() => !isDragging && onOpen(task.id)}
    >
      <SourceCardInner task={task} getLabel={getLabel} />
    </div>
  )
}

function DroppableSourceColumn({ srcKey, label, tasks, onOpen, getLabel }) {
  const { setNodeRef, isOver } = useDroppable({ id: srcKey })
  return (
    <div className={ts.boardCol}>
      <div className={ts.boardColHead}>
        <span className={ts.boardColDot} />
        <span className={ts.boardColTitle}>{label}</span>
        <span className={ts.boardColCount}>{tasks.length}</span>
      </div>
      <div ref={setNodeRef} className={`${ts.boardCards} ${isOver ? ts.boardCardsOver : ''}`}>
        {tasks.map((t) => (
          <DraggableSourceCard key={t.id} task={t} onOpen={onOpen} getLabel={getLabel} />
        ))}
        {tasks.length === 0 && <p className={ts.boardEmptyText}>Không có</p>}
      </div>
    </div>
  )
}

function SourceBoardView({ tasks, sources, onSourceChange, onOpen, getLabel }) {
  const [activeTask, setActiveTask] = useState(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const bySource = useMemo(() => {
    const map = {}
    for (const sc of sources) map[sc.key] = []
    for (const t of tasks) {
      if (map[t.source]) map[t.source].push(t)
      else (map.__other ??= []).push(t)
    }
    return map
  }, [tasks, sources])

  const cols = [...sources]
  if ((bySource.__other ?? []).length > 0) cols.push({ key: '__other', label: 'Khác' })

  function handleDragStart({ active }) {
    setActiveTask(tasks.find((t) => t.id === active.id) ?? null)
  }
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
      <div className={ts.boardWrap}>
        {cols.map((sc) => (
          <DroppableSourceColumn
            key={sc.key}
            srcKey={sc.key}
            label={sc.label}
            tasks={bySource[sc.key] ?? []}
            onOpen={onOpen}
            getLabel={getLabel}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className={`${ts.boardCard} ${ts.boardCardOverlay}`}>
            <SourceCardInner task={activeTask} getLabel={getLabel} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function CompanyTasksTab({ company, onTaskCountChange }) {
  const navigate   = useNavigate()
  const isAdmin    = useAuthStore((st) => st.user?.role === 'admin')
  const addToast   = useToastStore((st) => st.toast)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const loadEnums  = useEnumsStore((st) => st.load)

  const CUR_MONTH = String(new Date().getMonth() + 1)
  const CUR_YEAR  = String(new Date().getFullYear())

  // Restore saved filters/view from sessionStorage (once on mount)
  const [initCt] = useState(() => loadCtState(company.id))

  const [view, setView]             = useState(initCt.view ?? 'list')
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [statusCounts, setStatusCounts] = useState({})
  const [page, setPage]             = useState(1)
  const [limit, setLimit]           = useState(initCt.limit ?? 20)
  const [loading, setLoading]       = useState(true)
  const [availableYears, setAvailableYears] = useState([])

  const [searchInput, setSearchInput]       = useState(initCt.searchInput   ?? '')
  const [search, setSearch]                 = useState(initCt.searchInput   ?? '')
  const [statusFilter, setStatusFilter]     = useState(initCt.statusFilter  ?? [])
  const [priorityFilter, setPriorityFilter] = useState(initCt.priorityFilter ?? [])
  const [sourceFilter, setSourceFilter]     = useState(initCt.sourceFilter  ?? [])
  const [isOverdue, setIsOverdue]           = useState(initCt.isOverdue     ?? false)
  const [monthFilter, setMonthFilter]       = useState(initCt.monthFilter   ?? CUR_MONTH)
  const [yearFilter, setYearFilter]         = useState(initCt.yearFilter    ?? CUR_YEAR)
  // Khoảng ngày tự chọn — có giá trị thì được ưu tiên hơn Năm/Tháng
  const [dueDateFrom, setDueDateFrom]       = useState(initCt.dueDateFrom   ?? '')
  const [dueDateTo, setDueDateTo]           = useState(initCt.dueDateTo     ?? '')

  // Bulk selection
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [showBulkDelete, setShowBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting]     = useState(false)

  // Column-header filter / sort (client-side, per docs/018)
  const [colFilters, setColFilters]   = useState({})
  const [sortState, setSortState]     = useState(initCt.sortState ?? { col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup] = useState(null)

  const [showCreate, setShowCreate]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting]         = useState(false)
  const [quickViewId, setQuickViewId]   = useState(null)

  // Ẩn/hiện cột (đồng bộ với trang Tasks) — lưu sessionStorage theo công ty
  const [hiddenCols, setHiddenCols] = useState(() => new Set(Array.isArray(initCt.hiddenCols) ? initCt.hiddenCols : []))
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef(null)
  useEffect(() => {
    if (!showColMenu) return
    function onDoc(e) { if (colMenuRef.current && !colMenuRef.current.contains(e.target)) setShowColMenu(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [showColMenu])
  const vis = (key) => !hiddenCols.has(key)
  function toggleColVisible(key) {
    setHiddenCols((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to page 1 when filters or limit change
  useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter, dueDateFrom, dueDateTo, colFilters, sortState, limit])

  // Persist filters/view to sessionStorage (survives F5). colFilters holds Sets → skipped.
  useEffect(() => {
    saveCtState(company.id, {
      view, limit, searchInput, statusFilter, priorityFilter, sourceFilter,
      isOverdue, monthFilter, yearFilter, dueDateFrom, dueDateTo, sortState, hiddenCols: [...hiddenCols],
    })
  }, [company.id, view, limit, searchInput, statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter, dueDateFrom, dueDateTo, sortState, hiddenCols])

  useEffect(() => {
    loadEnums()
    tasksApi.getTaskYears()
      .then((years) => setAvailableYears(years))
      .catch(() => {
        const y = parseInt(CUR_YEAR, 10)
        setAvailableYears([y, y - 1, y - 2])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Khoảng ngày gửi lên server — dùng ĐÚNG hàm mà bộ lọc dùng để hiển thị,
  // nên những gì người dùng đọc thấy luôn khớp dữ liệu thực sự được lọc.
  const activeRange = resolvePeriodRange({
    year: yearFilter, month: monthFilter, from: dueDateFrom, to: dueDateTo,
  })

  function getDateRange() {
    return {
      dueDateFrom: activeRange.from || undefined,
      dueDateTo:   activeRange.to   || undefined,
    }
  }

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    // Load the whole period (server-side coarse filters); column-header filter,
    // sort and pagination are applied client-side on top of this set.
    tasksApi.listTasks({
      companyId:  company.id,
      search:     search                         || undefined,
      status:     statusFilter.length   ? statusFilter   : undefined,
      priority:   priorityFilter.length ? priorityFilter : undefined,
      source:     sourceFilter.length   ? sourceFilter   : undefined,
      isOverdue:  isOverdue     ? true : undefined,
      ...getDateRange(),
      page:  1,
      limit: 100,
      sortBy:  'due_date',
      sortDir: 'asc',
    })
      .then(({ tasks: t, pagination: p, statusCounts: sc }) => {
        if (!cancelled) {
          setTasks(t)
          setPagination(p ?? { total: t.length, totalPages: 1 })
          if (sc) setStatusCounts(sc)
        }
      })
      .catch(() => { if (!cancelled) setTasks([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [company.id, search, statusFilter, priorityFilter, sourceFilter, isOverdue, monthFilter, yearFilter, dueDateFrom, dueDateTo]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await tasksApi.deleteTask(deleteTarget.id)
      addToast(`Đã xoá "${deleteTarget.title}"`, 'success')
      setDeleteTarget(null)
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - 1))
      load()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xoá công việc', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Chọn Năm/Tháng thì bỏ khoảng ngày tự chọn — để hai cách lọc không chọi nhau
  function clearRange() { setDueDateFrom(''); setDueDateTo('') }

  // Đặt nhanh "Kỳ" — cùng bộ lựa chọn với trang Công việc để hai nơi thao tác giống nhau
  function applyPeriodPreset(key) {
    const now = new Date()
    clearRange()
    if (key === 'tm') {
      setYearFilter(String(now.getFullYear())); setMonthFilter(String(now.getMonth() + 1))
    } else if (key === 'lm') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      setYearFilter(String(d.getFullYear())); setMonthFilter(String(d.getMonth() + 1))
    } else if (key === 'ty') {
      setYearFilter(String(now.getFullYear())); setMonthFilter('')
    } else {
      setYearFilter(''); setMonthFilter('')
    }
    setPage(1)
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setStatusFilter([]); setPriorityFilter([]); setSourceFilter([]); setIsOverdue(false)
    setMonthFilter(CUR_MONTH); setYearFilter(CUR_YEAR); clearRange()
    setColFilters({}); setSortState({ col: null, dir: 'asc' })
    setPage(1)
  }

  // ── Bulk selection actions ────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function selectAllOnPage(checked) {
    setSelectedIds(checked ? new Set(pageRows.map((t) => t.id)) : new Set())
  }
  async function bulkComplete() {
    let done = 0, blocked = 0
    for (const id of selectedIds) {
      const task = tasks.find((t) => t.id === id)
      if (!task || task.status === 'completed') continue
      try { await tasksApi.changeTaskStatus(id, { status: 'completed' }); done++ }
      catch (err) { if (err.response?.status === 409) blocked++ }
    }
    if (done > 0) {
      addToast(`Đã hoàn thành ${done} công việc`, 'success')
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - done))
      load()
    } else if (blocked === 0) {
      addToast('Không có công việc nào được hoàn thành', 'info')
    }
    if (blocked > 0) addToast(`${blocked} công việc chưa tích đủ checklist nên không thể hoàn thành.`, 'error')
    setSelectedIds(new Set())
  }
  async function bulkDelete() {
    setBulkDeleting(true)
    let done = 0
    for (const id of [...selectedIds]) {
      try { await tasksApi.deleteTask(id); done++ } catch (_e) { /* skip */ }
    }
    addToast(`Đã xoá ${done} công việc`, done > 0 ? 'success' : 'error')
    if (done > 0) {
      onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - done))
      load()
    }
    setSelectedIds(new Set())
    setShowBulkDelete(false)
    setBulkDeleting(false)
  }

  // ── Kanban: change a task's source via drag-and-drop ──────────────────────────
  async function handleSourceChange(task, newSource) {
    const prevSource = task.source
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, source: newSource } : t)))
    try {
      await tasksApi.updateTask(task.id, { source: newSource })
      addToast('Đã chuyển nguồn công việc', 'success')
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, source: prevSource } : t)))
      addToast(err.response?.data?.error?.message ?? 'Không thể chuyển nguồn', 'error')
    }
  }

  // ── Quick-edit trong danh sách (đồng bộ với trang Tasks) ──────────────────────
  async function handleStatusChange(task, newStatus) {
    try {
      const updated = await tasksApi.changeTaskStatus(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      addToast(`Đã chuyển sang "${getLabel('task_status', newStatus, STATUS_LABELS[newStatus])}"`, 'success')
      if (newStatus === 'completed') onTaskCountChange(Math.max(0, (company.taskOpenCount ?? 0) - 1))
    } catch (err) {
      const status = err.response?.status
      const msg    = err.response?.data?.error?.message
      if (status === 409) addToast(msg ?? 'Còn mục checklist chưa hoàn thành. Vui lòng tích đủ checklist trước khi hoàn thành.', 'error')
      else                addToast(msg ?? 'Không thể cập nhật trạng thái', 'error')
    }
  }
  async function handlePriorityChange(task, priority) {
    try {
      const updated = await tasksApi.updateTask(task.id, { priority })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật ưu tiên', 'error')
    }
  }
  async function handleDueDateChange(task, dueDate) {
    try {
      const updated = await tasksApi.updateTask(task.id, { dueDate: dueDate || null })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
      addToast(dueDate ? 'Đã cập nhật ngày hết hạn' : 'Đã xoá ngày hết hạn', 'success')
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể cập nhật ngày hết hạn', 'error')
    }
  }

  const activeFilters = (search ? 1 : 0)
    + statusFilter.length + priorityFilter.length + sourceFilter.length
    + (isOverdue ? 1 : 0)
    + (monthFilter !== CUR_MONTH ? 1 : 0)
    + (yearFilter  !== CUR_YEAR  ? 1 : 0)

  // ── Client-side column-header filter + sort + pagination (docs/018) ───────────
  const displayed = useMemo(() => {
    let result = [...tasks]
    for (const [colKey, filterVal] of Object.entries(colFilters)) {
      const ft = getTaskColumnFilterType(colKey)
      if (ft === 'enum') {
        if (filterVal instanceof Set && filterVal.size > 0) {
          result = result.filter((row) => filterVal.has(getTaskDisplayLabel(row, colKey)))
        }
      } else if (ft === 'text') {
        if (typeof filterVal === 'string' && filterVal.trim()) {
          const q = filterVal.toLowerCase()
          result = result.filter((row) => getTaskDisplayLabel(row, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'dateRange') {
        if (filterVal && (filterVal.from || filterVal.to)) {
          result = result.filter((row) => {
            const raw = colKey === 'startDate' ? (row.startDate || row.createdAt) : row[colKey]
            if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (filterVal.from && d < filterVal.from) return false
            if (filterVal.to   && d > filterVal.to)   return false
            return true
          })
        }
      } else if (ft === 'numberRange') {
        if (filterVal && (filterVal.min !== '' || filterVal.max !== '')) {
          result = result.filter((row) => {
            const num = colKey === 'progress'     ? progressPct(row)
                      : colKey === 'days'         ? calcDays(row)
                      : colKey === 'plannedDays'  ? calcPlannedDays(row)
                      : parseFloat(row[colKey])
            if (num === null || num === undefined || isNaN(num)) return false
            if (filterVal.min !== '' && num < parseFloat(filterVal.min)) return false
            if (filterVal.max !== '' && num > parseFloat(filterVal.max)) return false
            return true
          })
        }
      }
    }
    if (sortState.col) {
      result.sort((a, b) => {
        const ak = getTaskSortKey(a, sortState.col)
        const bk = getTaskSortKey(b, sortState.col)
        if (typeof ak === 'number' && typeof bk === 'number') {
          return sortState.dir === 'asc' ? ak - bk : bk - ak
        }
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [tasks, colFilters, sortState])

  const clientTotal      = displayed.length
  const clientTotalPages = Math.max(1, Math.ceil(clientTotal / limit))
  const safePage         = Math.min(page, clientTotalPages)
  const pageRows         = displayed.slice((safePage - 1) * limit, safePage * limit)

  const sourceOptions = getOptions('task_source').length > 0
    ? getOptions('task_source')
    : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]

  // Danh sách trạng thái dùng CHUNG cho ô lọc "Trạng thái" và dãy chip đếm.
  // Ưu tiên danh mục do quản trị cấu hình; không có thì lấy enum gốc trong mã.
  const statusOptions = getOptions('task_status').length > 0
    ? getOptions('task_status')
    : TASK_STATUSES.map((k) => ({ key: k, label: STATUS_LABELS[k] }))

  const statusChipOptions = [{ key: '', label: 'Tất cả' }, ...statusOptions]
  const allPageSelected = pageRows.length > 0 && pageRows.every((t) => selectedIds.has(t.id))

  function openFilter(colKey, e) {
    e.stopPropagation()
    if (filterPopup?.colKey === colKey) setFilterPopup(null)
    else {
      const rect = e.currentTarget.getBoundingClientRect()
      setFilterPopup({ colKey, top: rect.bottom + 4, left: rect.left })
    }
  }
  function handleFilterChange(colKey, val) {
    setColFilters((prev) => {
      const next = { ...prev }
      if (val === null) delete next[colKey]
      else next[colKey] = val
      return next
    })
  }
  function handleSort(col, dir) { setSortState({ col, dir }) }
  function hasColFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = getTaskColumnFilterType(colKey)
    if (t === 'enum')        return f instanceof Set && f.size > 0
    if (t === 'text')        return typeof f === 'string' && f.trim().length > 0
    if (t === 'dateRange')   return Boolean(f.from || f.to)
    if (t === 'numberRange') return f.min !== '' || f.max !== ''
    return false
  }
  const colFilterCount = Object.keys(colFilters).filter(hasColFilter).length
  const hasSortActive  = sortState.col !== null

  function FilterTh({ colKey, className, children }) {
    const active = hasColFilter(colKey) || sortState.col === colKey
    return (
      <th className={className}>
        <div className={s.hdldThInner}>
          <span className={s.hdldThLabel}>{children}</span>
          <button
            data-hdld-filter-btn
            className={`${s.hdldFilterBtn} ${active ? s.hdldFilterBtnActive : ''}`}
            onClick={(e) => openFilter(colKey, e)}
            title="Lọc / Sắp xếp"
          >
            <Filter size={10} />
          </button>
        </div>
      </th>
    )
  }

  const visibleDataCols = CT_TASK_COLUMNS.filter((c) => c.fixed || vis(c.key)).length
  const colSpan = visibleDataCols + 2  // + checkbox + actions
  const from = clientTotal === 0 ? 0 : (safePage - 1) * limit + 1
  const to   = Math.min(safePage * limit, clientTotal)

  function pageWindow() {
    const total = clientTotalPages
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (safePage <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (safePage >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', safePage - 1, safePage, safePage + 1, '…', total]
  }

  return (
    <div>
      {/* Header row */}
      <div className={s.taskPanelHeader}>
        <div className={s.taskPanelHeaderTitle}>
          <h3 className={s.taskPanelTitle}>
            Công việc của khách hàng
          </h3>
          {!loading && (
            <span className={s.countPill}>
              {pagination.total}
            </span>
          )}
        </div>
        <div className={s.cTaskHeaderActions}>
          <div className={s.viewToggle}>
            <button
              className={`${s.viewToggleBtn} ${view === 'list' ? s.viewToggleBtnActive : ''}`}
              onClick={() => setView('list')}
              title="Dạng danh sách"
            >
              <List size={14} /> Danh sách
            </button>
            <button
              className={`${s.viewToggleBtn} ${view === 'board' ? s.viewToggleBtnActive : ''}`}
              onClick={() => { setView('board'); setSelectedIds(new Set()) }}
              title="Kanban theo nguồn công việc"
            >
              <LayoutGrid size={14} /> Kanban
            </button>
          </div>

          {view === 'list' && (
            <div className={ts.colMenuWrap} ref={colMenuRef}>
              <button
                className={`${s.viewToggleBtn} ${showColMenu ? s.viewToggleBtnActive : ''}`}
                onClick={() => setShowColMenu((v) => !v)}
                title="Chọn cột hiển thị"
              >
                <SlidersHorizontal size={14} /> Cột
              </button>
              {showColMenu && (
                <div className={ts.colMenu}>
                  <div className={ts.colMenuHead}>
                    <span>Cột hiển thị</span>
                    <button className={ts.colMenuReset} onClick={() => setHiddenCols(new Set())}>Hiện tất cả</button>
                  </div>
                  {CT_TASK_COLUMNS.map((c) => (
                    <label key={c.key} className={`${ts.colMenuItem} ${c.fixed ? ts.colMenuItemFixed : ''}`}>
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

          <button className={`${ts.btnPrimary} ${s.taskCreateBtnCompact}`} onClick={() => setShowCreate(true)}>
            <Plus size={13} /> Tạo công việc
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className={s.cTaskFilterPanel}>
        <div className={s.cTaskFilterHead}>
          <div className={s.cTaskFilterTitle}>
            <Filter size={12} />
            Bộ lọc
            {activeFilters > 0 && (
              <span className={s.cTaskFilterBadge}>{activeFilters} đang bật</span>
            )}
          </div>
          {/* Dãy chip đếm theo trạng thái nằm NGAY TRÊN HÀNG TIÊU ĐỀ của khung
              bộ lọc — chỗ này vốn bỏ trống, nhét vào đây thì không tốn thêm
              hàng nào. Nhãn lấy từ danh mục trạng thái của hệ thống
              (getOptions('task_status')), không viết cứng trong mã. */}
          <div className={s.cTaskStatusRow}>
            {statusChipOptions.map(({ key, label }) => {
              const count = key === '' ? pagination.total : (statusCounts[key] ?? 0)
              const isActive = key === '' ? statusFilter.length === 0 : statusFilter.includes(key)
              return (
                <button
                  key={key}
                  className={`${s.cTaskStatusChip} ${isActive ? `${s.cTaskStatusChipActive} ${COMPANY_TASK_STATUS_TONE[key] ?? ''}` : ''}`}
                  onClick={() => {
                    if (key === '') setStatusFilter([])
                    else setStatusFilter((arr) => arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key])
                    setPage(1)
                  }}
                >
                  <span>{label}</span>
                  <span className={`${s.cTaskStatusChipCount} ${isActive ? s.cTaskStatusChipCountActive : ''}`}>{count}</span>
                </button>
              )
            })}
          </div>

          <button className={s.cTaskFilterReset} onClick={resetFilters}>
            <RotateCcw size={11} /> Đặt lại
          </button>
        </div>

        <div className={s.cTaskFilterGrid}>
          {/* Kỳ — gộp Năm + Tháng vào 1 control, dùng chung với trang Công việc */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Kỳ</label>
            <PeriodPicker
              year={yearFilter}
              month={monthFilter}
              from={dueDateFrom}
              to={dueDateTo}
              availableYears={availableYears}
              onYear={(v) => { setYearFilter(v); if (!v) setMonthFilter(''); clearRange(); setPage(1) }}
              onMonth={(v) => { setMonthFilter(v); clearRange(); setPage(1) }}
              onFrom={(e) => { setDueDateFrom(e.target.value); setPage(1) }}
              onTo={(e) => { setDueDateTo(e.target.value); setPage(1) }}
              onPreset={applyPeriodPreset}
            />
          </div>

          {/* Tìm kiếm */}
          <div className={`${s.cTaskFilterGroup} ${s.cTaskFilterGroupGrow}`}>
            <label className={s.cTaskFilterLabel}>Từ khoá</label>
            <div className={s.searchFieldWrap}>
              <Search size={12} className={s.searchFieldIcon} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm công việc..."
                className={`${s.cTaskFilterInput} ${s.cTaskFilterInputWithIcon}`}
              />
            </div>
          </div>

          {/* Trạng thái — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Trạng thái</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={statusOptions}
              selected={statusFilter}
              onChange={(v) => { setStatusFilter(v); setPage(1) }}
            />
          </div>

          {/* Ưu tiên — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Ưu tiên</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={getOptions('task_priority').length > 0
                ? getOptions('task_priority')
                : ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))}
              selected={priorityFilter}
              onChange={(v) => { setPriorityFilter(v); setPage(1) }}
            />
          </div>

          {/* Nguồn công việc — multi-select */}
          <div className={s.cTaskFilterGroup}>
            <label className={s.cTaskFilterLabel}>Nguồn</label>
            <TaskMultiSelect
              placeholder="Tất cả"
              options={getOptions('task_source').length > 0
                ? getOptions('task_source')
                : [{ key: 'manual', label: 'Thủ công' }, { key: 'auto', label: 'Tự động' }]}
              selected={sourceFilter}
              onChange={(v) => { setSourceFilter(v); setPage(1) }}
            />
          </div>

          {/* Trễ hạn — gọi đúng tên như trang Công việc */}
          <div className={`${s.cTaskFilterGroup} ${s.filterGroupEnd}`}>
            <label className={s.cTaskFilterLabel}>&nbsp;</label>
            <button
              className={`${s.cTaskOverdueBtn} ${isOverdue ? s.cTaskOverdueBtnActive : ''}`}
              onClick={() => { setIsOverdue((v) => !v); setPage(1) }}
            >
              {isOverdue ? '✓ ' : ''}Trễ hạn
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        <div className={`${s.filterChips} ${s.filterChipsCompact}`}>
          {/* Period chip — always show current period */}
          {(() => {
            const isDefault = monthFilter === CUR_MONTH && yearFilter === CUR_YEAR && !dueDateFrom && !dueDateTo
            return (
              <span className={`${s.filterChip} ${isDefault ? s.filterChipMuted : ''}`} title={periodRangeLabel(activeRange)}>
                Kỳ: {periodRangeLabel(activeRange)}
                {!isDefault && (
                  <button
                    className={s.filterChipRemove}
                    onClick={() => { setMonthFilter(CUR_MONTH); setYearFilter(CUR_YEAR); clearRange(); setPage(1) }}
                  >×</button>
                )}
              </span>
            )
          })()}
          {priorityFilter.map((p) => (
            <span key={p} className={s.filterChip}>
              Ưu tiên: {getLabel('task_priority', p, PRIORITY_LABELS[p] ?? p)}
              <button className={s.filterChipRemove} onClick={() => { setPriorityFilter((arr) => arr.filter((k) => k !== p)); setPage(1) }}>×</button>
            </span>
          ))}
          {sourceFilter.map((src) => (
            <span key={src} className={s.filterChip}>
              Nguồn: {getLabel('task_source', src, src === 'auto' ? 'Tự động' : 'Thủ công')}
              <button className={s.filterChipRemove} onClick={() => { setSourceFilter((arr) => arr.filter((k) => k !== src)); setPage(1) }}>×</button>
            </span>
          ))}
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

      </div>

      {/* Bulk action bar (list view) */}
      {view === 'list' && selectedIds.size > 0 && (
        <div className={ts.bulkBar}>
          <span className={ts.bulkCount}>{selectedIds.size} đã chọn</span>
          <span className={ts.bulkDivider} />
          <button className={ts.btnGhost} onClick={bulkComplete}>
            <Check size={13} /> Hoàn thành tất cả
          </button>
          <button className={`${ts.btnGhost} ${ts.btnDangerText}`} onClick={() => setShowBulkDelete(true)}>
            <Trash2 size={13} /> Xóa đã chọn
          </button>
          <button className={ts.btnGhost} onClick={() => setSelectedIds(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* ── Kanban board (theo nguồn công việc) ── */}
      {view === 'board' ? (
        <div className={s.tableWrap}>
          {loading ? (
            <div className={s.cTaskBoardLoading}>Đang tải...</div>
          ) : displayed.length === 0 ? (
            <div className={s.taskEmptyInline}>
              <ListTodo size={28} className={s.taskEmptyInlineIcon} />
              {(activeFilters > 0 || colFilterCount > 0) ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}
            </div>
          ) : (
            <SourceBoardView
              tasks={displayed}
              sources={sourceOptions}
              onSourceChange={handleSourceChange}
              onOpen={setQuickViewId}
              getLabel={getLabel}
            />
          )}
        </div>
      ) : (
      /* ── Table (list view) ── */
      <div className={s.tableWrap}>
        <div className={s.tableScroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={ts.thCheck}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => selectAllOnPage(e.target.checked)}
                    title="Chọn tất cả trên trang"
                  />
                </th>
                <FilterTh colKey="title">Tiêu đề</FilterTh>
                {vis('startDate')      && <FilterTh colKey="startDate">Ngày bắt đầu</FilterTh>}
                {vis('dueDate')        && <FilterTh colKey="dueDate">Hết hạn</FilterTh>}
                {vis('days')           && <FilterTh colKey="days">Số ngày hoàn thành</FilterTh>}
                {vis('plannedDays')    && <FilterTh colKey="plannedDays">Số ngày kế hoạch</FilterTh>}
                {vis('source')         && <FilterTh colKey="source">Nguồn tạo</FilterTh>}
                {vis('createdAt')      && <FilterTh colKey="createdAt">Ngày tạo</FilterTh>}
                {vis('status')         && <FilterTh colKey="status">Trạng thái</FilterTh>}
                {vis('priority')       && <FilterTh colKey="priority">Ưu tiên</FilterTh>}
                {vis('progress')       && <FilterTh colKey="progress">Tiến độ</FilterTh>}
                {vis('assignedToName') && <FilterTh colKey="assignedToName">Giao cho</FilterTh>}
                {vis('latestComment')  && <FilterTh colKey="latestComment">Bình luận mới nhất</FilterTh>}
                <th className={s.taskActionHeadAdmin} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className={ts.tdCheck} />
                    {Array.from({ length: visibleDataCols }).map((_, j) => (
                      <td key={j} className={s.taskSkeletonCell}>
                        <div className={s.taskSkeletonBar} style={{ '--skeleton-w': `${j === 0 ? 220 : 80}px` }} />
                      </td>
                    ))}
                    <td />
                  </tr>
                ))
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={colSpan}>
                    <div className={s.taskEmptyInline}>
                      <ListTodo size={28} className={s.taskEmptyInlineIcon} />
                      {(activeFilters > 0 || colFilterCount > 0) ? 'Không tìm thấy công việc phù hợp' : 'Chưa có công việc nào'}
                    </div>
                  </td>
                </tr>
              ) : pageRows.map((task) => {
                const overdue = isTaskOverdue(task)
                const pct     = progressPct(task)
                const days    = calcDays(task)
                const planned = calcPlannedDays(task)
                return (
                  <tr
                    key={task.id}
                    className={`${s.cTaskRow} ${selectedIds.has(task.id) ? ts.trSelected : ''} ${overdue ? s.cTaskRowOverdue : ''}`}
                    onClick={() => setQuickViewId(task.id)}
                  >
                    <td className={ts.tdCheck} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                      />
                    </td>

                    {/* Tiêu đề (cố định) */}
                    <td className={s.cTaskTitleCell}>
                      <div className={`${s.cTaskTitle} ${overdue ? s.cTaskTitleOverdue : ''}`} title={task.title}>
                        {task.title}
                      </div>
                    </td>

                    {/* Ngày bắt đầu */}
                    {vis('startDate') && (
                      <td className={s.cTaskDateCell}>
                        {fmtTaskDate(task.startDate || task.createdAt)}
                      </td>
                    )}

                    {/* Hết hạn — staff chỉ sửa được với task từ lịch định kỳ; nguồn khác chỉ admin */}
                    {vis('dueDate') && (
                      <td className={`${s.cTaskDateCell} ${overdue ? s.cTaskDueOverdue : ''}`} onClick={(e) => e.stopPropagation()}>
                        {canEditDueDate(task, isAdmin) ? (
                          <CtListDateField
                            value={task.dueDate ?? ''}
                            onChange={(e) => handleDueDateChange(task, e.target.value)}
                            isOverdue={overdue}
                          />
                        ) : (
                          <span title="Chỉ Quản trị viên được sửa (công việc này không phải từ lịch định kỳ)">
                            {task.dueDate ? fmtTaskDate(task.dueDate) : '—'}
                          </span>
                        )}
                      </td>
                    )}

                    {/* Số ngày hoàn thành (thực tế) */}
                    {vis('days') && (
                      <td>
                        {days !== null ? (
                          <span className={`${ts.daysBadge} ${task.status === 'completed' ? ts.daysBadgeDone : ''}`}>{days}d</span>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    {/* Số ngày kế hoạch (hết hạn − bắt đầu) */}
                    {vis('plannedDays') && (
                      <td>
                        {planned !== null ? (
                          <span className={`${ts.daysBadge} ${ts.daysBadgePlan}`}>{planned}d</span>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    {/* Nguồn tạo */}
                    {vis('source') && (
                      <td>
                        <span className={`${ts.sourceBadge} ${task.source === 'auto' ? ts.sourceAuto : ts.sourceManual}`}>
                          {getLabel('task_source', task.source, SOURCE_LABELS[task.source] ?? task.source)}
                        </span>
                      </td>
                    )}

                    {/* Ngày tạo */}
                    {vis('createdAt') && (
                      <td className={s.cTaskDateCell}>
                        {fmtTaskDate(task.createdAt)}
                      </td>
                    )}

                    {/* Trạng thái — chỉnh nhanh */}
                    {vis('status') && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(e) => { if (e.target.value !== task.status) handleStatusChange(task, e.target.value) }}
                          className={`${ts.qeSelect} ${ts.qeSelectStyled} ${(task.status === 'completed' && completionKind(task) === 'late') ? ts.qeStatusCompletedLate : (CT_STATUS_SELECT_CLASS[task.status] ?? '')}`}
                          title="Đổi trạng thái"
                        >
                          <option value={task.status}>{taskStatusLabel(task, getLabel)}</option>
                          {(STATUS_TRANSITIONS[task.status] ?? []).map((st) => (
                            <option key={st} value={st}>{getLabel('task_status', st, STATUS_LABELS[st])}</option>
                          ))}
                        </select>
                      </td>
                    )}

                    {/* Ưu tiên — chỉnh nhanh */}
                    {vis('priority') && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          value={task.priority ?? ''}
                          onChange={(e) => handlePriorityChange(task, e.target.value)}
                          className={`${ts.qeSelect} ${ts.qeSelectStyled} ${CT_PRIORITY_SELECT_CLASS[task.priority] ?? ''}`}
                          title="Đổi ưu tiên"
                        >
                          {['urgent', 'high', 'medium', 'low'].map((p) => (
                            <option key={p} value={p}>{getLabel('task_priority', p, PRIORITY_LABELS[p])}</option>
                          ))}
                        </select>
                      </td>
                    )}

                    {/* Tiến độ */}
                    {vis('progress') && (
                      <td>
                        {pct !== null ? (
                          <div className={s.cTaskProgress}>
                            <div className={s.cTaskProgressBar}>
                              <div className={`${s.cTaskProgressFill} ${pct === 100 ? s.cTaskProgressFillDone : ''}`} style={{ '--progress-width': `${pct}%` }} />
                            </div>
                            <span className={s.cTaskProgressText}>{pct}%</span>
                          </div>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    {/* Giao cho */}
                    {vis('assignedToName') && (
                      <td className={s.cTaskAssigneeCell} title={task.assignedToName ?? ''}>
                        {task.assignedToName ?? '—'}
                      </td>
                    )}

                    {/* Bình luận mới nhất */}
                    {vis('latestComment') && (
                      <td>
                        {task.latestComment ? (
                          <div className={ts.latestCommentCell} title={`${task.latestCommentBy ?? ''}: ${task.latestComment}`}>
                            {task.latestCommentBy && <span className={ts.latestCommentBy}>{task.latestCommentBy}:</span>}
                            <span className={ts.latestCommentText}>{task.latestComment}</span>
                          </div>
                        ) : <span className={s.cTaskDash}>—</span>}
                      </td>
                    )}

                    <td className={s.cTaskActionCell} onClick={(e) => e.stopPropagation()}>
                      <div className={s.cTaskActionBtns}>
                        <button
                          className={s.rowActionBtn}
                          title="Xem chi tiết"
                          onClick={() => navigate(`/tasks/${task.id}`)}
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          className={`${s.rowActionBtn} ${s.rowActionDanger}`}
                          title="Xoá công việc"
                          onClick={() => setDeleteTarget(task)}
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

        {/* Pagination — always visible when data exists */}
        <div className={s.paginationBar}>
          <span className={s.paginationInfo}>
            {loading ? '...' : clientTotal === 0 ? '0 công việc' : `${from}–${to} / ${clientTotal}`}
            {colFilterCount > 0 && ` · ${colFilterCount} lọc cột`}
            {hasSortActive && ' · đang sắp xếp'}
          </span>
          <div className={s.paginationBtns}>
            <button className={s.paginationBtn} onClick={() => setPage(1)} disabled={safePage === 1 || loading}>«</button>
            <button className={s.paginationBtn} onClick={() => setPage(safePage - 1)} disabled={safePage === 1 || loading}>‹</button>
            {pageWindow().map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className={s.paginationGap}>…</span>
              ) : (
                <button
                  key={n}
                  className={`${s.paginationBtn} ${safePage === n ? s.paginationBtnActive : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              )
            )}
            <button className={s.paginationBtn} onClick={() => setPage(safePage + 1)} disabled={safePage === clientTotalPages || loading}>›</button>
            <button className={s.paginationBtn} onClick={() => setPage(clientTotalPages)} disabled={safePage === clientTotalPages || loading}>»</button>
          </div>
          <div className={s.pageSizeWrap}>
            <span className={s.pageSizeLabel}>Hiển thị:</span>
            {[10, 20, 50].map((n) => (
              <button
                key={n}
                className={`${s.pageSizeBtn} ${limit === n ? s.pageSizeBtnActive : ''}`}
                onClick={() => setLimit(n)}
              >
                {n}
              </button>
            ))}
            <span className={s.pageSizeLabel}>/ trang</span>
          </div>
        </div>
      </div>
      )}

      {/* Bulk delete confirm modal */}
      {showBulkDelete && (
        <Modal title={`Xóa ${selectedIds.size} công việc`} onClose={() => !bulkDeleting && setShowBulkDelete(false)}>
          <div className={s.modalStack}>
            <div className={`${s.terminateWarn} ${s.terminateWarnDanger}`}>
              <AlertTriangle size={18} className={`${s.warnIconInline} ${s.warnIconDanger}`} />
              <span>
                Bạn có chắc muốn xoá <strong>{selectedIds.size}</strong> công việc đã chọn?
                Hành động này không thể hoàn tác.
              </span>
            </div>
            <div className={s.modalActions}>
              <button className={s.btnOutline} onClick={() => setShowBulkDelete(false)} disabled={bulkDeleting}>Huỷ bỏ</button>
              <button className={s.btnDanger} onClick={bulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? <Loader2 size={13} className={s.spin} /> : <Trash2 size={13} />}
                {bulkDeleting ? 'Đang xoá...' : `Xoá ${selectedIds.size} mục`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create task modal */}
      {showCreate && (
        <TaskFormModal
          initialCompanyId={company.id}
          lockCompany
          onClose={() => setShowCreate(false)}
          onSaved={(task) => {
            setShowCreate(false)
            addToast(`Đã tạo "${task.title}"`, 'success')
            setPage(1)
            load()
            onTaskCountChange((company.taskOpenCount ?? 0) + 1)
          }}
          onSavedAndOpen={(task) => {
            setShowCreate(false)
            navigate(`/tasks/${task.id}`)
          }}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          deleting={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}

      {/* Quick view sidebar */}
      {quickViewId && (
        <TaskQuickView
          taskId={quickViewId}
          onClose={() => setQuickViewId(null)}
          onUpdated={() => load()}
        />
      )}

      {/* Column-header filter dropdown — position:fixed, outside table scroll */}
      {filterPopup && (
        <TaskColumnFilterDropdown
          colKey={filterPopup.colKey}
          allRows={tasks}
          currentFilter={colFilters[filterPopup.colKey] ?? null}
          sortState={sortState}
          onSort={handleSort}
          onFilterChange={handleFilterChange}
          onClose={() => setFilterPopup(null)}
          style={{
            '--hdld-dd-top':  `${filterPopup.top}px`,
            '--hdld-dd-left': `${filterPopup.left}px`,
          }}
        />
      )}
    </div>
  )
}

export default CompanyTasksTab
