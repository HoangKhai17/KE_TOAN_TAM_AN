import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

const EMPTY_ITEMS = []   // ref ổn định để useMemo phía dưới không recompute mỗi render
import {
  Plus, Search, ClipboardCheck, Loader2, Check,
  List, Columns, Filter, RotateCcw,
  ChevronDown, Trash2, ArrowUpRight, X,
} from 'lucide-react'
import {
  DndContext, DragOverlay,
  useSensor, useSensors, PointerSensor,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import PaginationFooter from '../../components/layout/PaginationFooter'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import * as api from '../../api/internalAssignments'
import { useStaffOptions } from '../../hooks/useReferenceData'
import AssignmentDetailPanel from './AssignmentDetailPanel'
import CreateEditAssignmentModal from './CreateEditAssignmentModal'
import InternalNavTabs from './InternalNavTabs'
import PeriodPicker from '../Tasks/PeriodPicker'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
import DeleteConfirmDialog from '../../components/ui/DeleteConfirmDialog'
import DateBox from '../../components/ui/DateBox'
import {
  BulkActionBar,
  IndexHeaderCell,
  IndexRowCell,
  SelectionHeaderCell,
  SelectionRowCell,
  useRowSelection,
} from '../../components/ui/data-table'
import s from './internalAssignments.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft:     'Nháp',
  active:    'Đang thực hiện',
  done:      'Hoàn thành',
  cancelled: 'Đã hủy',
}

const STATUS_CSS = {
  draft:     s.badgeDraft,
  active:    s.badgeActive,
  done:      s.badgeDone,
  cancelled: s.badgeCancelled,
}

const PRIORITY_LABELS = {
  low:    'Thấp',
  normal: 'Bình thường',
  high:   'Cao',
  urgent: 'Khẩn cấp',
}

const PRIORITY_CSS = {
  low:    s.badgeLow,
  normal: s.badgeNormal,
  high:   s.badgeHigh,
  urgent: s.badgeUrgent,
}

// Ô select màu kiểu trang Tasks (đồng bộ giao diện danh sách)
const STATUS_SELECT_CLASS = {
  draft:     s.qeStatusDraft,
  active:    s.qeStatusActive,
  done:      s.qeStatusDone,
  cancelled: s.qeStatusCancelled,
}
const PRIORITY_SELECT_CLASS = {
  low:    s.qePriorityLow,
  normal: s.qePriorityNormal,
  high:   s.qePriorityHigh,
  urgent: s.qePriorityUrgent,
}

// Rút gọn tên nhân sự: >2 từ → lấy 2 từ cuối (giống trang Tasks)
function shortName(name) {
  if (!name) return name
  const parts = String(name).trim().split(/\s+/)
  return parts.length <= 2 ? parts.join(' ') : parts.slice(-2).join(' ')
}

const ASSIGNEE_STATUS_LABELS = {
  pending:     'Chờ tiếp nhận',
  accepted:    'Đã tiếp nhận',
  in_progress: 'Đang làm',
  done:        'Hoàn thành',
  rejected:    'Từ chối',
}

const ASSIGNEE_STATUS_CSS = {
  pending:     s.chipPending,
  accepted:    s.chipAccepted,
  in_progress: s.chipInProgress,
  done:        s.chipDone,
  rejected:    s.chipRejected,
}

const MY_STATUS_CSS = {
  pending:     s.myStatusPending,
  accepted:    s.myStatusAccepted,
  in_progress: s.myStatusInProgress,
  done:        s.myStatusDone,
  rejected:    s.myStatusRejected,
}

function progressPct(item) {
  if ((item.checklistTotal ?? 0) > 0) {
    return Math.round((item.checklistDone / item.checklistTotal) * 100)
  }
  return null
}

// ── Column-header filter helpers (docs/018) for the list view ───────────────────
const IA_STATUS_RANK   = { draft: 1, active: 2, done: 3, cancelled: 4 }
const IA_PRIORITY_RANK = { urgent: 1, high: 2, normal: 3, low: 4 }
const IA_COL_TYPE = {
  title: 'text', companyShort: 'text', startDate: 'dateRange',
  deadlineDate: 'dateRange', createdAt: 'dateRange', status: 'enum',
  priority: 'enum', progress: 'numberRange', assignedToName: 'text',
  latestComment: 'text',
}
function iaColFilterType(k) { return IA_COL_TYPE[k] ?? 'text' }
function iaColRawDate(it, k) {
  if (k === 'startDate') return it.startDate
  if (k === 'deadlineDate') return it.deadlineDate
  return it.createdAt
}
function iaColDisplayLabel(it, k) {
  switch (k) {
    case 'status':       return STATUS_LABELS[it.status] ?? it.status ?? '(Trống)'
    case 'priority':     return PRIORITY_LABELS[it.priority] ?? it.priority ?? '(Trống)'
    case 'startDate':    return it.startDate    ? fmtDate(it.startDate)    : '(Trống)'
    case 'deadlineDate': return it.deadlineDate ? fmtDate(it.deadlineDate) : '(Trống)'
    case 'createdAt':    return it.createdAt    ? fmtDate(it.createdAt)    : '(Trống)'
    case 'companyShort': return it.company?.shortName || it.company?.name || '(Trống)'
    case 'assignedToName': return it.assignees?.map((a) => a.name).filter(Boolean).join(', ') || '(Trống)'
    case 'latestComment': return it.latestComment || '(Trống)'
    default: { const v = it[k]; return v != null && v !== '' ? String(v) : '(Trống)' }
  }
}
function iaColSortKey(it, k) {
  switch (k) {
    case 'status':       return IA_STATUS_RANK[it.status] ?? 99
    case 'priority':     return IA_PRIORITY_RANK[it.priority] ?? 99
    case 'progress':     { const p = progressPct(it); return p == null ? -1 : p }
    case 'startDate':    return it.startDate || ''
    case 'deadlineDate': return it.deadlineDate || ''
    case 'createdAt':    return it.createdAt || ''
    case 'companyShort': return (it.company?.shortName || it.company?.name || '').toLowerCase()
    case 'assignedToName': return (it.assignees?.map((a) => a.name).join(' ') || '').toLowerCase()
    case 'latestComment': return (it.latestComment || '').toLowerCase()
    default:             return (it.title || '').toLowerCase()
  }
}

