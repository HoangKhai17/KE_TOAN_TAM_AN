import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, ClipboardCheck, Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import AppLayout from '../../components/layout/AppLayout'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import * as api from '../../api/internalAssignments'
import AssignmentDetailPanel from './AssignmentDetailPanel'
import CreateEditAssignmentModal from './CreateEditAssignmentModal'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  try { return format(parseISO(d), 'dd/MM/yyyy') } catch { return d }
}

// ── AssignmentCard ────────────────────────────────────────────────────────────

function AssignmentCard({ item, isActive, onClick, currentUserId, isAdmin }) {
  const myAssignee = !isAdmin
    ? item.assignees?.find((a) => a.userId === currentUserId)
    : null

  const isOverdue = item.deadlineDate && item.status === 'active'
    && new Date(item.deadlineDate) < new Date()

  return (
    <div
      className={`${s.assignmentCard} ${isActive ? s.assignmentCardActive : ''}`}
      onClick={onClick}
    >
      <div className={s.cardMain}>
        <div className={s.cardTitleRow}>
          <span className={s.cardTitle}>{item.title}</span>
          <span className={`${s.badge} ${STATUS_CSS[item.status]}`}>
            {STATUS_LABELS[item.status]}
          </span>
          <span className={`${s.badge} ${PRIORITY_CSS[item.priority]}`}>
            {PRIORITY_LABELS[item.priority]}
          </span>
          {myAssignee && (
            <span className={`${s.myStatusChip} ${MY_STATUS_CSS[myAssignee.status]}`}>
              {ASSIGNEE_STATUS_LABELS[myAssignee.status]}
            </span>
          )}
        </div>

        <div className={s.cardMeta}>
          {item.company && (
            <span className={s.cardMetaItem}>
              {item.company.name}
            </span>
          )}
          {item.deadlineDate && (
            <span className={s.cardMetaItem} style={isOverdue ? { color: 'var(--color-danger)' } : {}}>
              Hạn: {fmtDate(item.deadlineDate)}{isOverdue ? ' • Quá hạn' : ''}
            </span>
          )}
          {isAdmin && (
            <span className={s.cardMetaItem}>
              Tạo: {fmtDate(item.createdAt)}
            </span>
          )}
          {item.sentAt && (
            <span className={s.cardMetaItem}>
              Gửi: {fmtDate(item.sentAt)}
            </span>
          )}
        </div>

        {/* Assignees chips */}
        {item.assignees?.length > 0 && (
          <div className={s.cardAssignees}>
            {item.assignees.slice(0, 5).map((a) => (
              <span
                key={a.userId}
                className={`${s.assigneeChip} ${ASSIGNEE_STATUS_CSS[a.status]}`}
                title={`${a.name} — ${ASSIGNEE_STATUS_LABELS[a.status]}`}
              >
                {a.name}
              </span>
            ))}
            {item.assignees.length > 5 && (
              <span className={`${s.assigneeChip} ${s.chipPending}`}>
                +{item.assignees.length - 5}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AdminStatsRow ─────────────────────────────────────────────────────────────

function AdminStatsRow({ stats, filterStatus, onFilterStatus }) {
  const items = [
    { key: '',          label: 'Tất cả',          value: (stats.draft ?? 0) + (stats.active ?? 0) + (stats.done ?? 0) + (stats.cancelled ?? 0), css: '' },
    { key: 'draft',     label: 'Nháp',             value: stats.draft ?? 0,     css: '' },
    { key: 'active',    label: 'Đang thực hiện',   value: stats.active ?? 0,    css: s.statBlue },
    { key: 'done',      label: 'Hoàn thành',       value: stats.done ?? 0,      css: s.statGreen },
    { key: 'cancelled', label: 'Đã hủy',           value: stats.cancelled ?? 0, css: s.statRed },
  ]
  if (stats.allRejected > 0) {
    items.push({ key: '_allRejected', label: 'Tất cả từ chối', value: stats.allRejected, css: s.statRed })
  }

  return (
    <div className={s.statsRow}>
      {items.flatMap((item, i) => [
        i > 0 ? <span key={`d${i}`} className={s.statDivider} /> : null,
        <div
          key={item.key}
          className={`${s.statItem} ${filterStatus === item.key ? s.statItemActive : ''}`}
          onClick={() => item.key !== '_allRejected' && onFilterStatus(item.key)}
        >
          <span className={`${s.statValue} ${item.css}`}>{item.value}</span>
          <span className={s.statLabel}>{item.label}</span>
        </div>,
      ]).filter(Boolean)}
    </div>
  )
}

// ── StaffStatsRow ─────────────────────────────────────────────────────────────

function StaffStatsRow({ stats, filterStatus, onFilterStatus }) {
  const total = (stats.pending ?? 0) + (stats.accepted ?? 0) + (stats.inProgress ?? 0) + (stats.done ?? 0) + (stats.rejected ?? 0)
  const items = [
    { key: '',            label: 'Tất cả',         value: total,                css: '' },
    { key: 'pending',     label: 'Chờ tiếp nhận',  value: stats.pending ?? 0,   css: '' },
    { key: 'accepted',    label: 'Đã tiếp nhận',   value: stats.accepted ?? 0,  css: s.statBlue },
    { key: 'in_progress', label: 'Đang làm',       value: stats.inProgress ?? 0, css: s.statOrange },
    { key: 'done',        label: 'Hoàn thành',     value: stats.done ?? 0,      css: s.statGreen },
    { key: 'rejected',    label: 'Từ chối',        value: stats.rejected ?? 0,  css: s.statRed },
  ]

  return (
    <div className={s.statsRow}>
      {items.flatMap((item, i) => [
        i > 0 ? <span key={`d${i}`} className={s.statDivider} /> : null,
        <div
          key={item.key}
          className={`${s.statItem} ${filterStatus === item.key ? s.statItemActive : ''}`}
          onClick={() => onFilterStatus(item.key)}
        >
          <span className={`${s.statValue} ${item.css}`}>{item.value}</span>
          <span className={s.statLabel}>{item.label}</span>
        </div>,
      ]).filter(Boolean)}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InternalAssignments() {
  const currentUser = useAuthStore((s) => s.user)
  const addToast    = useToastStore((s) => s.toast)
  const isAdmin     = currentUser?.role === 'admin'

  const [items,      setItems]      = useState([])
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [loading,    setLoading]    = useState(true)
  const [stats,      setStats]      = useState({})
  const [page,       setPage]       = useState(1)

  // Filters
  const [search,        setSearch]        = useState('')
  const [searchInput,   setSearchInput]   = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  // UI state
  const [selectedId,  setSelectedId]  = useState(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editItem,    setEditItem]    = useState(null)
  const [refreshKey,  setRefreshKey]  = useState(0)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [filterStatus, filterPriority])

  const loadStats = useCallback(async () => {
    try { setStats(await api.getStats()) } catch { /* ignore */ }
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page, limit: 20,
        search: search || undefined,
        sortBy: 'created_at', sortDir: 'desc',
      }
      if (isAdmin) {
        if (filterStatus)   params.status   = filterStatus
        if (filterPriority) params.priority = filterPriority
      } else {
        if (filterStatus)   params.myStatus   = filterStatus
        if (filterPriority) params.priority   = filterPriority
      }
      const result = await api.listAssignments(params)
      setItems(result.items)
      setPagination(result.pagination)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [page, search, filterStatus, filterPriority, isAdmin])

  useEffect(() => { loadStats() }, [loadStats, refreshKey])
  useEffect(() => { loadItems() }, [loadItems, refreshKey])

  function refresh() { setRefreshKey((k) => k + 1) }

  function handleCreated(item) {
    setShowCreate(false)
    addToast(`Đã tạo phiếu "${item.title}"`, 'success')
    refresh()
    setSelectedId(item.id)
  }

  function handleUpdated(item) {
    setEditItem(null)
    addToast('Đã cập nhật phiếu', 'success')
    refresh()
  }

  function handlePanelUpdate() {
    refresh()
  }

  function handleFilterStatus(key) {
    setFilterStatus(key === filterStatus ? '' : key)
  }

  // Pagination window
  function pageWindow() {
    const total = pagination.totalPages ?? 1
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    if (page <= 4) return [1, 2, 3, 4, 5, '…', total]
    if (page >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total]
    return [1, '…', page - 1, page, page + 1, '…', total]
  }

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.toolbarLeft}>
            <h1 className={s.pageTitle}>Công việc nội bộ</h1>
            {!loading && pagination.total > 0 && (
              <span className={s.totalBadge}>{pagination.total}</span>
            )}
          </div>
          <div className={s.toolbarRight}>
            {isAdmin && (
              <button className={s.btnPrimary} onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Tạo phiếu
              </button>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        {isAdmin ? (
          <AdminStatsRow
            stats={stats}
            filterStatus={filterStatus}
            onFilterStatus={handleFilterStatus}
          />
        ) : (
          <StaffStatsRow
            stats={stats}
            filterStatus={filterStatus}
            onFilterStatus={handleFilterStatus}
          />
        )}

        {/* ── Filters ── */}
        <div className={s.filterBar}>
          <div className={s.filterGrid}>
            <div className={`${s.filterGroup} ${s.grow}`}>
              <label className={s.filterLabel}>Tìm kiếm</label>
              <div className={s.filterSearchWrap}>
                <Search size={12} className={s.filterSearchIcon} />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tiêu đề phiếu..."
                  className={`${s.filterInput} ${s.filterInputWithIcon}`}
                />
              </div>
            </div>

            {isAdmin && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Trạng thái</label>
                <select
                  className={s.filterSelect}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">Tất cả</option>
                  <option value="draft">Nháp</option>
                  <option value="active">Đang thực hiện</option>
                  <option value="done">Hoàn thành</option>
                  <option value="cancelled">Đã hủy</option>
                </select>
              </div>
            )}

            {!isAdmin && (
              <div className={s.filterGroup}>
                <label className={s.filterLabel}>Trạng thái của tôi</label>
                <select
                  className={s.filterSelect}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
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

            <div className={s.filterGroup}>
              <label className={s.filterLabel}>Ưu tiên</label>
              <select
                className={s.filterSelect}
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="urgent">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="normal">Bình thường</option>
                <option value="low">Thấp</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── List ── */}
        <div className={s.listWrap}>
          <div className={s.cardList}>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={s.skeletonRow}>
                  <div className={s.skeletonBar} style={{ width: '60%' }} />
                  <div className={s.skeletonBar} style={{ width: '35%' }} />
                </div>
              ))
            ) : items.length === 0 ? (
              <div className={s.emptyBox}>
                <div className={s.emptyIcon}><ClipboardCheck size={24} /></div>
                <p className={s.emptyTitle}>Không có phiếu giao việc</p>
                <p className={s.emptyText}>
                  {isAdmin ? 'Nhấn "Tạo phiếu" để bắt đầu' : 'Chưa có phiếu nào được giao cho bạn'}
                </p>
              </div>
            ) : (
              items.map((item) => (
                <AssignmentCard
                  key={item.id}
                  item={item}
                  isActive={selectedId === item.id}
                  onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                  currentUserId={currentUser?.id}
                  isAdmin={isAdmin}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {!loading && pagination.totalPages > 1 && (
            <div className={s.pagination}>
              <span className={s.paginationInfo}>
                {pagination.total} phiếu
              </span>
              <div className={s.paginationBtns}>
                <button className={s.pageBtn} onClick={() => setPage(1)} disabled={page === 1}>«</button>
                <button className={s.pageBtn} onClick={() => setPage((p) => p - 1)} disabled={page === 1}>‹</button>
                {pageWindow().map((n, i) =>
                  n === '…' ? (
                    <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--color-muted)' }}>…</span>
                  ) : (
                    <button
                      key={n}
                      className={`${s.pageBtn} ${page === n ? s.pageBtnActive : ''}`}
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  )
                )}
                <button className={s.pageBtn} onClick={() => setPage((p) => p + 1)} disabled={page === pagination.totalPages}>›</button>
                <button className={s.pageBtn} onClick={() => setPage(pagination.totalPages)} disabled={page === pagination.totalPages}>»</button>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ── Detail panel ── */}
      {selectedId && (
        <AssignmentDetailPanel
          assignmentId={selectedId}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onEdit={(item) => setEditItem(item)}
          onUpdate={handlePanelUpdate}
        />
      )}

      {/* ── Create modal ── */}
      {showCreate && (
        <CreateEditAssignmentModal
          onClose={() => setShowCreate(false)}
          onSaved={handleCreated}
        />
      )}

      {/* ── Edit modal ── */}
      {editItem && (
        <CreateEditAssignmentModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={handleUpdated}
        />
      )}
    </AppLayout>
  )
}
