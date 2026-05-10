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
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, format, addMonths, subMonths, isToday,
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
  TASK_STATUSES, STATUS_LABELS, STATUS_CSS, PRIORITY_LABELS, PRIORITY_CSS,
  isTaskOverdue, fmtDate, progressPct,
} from './taskUtils'
import s from './tasks.module.css'

// ── Column dot class map ───────────────────────────────────────────────────────

const COL_DOT = {
  pending:        s.dotPending,
  in_progress:    s.dotInProgress,
  on_hold:        s.dotOnHold,
  pending_review: s.dotPendingReview,
  needs_revision: s.dotNeedsRevision,
  completed:      s.dotCompleted,
}

// ── Small shared components ───────────────────────────────────────────────────

function StatusBadge({ status }) {
  return (
    <span className={`${s.statusBadge} ${s[STATUS_CSS[status]]}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function PriorityBadge({ priority }) {
  return (
    <span className={`${s.priorityBadge} ${s[PRIORITY_CSS[priority]]}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  )
}

// ── OnHoldModal ───────────────────────────────────────────────────────────────

function OnHoldModal({ task, onConfirm, onClose }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(task, 'on_hold', { reason: reason.trim() })
    } finally {
      setSaving(false)
    }
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
    try {
      await onConfirm()
    } finally {
      setSaving(false)
    }
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

// ── Board card content (shared between draggable + overlay) ───────────────────

function BoardCardInner({ task }) {
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
    </>
  )
}

// ── DraggableCard ─────────────────────────────────────────────────────────────

function DraggableCard({ task, onOpen }) {
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
      <BoardCardInner task={task} />
    </div>
  )
}

// ── DroppableColumn ───────────────────────────────────────────────────────────