// ── MultiSelect component ─────────────────────────────────────────────────────

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

  const count      = selected.length
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
        <ChevronDown size={11} className={`${s.chevronRotate} ${open ? s.chevronOpen : ''}`} />
      </button>
      {open && (
        <div className={s.multiSelectDropdown}>
          <label className={s.multiSelectItem}>
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => onChange(allChecked ? [] : options.map((o) => o.id ?? o.key))}
            />
            <span>Tất cả</span>
          </label>
          <div className={s.multiSelectDivider} />
          {options.map((o) => {
            const key = o.id ?? o.key
            return (
              <label
                key={key}
                className={`${s.multiSelectItem} ${selected.includes(key) ? s.multiSelectItemChecked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                />
                <span>{o.name ?? o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'deadline_date:asc',  label: 'Hạn sớm nhất' },
  { value: 'deadline_date:desc', label: 'Hạn muộn nhất' },
  { value: 'created_at:desc',    label: 'Mới nhất' },
  { value: 'created_at:asc',     label: 'Cũ nhất' },
  { value: 'priority:asc',       label: 'Ưu tiên: Cao → Thấp' },
  { value: 'priority:desc',      label: 'Ưu tiên: Thấp → Cao' },
]

const IA_STATUSES = ['draft', 'active', 'done', 'cancelled']

// Valid drag transitions (admin only): src → allowed destinations
const IA_STATUS_TRANSITIONS = {
  draft:     ['active', 'cancelled'],
  active:    ['done', 'cancelled'],
  done:      ['active', 'cancelled'],   // mở lại / hủy (bỏ khóa cứng khi hoàn thành)
  cancelled: ['active'],                // mở lại
}

const COL_DOT = {
  draft:     s.dotDraft,
  active:    s.dotActive,
  done:      s.dotDone,
  cancelled: s.dotCancelled,
}

// ── Date helpers ──────────────────────────────────────────────────────────────

const CUR_YEAR  = String(new Date().getFullYear())
const CUR_MONTH = String(new Date().getMonth() + 1)

function yearMonthToDates(year, month) {
  if (!year) return { from: '', to: '' }
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` }
  const m = parseInt(month, 10)
  const lastDay = new Date(parseInt(year, 10), m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return d }
}

function isOverdue(item) {
  return item.deadlineDate && item.status === 'active'
    && new Date(item.deadlineDate) < new Date()
}

// ── DeleteModal ───────────────────────────────────────────────────────────────

function DeleteModal({ item, deleting, onClose, onConfirm }) {
  return (
    <div className={s.miniOverlay}>
      <div className={s.miniDialog}>
        <h4 className={s.miniTitle}>Xóa phiếu giao việc</h4>
        <p className={s.miniBody}>
          Bạn có chắc chắn muốn xóa phiếu{' '}
          <strong>&ldquo;{item.title}&rdquo;</strong>?{' '}
          Hành động này không thể hoàn tác.
        </p>
        <div className={s.miniActions}>
          <button onClick={onClose} className={s.btnSecondary} disabled={deleting}>Hủy bỏ</button>
          <button onClick={onConfirm} disabled={deleting} className={s.btnDanger}>
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

// ── Board card inner ──────────────────────────────────────────────────────────

function BoardCardInner({ item }) {
  const overdue = isOverdue(item)
  return (
    <>
      <div className={s.boardCardTitle}>{item.title}</div>
      <div className={s.boardCardCompany}>
        {item.company ? item.company.name : <span className={s.internalBadge}>Công việc nội bộ</span>}
      </div>
      <div className={s.boardCardMeta}>
        <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>
          {PRIORITY_LABELS[item.priority]}
        </span>
        {item.deadlineDate && (
          <span className={overdue ? s.boardCardDeadlineOver : s.boardCardDeadline}>
            {fmtDate(item.deadlineDate)}{overdue ? ' • Quá hạn' : ''}
          </span>
        )}
      </div>
      {item.assignees?.length > 0 && (
        <div className={s.boardCardAssignees}>
          {item.assignees.slice(0, 4).map((a) => (
            <span
              key={a.userId}
              className={`${s.assigneeChip} ${ASSIGNEE_STATUS_CSS[a.status]}`}
              title={`${a.name} — ${ASSIGNEE_STATUS_LABELS[a.status]}`}
            >
              {a.name}
            </span>
          ))}
          {item.assignees.length > 4 && (
            <span className={`${s.assigneeChip} ${s.chipPending}`}>+{item.assignees.length - 4}</span>
          )}
        </div>
      )}
    </>
  )
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

function DraggableCard({ item, onOpen, isAdmin }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { status: item.status },
    disabled: !isAdmin || !IA_STATUS_TRANSITIONS[item.status],
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${s.boardCard} ${isDragging ? s.boardCardDragging : ''} ${transform ? s.dragTransform : ''}`}
      style={transform ? { '--drag-x': `${transform.x}px`, '--drag-y': `${transform.y}px` } : undefined}
      onClick={() => !isDragging && onOpen(item.id)}
    >
      <BoardCardInner item={item} />
    </div>
  )
}

// ── DroppableColumn ───────────────────────────────────────────────────────────

function DroppableColumn({ status, items, onOpen, isAdmin }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className={`${s.boardCol} ${s[`boardCol_${status}`] ?? ''}`}>
      <div className={s.boardColHead}>
        <span className={`${s.boardColDot} ${COL_DOT[status]}`} />
        <span className={s.boardColTitle}>{STATUS_LABELS[status]}</span>
        <span className={s.boardColCount}>{items.length}</span>
      </div>
      <div ref={setNodeRef} className={`${s.boardCards} ${isOver ? s.boardCardsOver : ''}`}>
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} onOpen={onOpen} isAdmin={isAdmin} />
        ))}
        {items.length === 0 && (
          <p className={s.boardEmptyText}>Không có</p>
        )}
      </div>
    </div>
  )
}

// ── BoardView ─────────────────────────────────────────────────────────────────

function BoardView({ items, onOpen, onStatusChange, isAdmin }) {
  const [activeItem, setActiveItem] = useState(null)
  const addToast = useToastStore((st) => st.toast)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const byStatus = useMemo(() => {
    const map = {}
    for (const st of IA_STATUSES) map[st] = []
    for (const item of items) { if (map[item.status]) map[item.status].push(item) }
    return map
  }, [items])

  function handleDragStart({ active }) {
    setActiveItem(items.find((t) => t.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveItem(null)
    if (!over) return
    const src = active.data.current?.status
    const dst = over.id
    if (src === dst) return
    const validTargets = IA_STATUS_TRANSITIONS[src] ?? []
    if (!validTargets.includes(dst)) {
      addToast(`Không thể chuyển "${STATUS_LABELS[src]}" → "${STATUS_LABELS[dst]}"`, 'error')
      return
    }
    const item = items.find((t) => t.id === active.id)
    if (item) onStatusChange(item, dst)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={s.boardWrap}>
        {IA_STATUSES.map((status) => (
          <DroppableColumn
            key={status}
            status={status}
            items={byStatus[status] ?? []}
            onOpen={onOpen}
            isAdmin={isAdmin}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <div className={`${s.boardCard} ${s.boardCardOverlay}`}>
            <BoardCardInner item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────────

// Ô ngày hết hạn kiểu Tasks: DateBox lai (gõ tay dd/mm/yyyy + lịch, viền đỏ khi quá hạn).
// onChange nhận thẳng chuỗi 'YYYY-MM-DD' | ''.
function IaListDateField({ value, onChange, isOverdue, min }) {
  return (
    <DateBox
      value={value ? value.slice(0, 10) : ''}
      min={min || ''}
      onChange={onChange}
      className={`${s.qeDateBox} ${isOverdue ? s.qeDateBoxOverdue : ''}`}
    />
  )
}

function ListView({
  items, loading, page, pageSize,
  onOpen, isAdmin, onDelete,
  selectedIds, allSelected, someSelected, onToggleSelect, onSelectAll,
  onStatusChange, onPriorityChange, onDeadlineChange,
  sortColState, hasColFilter, onOpenColFilter,
}) {
  const getLabel   = useEnumsStore((st) => st.getLabel)
  const getOptions = useEnumsStore((st) => st.getOptions)
  const statusLabel   = (k) => getLabel('assignment_status', k, STATUS_LABELS[k] ?? k)
  const priorityLabel = (k) => getLabel('assignment_priority', k, PRIORITY_LABELS[k] ?? k)
  const priorityOpts  = getOptions('assignment_priority').length > 0
    ? getOptions('assignment_priority').map((o) => o.key)
    : ['low', 'normal', 'high', 'urgent']

  function Th({ colKey, children, w }) {
    const active = hasColFilter?.(colKey) || sortColState?.col === colKey
    return (
      <th className={s.th} style={w ? { width: w } : undefined}>
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
  return (
    <div className={s.tableWrap}>
      <div className={s.tableScrollX}>
        <table className={s.table}>
          <thead className={s.thead}>
            <tr>
              <SelectionHeaderCell allSelected={allSelected} someSelected={someSelected} onToggle={onSelectAll} className={s.thCheck} />
              <IndexHeaderCell className={s.thIndex} />
              <Th colKey="title">Tiêu đề</Th>
              <Th colKey="companyShort" w={160}>Khách hàng</Th>
              <Th colKey="startDate" w={104}>Ngày bắt đầu</Th>
              <Th colKey="deadlineDate" w={124}>Ngày kết thúc</Th>
              <Th colKey="createdAt" w={112}>Ngày tạo</Th>
              <Th colKey="status" w={132}>Trạng thái</Th>
              <Th colKey="priority" w={106}>Ưu tiên</Th>
              <Th colKey="progress" w={110}>Tiến độ</Th>
              <Th colKey="assignedToName" w={150}>Giao cho</Th>
              <Th colKey="latestComment" w={180}>Bình luận mới nhất</Th>
              <th className={`${s.th} ${s.thAction}`}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  <td className={s.tdIndex} />
                  {[280, 150, 90, 90, 90, 110, 90, 100, 130, 160, 70].map((w, j) => (
                    <td key={j} className={s.td}>
                      <div className={s.tableSkeletonBar} style={{ '--skeleton-w': `${w}px`, width: `${w}px` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={13}>
                  <div className={s.emptyBox}>
                    <div className={s.emptyIcon}><ClipboardCheck size={28} /></div>
                    <p className={s.emptyTitle}>Không có phiếu giao việc</p>
                    <p className={s.emptyText}>Thử thay đổi bộ lọc hoặc tạo phiếu mới</p>
                  </div>
                </td>
              </tr>
            ) : items.map((item, rowIndex) => {
              const overdue = isOverdue(item)
              const pct     = progressPct(item)
              return (
                <tr
                  key={item.id}
                  className={`${s.tr} ${selectedIds.has(item.id) ? s.trSelected : ''} ${overdue ? s.trOverdue : ''}`}
                  onClick={() => onOpen(item.id)}
                >
                  {/* Checkbox */}
                  <SelectionRowCell checked={selectedIds.has(item.id)} onToggle={() => onToggleSelect(item.id)} className={s.tdCheck} />
                  <IndexRowCell index={(page - 1) * pageSize + rowIndex + 1} className={s.tdIndex} />

                  {/* Tiêu đề — click ra quick view (không sửa trực tiếp) */}
                  <td className={s.td}>
                    <span className={`${s.taskTitle} ${overdue ? s.taskTitleOverdue : ''}`}>{item.title}</span>
                  </td>

                  {/* Khách hàng — ưu tiên tên viết tắt */}
                  <td className={s.td}>
                    {item.company?.shortName || item.company?.name
                      ? <span className={s.companyShort}>{item.company.shortName || item.company.name}</span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Ngày bắt đầu */}
                  <td className={s.td}>
                    {item.startDate
                      ? <span className={s.dueDateNormal}>{fmtDate(item.startDate)}</span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Ngày kết thúc — ô viền kiểu Tasks (viền đỏ khi quá hạn); admin sửa được */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <IaListDateField
                        value={item.deadlineDate ?? ''}
                        onChange={(v) => onDeadlineChange(item, v)}
                        isOverdue={overdue}
                        min={(item.startDate || item.createdAt)?.slice(0, 10) || undefined}
                      />
                    ) : item.deadlineDate ? (
                      <span className={`${s.qeDate} ${s.qeDateInteractive} ${overdue ? s.qeDateOverdue : ''}`} style={{ cursor: 'default' }}>
                        <span className={s.qeDateText}>{fmtDate(item.deadlineDate)}</span>
                      </span>
                    ) : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Ngày tạo */}
                  <td className={s.td}>
                    {item.createdAt
                      ? <span className={s.dueDateNormal}>{fmtDate(item.createdAt)}</span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Trạng thái — select màu kiểu Tasks; admin đổi được (theo bước cho phép) */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (IA_STATUS_TRANSITIONS[item.status] ?? []).length > 0 ? (
                      <select
                        value={item.status}
                        onChange={(e) => { if (e.target.value !== item.status) onStatusChange(item, e.target.value) }}
                        className={`${s.qeSelect} ${s.qeSelectStyled} ${STATUS_SELECT_CLASS[item.status] ?? ''}`}
                        title="Đổi trạng thái"
                      >
                        <option value={item.status}>{statusLabel(item.status)}</option>
                        {(IA_STATUS_TRANSITIONS[item.status] ?? []).map((st) => (
                          <option key={st} value={st}>{statusLabel(st)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.qeSelect} ${s.qeSelectStyled} ${s.qeStatic} ${STATUS_SELECT_CLASS[item.status] ?? ''}`}>
                        {statusLabel(item.status)}
                      </span>
                    )}
                  </td>

                  {/* Ưu tiên — select màu kiểu Tasks */}
                  <td className={s.td} onClick={(e) => e.stopPropagation()}>
                    {isAdmin ? (
                      <select
                        value={item.priority ?? ''}
                        onChange={(e) => onPriorityChange(item, e.target.value)}
                        className={`${s.qeSelect} ${s.qeSelectStyled} ${PRIORITY_SELECT_CLASS[item.priority] ?? ''}`}
                        title="Đổi ưu tiên"
                      >
                        {priorityOpts.map((k) => (
                          <option key={k} value={k}>{priorityLabel(k)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.qeSelect} ${s.qeSelectStyled} ${s.qeStatic} ${PRIORITY_SELECT_CLASS[item.priority] ?? ''}`}>
                        {priorityLabel(item.priority)}
                      </span>
                    )}
                  </td>

                  {/* Tiến độ */}
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
                    ) : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Giao cho — rút gọn tên 2 từ cuối (như Tasks) */}
                  <td className={s.td}>
                    {item.assignees?.length
                      ? <span className={s.assignedName} title={item.assignees.map((a) => a.name).filter(Boolean).join(', ')}>
                          {item.assignees.map((a) => shortName(a.name)).filter(Boolean).join(', ')}
                        </span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Bình luận mới nhất */}
                  <td className={s.td}>
                    {item.latestComment
                      ? <span className={s.latestComment}>{item.latestComment}</span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Hành động */}
                  <td className={s.tdAction} onClick={(e) => e.stopPropagation()}>
                    <div className={s.actionBtns}>
                      <button
                        className={s.btnActionView}
                        onClick={() => onOpen(item.id)}
                        title="Xem chi tiết"
                      >
                        <ArrowUpRight size={13} />
                      </button>
                      {isAdmin && (
                        <button
                          className={s.btnActionDelete}
                          onClick={() => onDelete(item)}
                          title="Xóa phiếu"
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

    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const FILTER_KEY = 'ia_filter_v1'
const INIT_DATES = yearMonthToDates(CUR_YEAR, CUR_MONTH)

function loadSavedFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY)) ?? {} } catch { return {} }
}
function saveFilters(obj) {
  try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(obj)) } catch (_) { /* ignore */ }
}

export default function InternalAssignments() {
  const currentUser = useAuthStore((st) => st.user)
  const addToast    = useToastStore((st) => st.toast)
  const isAdmin     = true
  const getOptions  = useEnumsStore((st) => st.getOptions)
  const loadEnums   = useEnumsStore((st) => st.load)

  const [initF] = useState(() => loadSavedFilters())

  // View
  const [view, setView] = useState(initF.view ?? 'list')

  // Filters
  const [yearFilter,      setYearFilter]      = useState(initF.yearFilter      ?? CUR_YEAR)
  const [monthFilter,     setMonthFilter]      = useState(initF.monthFilter     ?? CUR_MONTH)
  const [deadlineFrom,    setDeadlineFrom]     = useState(initF.deadlineFrom    ?? INIT_DATES.from)
  const [deadlineTo,      setDeadlineTo]       = useState(initF.deadlineTo      ?? INIT_DATES.to)
  const [sortValue,       setSortValue]        = useState(initF.sortValue       ?? 'created_at:desc')
  const [searchInput,     setSearchInput]      = useState(initF.searchInput     ?? '')
  const [search,          setSearch]           = useState(initF.searchInput     ?? '')
  const [filterStatus,    setFilterStatus]     = useState(() => Array.isArray(initF.filterStatus)   ? initF.filterStatus   : [])
  const [filterPriority,  setFilterPriority]   = useState(() => Array.isArray(initF.filterPriority) ? initF.filterPriority : [])
  const [filterAssignees, setFilterAssignees]  = useState(initF.filterAssignees ?? [])
  const [filterMyStatus,  setFilterMyStatus]   = useState(initF.filterMyStatus  ?? '')

  // Column-header filter (docs/018) — client-side over the loaded set
  const [colFilters, setColFilters]     = useState({})
  const [sortColState, setSortColState] = useState({ col: null, dir: 'asc' })
  const [filterPopup, setFilterPopup]   = useState(null)

  // Pagination
  const [pageSize, setPageSize] = useState(initF.pageSize ?? 20)
  const [page,     setPage]     = useState(1)

  // Data (items/pagination/loading được derive từ React Query bên dưới)
  const [stats,          setStats]          = useState({})
  const { data: staffList = [] } = useStaffOptions()  // React Query — cache dùng chung
  const queryClient = useQueryClient()
  const [availableYears, setAvailableYears] = useState([])

  // UI
  const [selectedId,    setSelectedId]    = useState(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [showFilters,   setShowFilters]   = useState(false)
  const filterBarRef = useRef(null)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [refreshKey,    setRefreshKey]    = useState(0)

  // Bulk selection
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [bulkDeleting,          setBulkDeleting]          = useState(false)

  useEffect(() => {
    if (!showFilters) return undefined
    const handlePointerDown = (event) => {
      if (!filterBarRef.current?.contains(event.target)) setShowFilters(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowFilters(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showFilters])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter changes
  useEffect(() => {
    setPage(1)
  }, [filterStatus, filterPriority, filterAssignees, filterMyStatus, deadlineFrom, deadlineTo, pageSize, sortValue])

  // Load years + enums (staff list đã chuyển sang React Query hook)
  useEffect(() => {
    loadEnums()
    api.getYears()
      .then((years) => {
        setAvailableYears(years)
        if (years.length > 0 && !years.includes(parseInt(CUR_YEAR, 10))) {
          const firstYear = String(years[0])
          setYearFilter(firstYear)
          const { from, to } = yearMonthToDates(firstYear, '')
          setDeadlineFrom(from)
          setDeadlineTo(to)
        }
      })
      .catch(() => {
        const y = parseInt(CUR_YEAR, 10)
        setAvailableYears([y + 1, y, y - 1])
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist filters
  useEffect(() => {
    saveFilters({
      view, yearFilter, monthFilter, deadlineFrom, deadlineTo,
      sortValue, searchInput, filterStatus, filterPriority,
      filterAssignees, filterMyStatus, pageSize,
    })
  }, [view, yearFilter, monthFilter, deadlineFrom, deadlineTo, sortValue, searchInput, filterStatus, filterPriority, filterAssignees, filterMyStatus, pageSize])

  useEffect(() => {
    let cancelled = false
    api.getStats({
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo:   deadlineTo   || undefined,
    })
      .then((data) => { if (!cancelled) setStats(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [deadlineFrom, deadlineTo, refreshKey])

  // ── Assignments list — React Query (cache theo bộ lọc + dedup + giữ data cũ khi đổi filter) ──
  // Tải working set 1 lần; lọc/sắp/phân trang phía client (docs/018).
  const listParams = useMemo(() => {
    const [sortBy, sortDir] = sortValue.split(':')
    const params = {
      page: 1,
      limit: 200,
      search: search || undefined,
      deadlineFrom: deadlineFrom || undefined,
      deadlineTo:   deadlineTo   || undefined,
      sortBy,
      sortDir,
    }
    if (filterStatus.length)    params.status   = filterStatus.join(',')
    if (filterPriority.length)  params.priority = filterPriority.join(',')
    if (isAdmin && filterAssignees.length) params.assigneeIds = filterAssignees.join(',')
    if (!isAdmin && filterMyStatus)        params.myStatus    = filterMyStatus
    return params
  }, [search, sortValue, deadlineFrom, deadlineTo, filterStatus, filterPriority, filterAssignees, filterMyStatus, isAdmin])

  const listQuery = useQuery({
    queryKey: ['assignments', 'list', listParams],
    queryFn: () => api.listAssignments(listParams),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
  const items   = listQuery.data?.items ?? EMPTY_ITEMS
  const loading = listQuery.isFetching

  // refresh stats (refreshKey) + làm mới cache danh sách
  function refresh() {
    setRefreshKey((k) => k + 1)
    queryClient.invalidateQueries({ queryKey: ['assignments', 'list'] })
  }

  // ── Column-header filter: handlers + client-side displayed/pagination ─────────
  function hasColFilter(colKey) {
    const f = colFilters[colKey]
    if (f == null) return false
    const t = iaColFilterType(colKey)
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

  const displayed = useMemo(() => {
    let result = [...items]
    for (const [colKey, fv] of Object.entries(colFilters)) {
      const ft = iaColFilterType(colKey)
      if (ft === 'enum') {
        if (fv instanceof Set && fv.size > 0) result = result.filter((r) => fv.has(iaColDisplayLabel(r, colKey)))
      } else if (ft === 'text') {
        if (typeof fv === 'string' && fv.trim()) {
          const q = fv.toLowerCase()
          result = result.filter((r) => iaColDisplayLabel(r, colKey).toLowerCase().includes(q))
        }
      } else if (ft === 'dateRange') {
        if (fv && (fv.from || fv.to)) {
          result = result.filter((r) => {
            const raw = iaColRawDate(r, colKey); if (!raw) return false
            const d = String(raw).substring(0, 10)
            if (fv.from && d < fv.from) return false
            if (fv.to   && d > fv.to)   return false
            return true
          })
        }
      } else if (ft === 'numberRange') {
        if (fv && (fv.min !== '' || fv.max !== '')) {
          result = result.filter((r) => {
            const num = progressPct(r)
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
        const ak = iaColSortKey(a, sortColState.col)
        const bk = iaColSortKey(b, sortColState.col)
        if (typeof ak === 'number' && typeof bk === 'number') return sortColState.dir === 'asc' ? ak - bk : bk - ak
        const cmp = String(ak).localeCompare(String(bk), 'vi', { numeric: true })
        return sortColState.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [items, colFilters, sortColState])

  const clientTotalPages = Math.max(1, Math.ceil(displayed.length / pageSize))
  const safePage = Math.min(page, clientTotalPages)
  const pageRows = displayed.slice((safePage - 1) * pageSize, safePage * pageSize)
  const clientPagination = { total: displayed.length, totalPages: clientTotalPages, page: safePage }
  const paginationFrom = clientPagination.total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const paginationTo = Math.min(safePage * pageSize, clientPagination.total)
  const footerDetails = [
    colFilterCount > 0 ? `${colFilterCount} lọc cột` : '',
    hasColSort ? 'đang sắp xếp' : '',
  ].filter(Boolean).join(' · ')

  const {
    selectedIds,
    setSelectedIds,
    selectedCount,
    allSelected,
    someSelected,
    toggle: toggleSelect,
    toggleAll: selectAll,
    clear: clearSelection,
  } = useRowSelection({ rows: pageRows })

  async function bulkClose() {
    let done = 0
    for (const id of selectedIds) {
      const item = items.find((t) => t.id === id)
      if (!item || item.status !== 'active') continue
      try { await api.closeAssignment(id); done++ } catch { /* skip */ }
    }
    if (done > 0) addToast(`Đã hoàn thành ${done} phiếu`, 'success')
    setSelectedIds(new Set())
    if (done > 0) refresh()
  }

  async function bulkDeleteConfirmed() {
    setBulkDeleting(true)
    let done = 0
    const ids = [...selectedIds]
    for (const id of ids) {
      try { await api.deleteAssignment(id); done++ } catch { /* skip */ }
    }
    addToast(`Đã xóa ${done} phiếu`, done > 0 ? 'success' : 'error')
    setSelectedIds(new Set())
    setShowBulkDeleteConfirm(false)
    setBulkDeleting(false)
    if (done > 0) refresh()
  }

  // Inline quick-edit handlers (admin only)
  async function handleStatusChange(item, newStatus) {
    try {
      if (newStatus === 'active') {
        await api.sendAssignment(item.id)
      } else if (newStatus === 'done') {
        await api.closeAssignment(item.id)
      } else if (newStatus === 'cancelled') {
        await api.cancelAssignment(item.id)
      }
      addToast(`Đã cập nhật trạng thái "${item.title}"`, 'success')
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể đổi trạng thái', 'error')
    }
  }

  async function handlePriorityChange(item, newPriority) {
    try {
      await api.updateAssignment(item.id, { priority: newPriority })
      addToast(`Đã cập nhật ưu tiên "${item.title}"`, 'success')
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể đổi ưu tiên', 'error')
    }
  }

  async function handleDeadlineChange(item, value) {
    if ((value || '') === (item.deadlineDate ? item.deadlineDate.slice(0, 10) : '')) return
    try {
      await api.updateAssignment(item.id, { deadlineDate: value || null })
      addToast(`Đã cập nhật ngày hết hạn "${item.title}"`, 'success')
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể đổi ngày hết hạn', 'error')
    }
  }


  // Date filter handlers
  function handleYearChange(year) {
    setYearFilter(year)
    const { from, to } = yearMonthToDates(year, year ? monthFilter : '')
    setDeadlineFrom(from)
    setDeadlineTo(to)
  }

  function handleMonthChange(month) {
    setMonthFilter(month)
    if (!yearFilter) return
    const { from, to } = yearMonthToDates(yearFilter, month)
    setDeadlineFrom(from)
    setDeadlineTo(to)
  }

  function setPeriod(year, month) {
    setYearFilter(year)
    setMonthFilter(month)
    const { from, to } = yearMonthToDates(year, month)
    setDeadlineFrom(from)
    setDeadlineTo(to)
    setPage(1)
  }

  function applyPeriodPreset(key) {
    if (key === 'tm') return setPeriod(CUR_YEAR, CUR_MONTH)
    if (key === 'ty') return setPeriod(CUR_YEAR, '')
    if (key === 'all') return setPeriod('', '')
    if (key === 'lm') {
      let year = parseInt(CUR_YEAR, 10)
      let month = parseInt(CUR_MONTH, 10) - 1
      if (month < 1) { month = 12; year -= 1 }
      return setPeriod(String(year), String(month))
    }
  }

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setFilterStatus([]); setFilterPriority([])
    setFilterAssignees([]); setFilterMyStatus('')
    setColFilters({}); setSortColState({ col: null, dir: 'asc' })
    setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH)
    setDeadlineFrom(INIT_DATES.from); setDeadlineTo(INIT_DATES.to)
    setSortValue('created_at:desc')
    setPageSize(20); setPage(1)
    try { sessionStorage.removeItem(FILTER_KEY) } catch (_) { /* ignore */ }
  }

  const activeFilterCount = [search, filterMyStatus].filter(Boolean).length
    + filterStatus.length + filterPriority.length + filterAssignees.length

  // Board drag-drop status change (admin only)
  async function handleBoardStatusChange(item, newStatus) {
    try {
      if (newStatus === 'active') {
        await api.sendAssignment(item.id)
        addToast(`Đã gửi phiếu "${item.title}"`, 'success')
      } else if (newStatus === 'done') {
        await api.closeAssignment(item.id)
        addToast(`Đã đóng phiếu "${item.title}"`, 'success')
      } else if (newStatus === 'cancelled') {
        await api.cancelAssignment(item.id)
        addToast(`Đã hủy phiếu "${item.title}"`, 'success')
      }
      refresh()
    } catch (err) {
      addToast(err?.response?.data?.error?.message ?? 'Không thể thay đổi trạng thái', 'error')
    }
  }

  // Stats clickable filter (multi-toggle)
  function handleFilterStatus(key) {
    setFilterStatus((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
    setPage(1)
  }

  // Handlers
  function handleCreated(item) {
    setShowCreate(false)
    addToast(`Đã tạo phiếu "${item.title}"`, 'success')
    refresh()
    setSelectedId(item.id)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.deleteAssignment(deleteTarget.id)
      addToast(`Đã xóa "${deleteTarget.title}"`, 'success')
      if (selectedId === deleteTarget.id) setSelectedId(null)
      setDeleteTarget(null)
      refresh()
    } catch (err) {
      addToast(err.response?.data?.error?.message ?? 'Không thể xóa phiếu', 'error')
    } finally {
      setDeleting(false)
    }
  }

  // Stats row data
  const adminStatsItems = [
    { key: '',          label: 'Tất cả',        value: (stats.draft ?? 0) + (stats.active ?? 0) + (stats.done ?? 0) + (stats.cancelled ?? 0), css: '' },
    { key: 'draft',     label: 'Nháp',          value: stats.draft     ?? 0, css: '' },
    { key: 'active',    label: 'Đang thực hiện', value: stats.active   ?? 0, css: s.statBlue },
    { key: 'done',      label: 'Hoàn thành',     value: stats.done     ?? 0, css: s.statGreen },
    { key: 'cancelled', label: 'Đã hủy',         value: stats.cancelled ?? 0, css: s.statRed },
  ]

  const staffTotal = (stats.pending ?? 0) + (stats.accepted ?? 0) + (stats.inProgress ?? 0) + (stats.done ?? 0) + (stats.rejected ?? 0)
  const staffStatsItems = [
    { key: '',            label: 'Tất cả',         value: staffTotal,            css: '' },
    { key: 'pending',     label: 'Chờ tiếp nhận',  value: stats.pending    ?? 0, css: '' },
    { key: 'accepted',    label: 'Đã tiếp nhận',   value: stats.accepted   ?? 0, css: s.statBlue },
    { key: 'in_progress', label: 'Đang làm',       value: stats.inProgress ?? 0, css: s.statOrange },
    { key: 'done',        label: 'Hoàn thành',     value: stats.done       ?? 0, css: s.statGreen },
    { key: 'rejected',    label: 'Từ chối',        value: stats.rejected   ?? 0, css: s.statRed },
  ]

  const statsItems   = isAdmin ? adminStatsItems : staffStatsItems
  const hasActiveFilterChips = yearFilter || monthFilter || filterStatus.length > 0
    || filterPriority.length > 0 || filterAssignees.length > 0 || filterMyStatus || search
  const filterChips = hasActiveFilterChips ? (
    <div className={s.filterChipsRow}>
      {(yearFilter || monthFilter) && (
        <span className={s.filterChip}>
          {monthFilter && yearFilter ? `T${monthFilter}/${yearFilter}` : yearFilter ? `Năm ${yearFilter}` : `T${monthFilter}`}
          <button className={s.filterChipRemove} onClick={() => { setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH); const { from, to } = yearMonthToDates(CUR_YEAR, CUR_MONTH); setDeadlineFrom(from); setDeadlineTo(to); setPage(1) }}>×</button>
        </span>
      )}
      {filterStatus.map((status) => (
        <span key={status} className={s.filterChip}>
          {STATUS_LABELS[status] ?? status}
          <button className={s.filterChipRemove} onClick={() => { setFilterStatus((current) => current.filter((value) => value !== status)); setPage(1) }}>×</button>
        </span>
      ))}
      {!isAdmin && filterMyStatus && (
        <span className={s.filterChip}>
          {ASSIGNEE_STATUS_LABELS[filterMyStatus]}
          <button className={s.filterChipRemove} onClick={() => { setFilterMyStatus(''); setPage(1) }}>×</button>
        </span>
      )}
      {filterPriority.map((priority) => (
        <span key={priority} className={s.filterChip}>
          {PRIORITY_LABELS[priority] ?? priority}
          <button className={s.filterChipRemove} onClick={() => { setFilterPriority((current) => current.filter((value) => value !== priority)); setPage(1) }}>×</button>
        </span>
      ))}
      {isAdmin && filterAssignees.map((id) => (
        <span key={id} className={s.filterChip}>
          NV: {staffList.find((user) => user.id === id)?.name ?? '?'}
          <button className={s.filterChipRemove} onClick={() => { setFilterAssignees((current) => current.filter((value) => value !== id)); setPage(1) }}>×</button>
        </span>
      ))}
      {search && (
        <span className={s.filterChip}>
          &ldquo;{search}&rdquo;
          <button className={s.filterChipRemove} onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}>×</button>
        </span>
      )}
    </div>
  ) : null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout footer={view === 'list' ? (
      <PaginationFooter
        total={clientPagination.total}
        from={paginationFrom}
        to={paginationTo}
        itemLabel="phiếu"
        page={safePage}
        pageSize={pageSize}
        totalPages={clientPagination.totalPages}
        loading={loading}
        details={footerDetails}
        onPageChange={(nextPage) => { setPage(nextPage); clearSelection() }}
        onPageSizeChange={(nextSize) => { setPageSize(nextSize); setPage(1); clearSelection() }}
      />
    ) : undefined}>
      <div className={s.page}>

        {/* ── Page title + tabs ── */}
        <div className={s.pageHeader}>
          <div className={s.pageHeaderNav}>
          <InternalNavTabs actions={(
            <>
              <div className={s.viewSwitch}>
                <button
                  className={`${s.viewBtn} ${view === 'list' ? s.viewBtnActive : ''}`}
                  onClick={() => setView('list')}
                >
                  <List size={13} /> Danh sách
                </button>
                <button
                  className={`${s.viewBtn} ${view === 'board' ? s.viewBtnActive : ''}`}
                  onClick={() => setView('board')}
                >
                  <Columns size={13} /> Board
                </button>
              </div>
              <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Tạo phiếu
              </button>
            </>
          )} />
          </div>
        </div>

        {/* ── Filter panel ── */}
        <div className={s.filterBar} ref={filterBarRef}>
          <div className={s.filterBarHead}>
            <button
              type="button"
              className={`${s.filterBarTitle} ${showFilters ? s.filterBarTitleOpen : ''}`}
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              aria-controls="internal-assignment-filters"
            >
              <Filter size={12} />
              Bộ lọc
              {activeFilterCount > 0 && (
                <span className={s.filterActiveBadge}>{activeFilterCount} đang bật</span>
              )}
            </button>
            <div className={s.headStats}>
              <span className={s.headStatsLabel}>Thống kê</span>
              {statsItems.flatMap((item, index) => [
                index > 0 ? <span key={`hd${index}`} className={s.statDivider} /> : null,
                <button
                  type="button"
                  key={item.key}
                  className={`${s.statItem} ${(item.key ? filterStatus.includes(item.key) : filterStatus.length === 0) ? s.statItemActive : ''}`}
                  onClick={() => handleFilterStatus(item.key)}
                >
                  <span className={`${s.statValue} ${item.css}`}>{item.value}</span>
                  <span className={s.statLabel}>{item.label}</span>
                </button>,
              ]).filter(Boolean)}
            </div>
            <button className={s.filterReset} onClick={resetFilters}>
              <RotateCcw size={11} /> Đặt lại
            </button>
          </div>

          <div className={s.quickFilterArea}>
          <div className={s.quickFilterGrid}>
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Kỳ</label>
              <PeriodPicker
                year={yearFilter}
                month={monthFilter}
                from={deadlineFrom}
                to={deadlineTo}
                availableYears={availableYears}
                onYear={handleYearChange}
                onMonth={handleMonthChange}
                onFrom={(v) => { setDeadlineFrom(v); setPage(1) }}
                onTo={(v) => { setDeadlineTo(v); setPage(1) }}
                onPreset={applyPeriodPreset}
              />
            </div>
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Trạng thái</label>
              <MultiSelect
                placeholder="Tất cả"
                options={getOptions('assignment_status').length > 0
                  ? getOptions('assignment_status')
                  : IA_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key] }))}
                selected={filterStatus}
                onChange={(value) => { setFilterStatus(value); setPage(1) }}
              />
            </div>
            <div className={`${s.filterGroup} ${s.quickSearch}`}>
              <label className={s.filterLabel}>Từ khoá</label>
              <div className={s.filterSearchWrap}>
                <Search size={12} className={s.filterSearchIcon} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className={`${s.filterInput} ${s.filterInputWithIcon}`}
                  placeholder="Tiêu đề phiếu..."
                />
              </div>
            </div>
          </div>
          {filterChips}

          {showFilters && (
          <div id="internal-assignment-filters" className={s.filterPopover}>
            <div className={s.filterPopoverHead}>
              <span>Bộ lọc công việc nội bộ</span>
              {activeFilterCount > 0 && <span>{activeFilterCount} điều kiện</span>}
            </div>
            <div className={s.filterGrid}>

            {/* SẮP XẾP */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Sắp xếp</label>
              <select value={sortValue} onChange={(e) => setSortValue(e.target.value)} className={s.filterSelect}>
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* TRẠNG THÁI CỦA TÔI (staff only) */}
            {!isAdmin && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Trạng thái của tôi</label>
                <select
                  className={s.filterSelect}
                  value={filterMyStatus}
                  onChange={(e) => { setFilterMyStatus(e.target.value); setPage(1) }}
                >
                  <option value="">Tất cả</option>
                  <option value="pending">Chờ tiếp nhận</option>
                  <option value="accepted">Đã tiếp nhận</option>
                  <option value="in_progress">Đang làm</option>
                  <option value="done">Hoàn thành</option>
                  <option value="rejected">Từ chối</option>
                </select>
              </div>
            )}

            {/* ƯU TIÊN — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Ưu tiên</label>
              <MultiSelect
                placeholder="Tất cả"
                options={getOptions('assignment_priority').length > 0
                  ? getOptions('assignment_priority')
                  : ['low', 'normal', 'high', 'urgent'].map((k) => ({ key: k, label: PRIORITY_LABELS[k] }))}
                selected={filterPriority}
                onChange={(v) => { setFilterPriority(v); setPage(1) }}
              />
            </div>

            {/* NGƯỜI THỰC HIỆN (admin only) */}
            {isAdmin && staffList.length > 0 && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Người thực hiện</label>
                <MultiSelect
                  placeholder="Tất cả"
                  options={staffList}
                  selected={filterAssignees}
                  onChange={(v) => { setFilterAssignees(v); setPage(1) }}
                />
              </div>
            )}

            </div>
          </div>
          )}

          </div>

        </div>

        {/* ── Bulk action bar ── */}
        <BulkActionBar count={selectedCount} className={s.bulkBar}>
            <button className={s.btnGhost} onClick={bulkClose}>
              <Check size={13} /> Hoàn thành tất cả
            </button>
            <button
              className={`${s.btnGhost} ${s.btnDangerText}`}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <Trash2 size={13} /> Xóa đã chọn
            </button>
            <button className={s.btnGhost} onClick={clearSelection}>
              Bỏ chọn
            </button>
        </BulkActionBar>

        {/* ── Content area ── */}
        {loading && view !== 'list' && (
          <div className={s.loadingBox}>
            <div className={s.spinner} />
            Đang tải...
          </div>
        )}

        {view === 'list' && (
          <ListView
            items={pageRows}
            loading={loading}
            page={safePage}
            pageSize={pageSize}
            onOpen={setSelectedId}
            isAdmin={isAdmin}
            onDelete={setDeleteTarget}
            selectedIds={selectedIds}
            allSelected={allSelected}
            someSelected={someSelected}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            onDeadlineChange={handleDeadlineChange}
            sortColState={sortColState}
            hasColFilter={hasColFilter}
            onOpenColFilter={openColFilter}
          />
        )}

        {/* Column-header filter dropdown (docs/018) */}
        {filterPopup && view === 'list' && (
          <ColumnFilterDropdown
            colKey={filterPopup.colKey}
            filterType={iaColFilterType(filterPopup.colKey)}
            allRows={items}
            getDisplayLabel={iaColDisplayLabel}
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
            items={items}
            onOpen={setSelectedId}
            onStatusChange={handleBoardStatusChange}
            isAdmin={isAdmin}
          />
        )}

      </div>

      {/* ── Detail panel ── */}
      {selectedId && (
        <AssignmentDetailPanel
          assignmentId={selectedId}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onUpdate={refresh}
        />
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <CreateEditAssignmentModal
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}

      {/* ── Delete confirmation ── */}
      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xóa phiếu giao việc"
        message={deleteTarget ? <>Bạn có chắc chắn muốn xóa phiếu <strong>“{deleteTarget.title}”</strong>?</> : null}
        loading={deleting}
        onCancel={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* ── Bulk delete confirmation ── */}
      <DeleteConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Xóa ${selectedIds.size} phiếu giao việc`}
        message={<>Bạn có chắc chắn muốn xóa <strong>{selectedIds.size}</strong> phiếu đã chọn?</>}
        confirmLabel={`Xóa ${selectedIds.size} mục`}
        loading={bulkDeleting}
        onCancel={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}
        onConfirm={bulkDeleteConfirmed}
      />
    </AppLayout>
  )
}
