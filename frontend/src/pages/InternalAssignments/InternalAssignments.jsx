import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Plus, Search, ClipboardCheck, Loader2, Check,
  List, Columns, Filter, RotateCcw,
  ChevronDown, Trash2, Eye, X,
} from 'lucide-react'
import {
  DndContext, DragOverlay,
  useSensor, useSensors, PointerSensor,
  useDraggable, useDroppable, closestCenter,
} from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { useEnumsStore } from '../../hooks/useEnums'
import * as api from '../../api/internalAssignments'
import { listUserOptions } from '../../api/users'
import AssignmentDetailPanel from './AssignmentDetailPanel'
import CreateEditAssignmentModal from './CreateEditAssignmentModal'
import InternalNavTabs from './InternalNavTabs'
import ColumnFilterDropdown from '../../components/ui/ColumnFilterDropdown'
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
  title: 'text', priority: 'enum', startDate: 'dateRange',
  deadlineDate: 'dateRange', progress: 'numberRange', status: 'enum',
}
function iaColFilterType(k) { return IA_COL_TYPE[k] ?? 'text' }
function iaColRawDate(it, k) { return k === 'startDate' ? it.startDate : it.deadlineDate }
function iaColDisplayLabel(it, k) {
  switch (k) {
    case 'status':       return STATUS_LABELS[it.status] ?? it.status ?? '(Trống)'
    case 'priority':     return PRIORITY_LABELS[it.priority] ?? it.priority ?? '(Trống)'
    case 'startDate':    return it.startDate    ? fmtDate(it.startDate)    : '(Trống)'
    case 'deadlineDate': return it.deadlineDate ? fmtDate(it.deadlineDate) : '(Trống)'
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
  draft:  ['active', 'cancelled'],
  active: ['done', 'cancelled'],
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

// ── FilterDateField ───────────────────────────────────────────────────────────

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
    <div className={s.boardCol}>
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

function ListView({
  items, loading, pagination, page, pageSize,
  onPageChange, onPageSizeChange, onOpen, isAdmin, onDelete, currentUserId,
  selectedIds, onToggleSelect, onSelectAll,
  onStatusChange, onPriorityChange,
  sortColState, hasColFilter, onOpenColFilter, colFilterCount = 0, hasColSort = false,
}) {
  const allSelected = items.length > 0 && items.every((t) => selectedIds.has(t.id))

  function Th({ colKey, children }) {
    const active = hasColFilter?.(colKey) || sortColState?.col === colKey
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
              <th className={s.th}>Người thực hiện</th>
              <Th colKey="priority">Ưu tiên</Th>
              <Th colKey="startDate">Ngày bắt đầu</Th>
              <Th colKey="deadlineDate">Hạn chót</Th>
              <Th colKey="progress">Tiến độ</Th>
              <Th colKey="status">Trạng thái</Th>
              <th className={`${s.th} ${s.thAction}`}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className={s.tr}>
                  <td className={s.tdCheck} />
                  {[280, 180, 90, 90, 100, 90, 110, 70].map((w, j) => (
                    <td key={j} className={s.td}>
                      <div className={s.tableSkeletonBar} style={{ '--skeleton-w': `${w}px`, width: `${w}px` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9}>
                  <div className={s.emptyBox}>
                    <div className={s.emptyIcon}><ClipboardCheck size={28} /></div>
                    <p className={s.emptyTitle}>Không có phiếu giao việc</p>
                    <p className={s.emptyText}>Thử thay đổi bộ lọc hoặc tạo phiếu mới</p>
                  </div>
                </td>
              </tr>
            ) : items.map((item) => {
              const overdue = isOverdue(item)
              const pct     = progressPct(item)
              return (
                <tr
                  key={item.id}
                  className={`${s.tr} ${selectedIds.has(item.id) ? s.trSelected : ''} ${overdue ? s.trOverdue : ''}`}
                  onClick={() => onOpen(item.id)}
                >
                  {/* Checkbox */}
                  <td className={s.tdCheck} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggleSelect(item.id)}
                    />
                  </td>

                  {/* Tiêu đề */}
                  <td className={s.td}>
                    <div className={`${s.taskTitle} ${overdue ? s.taskTitleOverdue : ''}`}>
                      {item.title}
                    </div>
                    <div className={s.taskMeta}>
                      {item.company ? item.company.name : <span className={s.internalBadge}>Công việc nội bộ</span>}
                    </div>
                  </td>

                  {/* Người thực hiện */}
                  <td className={s.td}>
                    <div className={s.assigneesCell}>
                      {item.assignees?.slice(0, 3).map((a) => (
                        <span
                          key={a.userId}
                          className={`${s.assigneeChip} ${ASSIGNEE_STATUS_CSS[a.status]}`}
                          title={`${a.name} — ${ASSIGNEE_STATUS_LABELS[a.status]}`}
                        >
                          {a.name}
                        </span>
                      ))}
                      {(item.assignees?.length ?? 0) > 3 && (
                        <span className={`${s.assigneeChip} ${s.chipPending}`}>
                          +{item.assignees.length - 3}
                        </span>
                      )}
                      {!item.assignees?.length && <span className={s.mutedDash}>—</span>}
                    </div>
                  </td>

                  {/* Ưu tiên — quick edit (admin) */}
                  <td className={s.td}>
                    {isAdmin ? (
                      <select
                        value={item.priority}
                        onChange={(e) => { if (e.target.value !== item.priority) onPriorityChange(item, e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        className={`${s.qeSelect} ${s.qeSelectStyled} ${PRIORITY_SELECT_CLASS[item.priority] ?? ''}`}
                        title="Đổi ưu tiên"
                      >
                        {['low', 'normal', 'high', 'urgent'].map((p) => (
                          <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>
                        {PRIORITY_LABELS[item.priority]}
                      </span>
                    )}
                  </td>

                  {/* Ngày bắt đầu */}
                  <td className={s.td}>
                    {item.startDate
                      ? <span className={s.dueDateNormal}>{fmtDate(item.startDate)}</span>
                      : <span className={s.mutedDash}>—</span>}
                  </td>

                  {/* Hạn chót */}
                  <td className={s.td}>
                    {item.deadlineDate ? (
                      <span className={overdue ? s.dueDateOverdue : s.dueDateNormal}>
                        {fmtDate(item.deadlineDate)}
                        {overdue ? ' ⚠' : ''}
                      </span>
                    ) : <span className={s.mutedDash}>—</span>}
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

                  {/* Trạng thái — quick edit (admin) */}
                  <td className={s.td}>
                    {isAdmin ? (
                      <select
                        value={item.status}
                        onChange={(e) => { if (e.target.value !== item.status) onStatusChange(item, e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        className={`${s.qeSelect} ${s.qeSelectStyled} ${STATUS_SELECT_CLASS[item.status] ?? ''}`}
                        title="Đổi trạng thái"
                      >
                        <option value={item.status}>{STATUS_LABELS[item.status]}</option>
                        {(IA_STATUS_TRANSITIONS[item.status] ?? []).map((st) => (
                          <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    )}
                  </td>

                  {/* Hành động */}
                  <td className={s.tdAction} onClick={(e) => e.stopPropagation()}>
                    <div className={s.actionBtns}>
                      <button
                        className={s.btnActionView}
                        onClick={() => onOpen(item.id)}
                        title="Xem chi tiết"
                      >
                        <Eye size={13} />
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

      {/* Pagination */}
      <div className={s.pagination}>
        <div className={s.paginationLeft}>
          <span className={s.paginationInfo}>
            {loading ? '...' : `${from}–${to} / ${pagination.total} phiếu`}
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

  // Data
  const [items,          setItems]          = useState([])
  const [pagination,     setPagination]     = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading,        setLoading]        = useState(true)
  const [stats,          setStats]          = useState({})
  const [staffList,      setStaffList]      = useState([])
  const [availableYears, setAvailableYears] = useState([])

  // UI
  const [selectedId,    setSelectedId]    = useState(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [deleteTarget,  setDeleteTarget]  = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [refreshKey,    setRefreshKey]    = useState(0)

  // Bulk selection
  const [selectedIds,          setSelectedIds]          = useState(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [bulkDeleting,          setBulkDeleting]          = useState(false)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter changes
  useEffect(() => {
    setPage(1)
  }, [filterStatus, filterPriority, filterAssignees, filterMyStatus, deadlineFrom, deadlineTo, pageSize, sortValue])

  // Load staff list + years + enums
  useEffect(() => {
    loadEnums()
    listUserOptions({ status: 'active' }).then(({ users: u }) => setStaffList(u)).catch(() => {})
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

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const [sortBy, sortDir] = sortValue.split(':')
    const params = {
      // Load the working set once; list filters/sorts/paginates client-side (docs/018)
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
    api.listAssignments(params)
      .then((result) => {
        if (cancelled) return
        setItems(result.items)
        setPagination(result.pagination)
      })
      .catch(() => { if (!cancelled) setItems([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [search, view, sortValue, deadlineFrom, deadlineTo, filterStatus, filterPriority, filterAssignees, filterMyStatus, isAdmin, refreshKey])

  function refresh() { setRefreshKey((k) => k + 1) }

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

  // Bulk selection helpers
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Page title + tabs ── */}
        <div>
          <h1 className={s.pageTitle}>Công việc nội bộ</h1>
          <InternalNavTabs />
        </div>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.toolbarLeft} />
          <div className={s.toolbarRight}>
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
          </div>
        </div>

        {/* ── Filter panel ── */}
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
                value={deadlineFrom}
                onChange={(e) => { setDeadlineFrom(e.target.value); setPage(1) }}
              />
            </div>

            {/* ĐẾN NGÀY */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Đến ngày</label>
              <FilterDateField
                value={deadlineTo}
                onChange={(e) => { setDeadlineTo(e.target.value); setPage(1) }}
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
                  placeholder="Tiêu đề phiếu..."
                />
              </div>
            </div>

            {/* TRẠNG THÁI — multi-select */}
            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Trạng thái</label>
              <MultiSelect
                placeholder="Tất cả"
                options={getOptions('assignment_status').length > 0
                  ? getOptions('assignment_status')
                  : [
                    { key: 'draft',     label: 'Nháp' },
                    { key: 'active',    label: 'Đang thực hiện' },
                    { key: 'done',      label: 'Hoàn thành' },
                    { key: 'cancelled', label: 'Đã hủy' },
                  ]}
                selected={filterStatus}
                onChange={(v) => { setFilterStatus(v); setPage(1) }}
              />
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

          {/* ── Active filter chips ── */}
          {(yearFilter || monthFilter || filterStatus.length > 0 || filterPriority.length > 0 || filterAssignees.length > 0 || filterMyStatus || search) && (
            <div className={s.filterChipsRow}>
              {(yearFilter || monthFilter) && (
                <span className={s.filterChip}>
                  {monthFilter && yearFilter ? `T${monthFilter}/${yearFilter}` : yearFilter ? `Năm ${yearFilter}` : `T${monthFilter}`}
                  <button className={s.filterChipRemove} onClick={() => { setYearFilter(CUR_YEAR); setMonthFilter(CUR_MONTH); const { from, to } = yearMonthToDates(CUR_YEAR, CUR_MONTH); setDeadlineFrom(from); setDeadlineTo(to); setPage(1) }}>×</button>
                </span>
              )}
              {filterStatus.map((st) => (
                <span key={st} className={s.filterChip}>
                  {STATUS_LABELS[st] ?? st}
                  <button className={s.filterChipRemove} onClick={() => { setFilterStatus((prev) => prev.filter((x) => x !== st)); setPage(1) }}>×</button>
                </span>
              ))}
              {!isAdmin && filterMyStatus && (
                <span className={s.filterChip}>
                  {ASSIGNEE_STATUS_LABELS[filterMyStatus]}
                  <button className={s.filterChipRemove} onClick={() => { setFilterMyStatus(''); setPage(1) }}>×</button>
                </span>
              )}
              {filterPriority.map((pr) => (
                <span key={pr} className={s.filterChip}>
                  {PRIORITY_LABELS[pr] ?? pr}
                  <button className={s.filterChipRemove} onClick={() => { setFilterPriority((prev) => prev.filter((x) => x !== pr)); setPage(1) }}>×</button>
                </span>
              ))}
              {isAdmin && filterAssignees.map((id) => (
                <span key={id} className={s.filterChip}>
                  NV: {staffList.find((u) => u.id === id)?.name ?? '?'}
                  <button className={s.filterChipRemove} onClick={() => { setFilterAssignees((prev) => prev.filter((x) => x !== id)); setPage(1) }}>×</button>
                </span>
              ))}
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
            {statsItems.flatMap((item, i) => [
              i > 0 ? <span key={`d${i}`} className={s.statDivider} /> : null,
              <div
                key={item.key}
                className={`${s.statItem} ${filterStatus.includes(item.key) ? s.statItemActive : ''}`}
                onClick={() => handleFilterStatus(item.key)}
              >
                <span className={`${s.statValue} ${item.css}`}>{item.value}</span>
                <span className={s.statLabel}>{item.label}</span>
              </div>,
            ]).filter(Boolean)}
          </div>
        </div>

        {/* ── Bulk action bar ── */}
        {selectedIds.size > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkCount}>{selectedIds.size} đã chọn</span>
            <span className={s.bulkDivider} />
            <button className={s.btnGhost} onClick={bulkClose}>
              <Check size={13} /> Hoàn thành tất cả
            </button>
            <button
              className={`${s.btnGhost} ${s.btnDangerText}`}
              onClick={() => setShowBulkDeleteConfirm(true)}
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
            items={pageRows}
            loading={loading}
            pagination={clientPagination}
            page={safePage}
            pageSize={pageSize}
            onPageChange={(p) => { setPage(p); setSelectedIds(new Set()) }}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1) }}
            onOpen={setSelectedId}
            isAdmin={isAdmin}
            onDelete={setDeleteTarget}
            currentUserId={currentUser?.id}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onStatusChange={handleStatusChange}
            onPriorityChange={handlePriorityChange}
            sortColState={sortColState}
            hasColFilter={hasColFilter}
            onOpenColFilter={openColFilter}
            colFilterCount={colFilterCount}
            hasColSort={hasColSort}
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
      {deleteTarget && (
        <DeleteModal
          item={deleteTarget}
          deleting={deleting}
          onClose={() => !deleting && setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* ── Bulk delete confirmation ── */}
      {showBulkDeleteConfirm && (
        <div className={s.miniOverlay}>
          <div className={s.miniDialog}>
            <h4 className={s.miniTitle}>Xóa {selectedIds.size} phiếu giao việc</h4>
            <p className={s.miniBody}>
              Bạn có chắc chắn muốn xóa <strong>{selectedIds.size}</strong> phiếu đã chọn?{' '}
              Hành động này không thể hoàn tác.
            </p>
            <div className={s.miniActions}>
              <button
                onClick={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}
                className={s.btnSecondary}
                disabled={bulkDeleting}
              >
                Hủy bỏ
              </button>
              <button onClick={bulkDeleteConfirmed} disabled={bulkDeleting} className={s.btnDanger}>
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