function DroppableColumn({ status, tasks, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div className={s.boardCol}>
      <div className={s.boardColHead}>
        <span className={`${s.boardColDot} ${COL_DOT[status]}`} />
        <span className={s.boardColTitle}>{STATUS_LABELS[status]}</span>
        <span className={s.boardColCount}>{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`${s.boardCards} ${isOver ? s.boardCardsOver : ''}`}
      >
        {tasks.map((t) => (
          <DraggableCard key={t.id} task={t} onOpen={onOpen} />
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

function BoardView({ tasks, onStatusChange, onOpen }) {
  const [activeTask, setActiveTask] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const byStatus = useMemo(() => {
    const map = {}
    for (const st of TASK_STATUSES) map[st] = []
    for (const t of tasks) {
      if (map[t.status]) map[t.status].push(t)
    }
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
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className={`${s.boardCard} ${s.boardCardOverlay}`}>
            <BoardCardInner task={activeTask} />
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
  const [calMonth, setCalMonth] = useState(new Date())

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 1 })
    const end   = endOfWeek(endOfMonth(calMonth),   { weekStartsOn: 1 })
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
                <span className={s.calMore}>+{dayTasks.length - 3} thêm</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── ListView ──────────────────────────────────────────────────────────────────

function ListView({ tasks, loading, pagination, page, onPageChange, onOpen, selectedIds, onToggleSelect, onSelectAll }) {
  const allSelected = tasks.length > 0 && tasks.every((t) => selectedIds.has(t.id))
  const from = pagination.total === 0 ? 0 : (page - 1) * 20 + 1
  const to   = Math.min(page * 20, pagination.total)

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
                </tr>
              ))
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7}>
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
                  <td className={s.td}><StatusBadge status={t.status} /></td>
                  <td className={s.td}><PriorityBadge priority={t.priority} /></td>
                  <td className={s.td}>
                    <span className={overdue ? s.dueDateOverdue : s.dueDateNormal}>
                      {fmtDate(t.dueDate)}
                    </span>
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
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={s.pagination}>
        <span className={s.paginationInfo}>
          {loading ? '...' : `${from}–${to} / ${pagination.total} công việc`}
        </span>
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

  // View
  const [view, setView] = useState('list')

  // Filters
  const [searchInput, setSearchInput]     = useState('')
  const [search, setSearch]               = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [staffFilter, setStaffFilter]     = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [sourceFilter, setSourceFilter]   = useState('')
  const [isOverdue, setIsOverdue]         = useState(false)
  const [showFilter, setShowFilter]       = useState(false)

  // Data
  const [tasks, setTasks]           = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)

  // Reference data for filters
  const [companies, setCompanies] = useState([])
  const [staffList, setStaffList] = useState([])

  // Modals
  const [showCreate, setShowCreate]     = useState(false)
  const [onHoldTarget, setOnHoldTarget] = useState(null)
  const [forceTarget, setForceTarget]   = useState(null)

  // Bulk
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Load reference data
  useEffect(() => {
    listCompanies({ limit: 300, status: 'active' }).then(({ companies: c }) => setCompanies(c)).catch(() => {})
    listUsers({ role: 'staff', status: 'active', limit: 100 }).then(({ users: u }) => setStaffList(u)).catch(() => {})
  }, [])

  // Load tasks
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = {
      search:       search       || undefined,
      companyId:    companyFilter || undefined,
      assignedToId: staffFilter  || undefined,
      status:       statusFilter || undefined,
      priority:     priorityFilter || undefined,
      source:       sourceFilter || undefined,
      isOverdue:    isOverdue    ? true : undefined,
      limit:        view === 'list' ? 20 : 500,
      page:         view === 'list' ? page : 1,
      sortBy:       'createdAt',
      sortDir:      'desc',
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
  }, [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter, isOverdue, page, view])

  // Status change handler
  async function handleStatusChange(task, newStatus, extra = {}) {
    if (newStatus === 'on_hold' && !('reason' in extra)) {
      setOnHoldTarget({ task })
      return
    }
    try {
      const updated = await tasksApi.changeTaskStatus(task.id, { newStatus, ...extra })
      setTasks((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      addToast(`Đã chuyển sang "${STATUS_LABELS[newStatus]}"`, 'success')
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

  function resetFilters() {
    setSearchInput(''); setSearch('')
    setCompanyFilter(''); setStaffFilter('')
    setStatusFilter(''); setPriorityFilter('')
    setSourceFilter(''); setIsOverdue(false)
    setPage(1)
  }

  const activeFilterCount = [search, companyFilter, staffFilter, statusFilter, priorityFilter, sourceFilter].filter(Boolean).length + (isOverdue ? 1 : 0)

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
        await tasksApi.changeTaskStatus(id, { newStatus: 'completed', force: true })
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

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.toolbarLeft}>
            <h1 className={s.pageTitle}>Công việc</h1>

            <div className={s.quickFilters}>
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
            </div>
          </div>

          <div className={s.toolbarRight}>
            <div className={s.viewSwitch}>
              <button className={`${s.viewBtn} ${view === 'list' ? s.viewBtnActive : ''}`} onClick={() => setView('list')}>
                <List size={13} /> Danh sách
              </button>
              <button className={`${s.viewBtn} ${view === 'board' ? s.viewBtnActive : ''}`} onClick={() => setView('board')}>
                <Columns size={13} /> Board
              </button>
              <button className={`${s.viewBtn} ${view === 'calendar' ? s.viewBtnActive : ''}`} onClick={() => setView('calendar')}>
                <Calendar size={13} /> Lịch
              </button>
            </div>

            <button
              className={s.btnSecondary}
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

        {/* ── Filter bar ── */}
        {showFilter && (
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
                  {TASK_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Ưu tiên</label>
                <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  {['urgent', 'high', 'medium', 'low'].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>

              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Nguồn</label>
                <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }} className={s.filterSelect}>
                  <option value="">Tất cả</option>
                  <option value="auto">Tự động</option>
                  <option value="manual">Thủ công</option>
                </select>
              </div>

              <div className={s.filterGroup} style={{ justifyContent: 'flex-end' }}>
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
            onPageChange={(p) => { setPage(p); setSelectedIds(new Set()) }}
            onOpen={openTask}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
          />
        )}

        {view === 'board' && !loading && (
          <BoardView
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onOpen={openTask}
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
    </AppLayout>
  )
}
