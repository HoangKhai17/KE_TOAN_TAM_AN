import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck, Filter, FlaskConical, Trash2, Square, CheckSquare, MinusSquare,
} from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useNotificationStore } from '../../stores/notificationStore'
import {
  listNotifications, markOneRead, markAllRead, sendTestNotification,
  deleteManyNotifications,
} from '../../api/notifications'
import s from './notifications.module.css'

const TYPE_INFO = {
  task_assigned:       { emoji: '📋', label: 'Giao việc',      color: '#2563eb', bg: '#eff6ff' },
  task_overdue:        { emoji: '⚠️', label: 'Quá hạn',        color: '#dc2626', bg: '#fef2f2' },
  deadline_reminder:   { emoji: '🔔', label: 'Nhắc hạn',       color: '#d97706', bg: '#fffbeb' },
  escalation:          { emoji: '🚨', label: 'Escalation',      color: '#dc2626', bg: '#fef2f2' },
  morning_summary:     { emoji: '☀️', label: 'Tóm tắt sáng',   color: '#059669', bg: '#f0fdf4' },
  task_status_changed: { emoji: '🔄', label: 'Cập nhật',        color: '#7c3aed', bg: '#f5f3ff' },
}

const TYPE_FILTERS = [
  { key: 'task_assigned',       label: '📋 Giao việc' },
  { key: 'task_status_changed', label: '🔄 Cập nhật' },
  { key: 'task_overdue',        label: '⚠️ Quá hạn' },
  { key: 'deadline_reminder',   label: '🔔 Nhắc hạn' },
  { key: 'escalation',          label: '🚨 Escalation' },
  { key: 'morning_summary',     label: '☀️ Tóm tắt sáng' },
]

function fmtDatetime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d} ngày trước`
  return fmtDatetime(iso)
}

export default function Notifications() {
  const navigate = useNavigate()
  const { markOneRead: storeMarkOne, markAllRead: storeMarkAll, unreadCount, recent } =
    useNotificationStore()

  const [notifications, setNotifications] = useState([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(1)
  const [readFilter, setReadFilter]       = useState('all')  // all | unread | read
  const [typeFilter, setTypeFilter]       = useState('')     // '' | type key
  const [loading, setLoading]             = useState(true)
  const [testing, setTesting]             = useState(false)

  // Selection / delete mode
  const [selectMode, setSelectMode]   = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [deleting, setDeleting]       = useState(false)

  const LIMIT = 20

  // ── Load ─────────────────────────────────────────────────────────────────────

  const load = useCallback(async (p = 1, rf = readFilter, tf = typeFilter) => {
    setLoading(true)
    try {
      const isRead = rf === 'unread' ? false : rf === 'read' ? true : undefined
      const result = await listNotifications({ page: p, limit: LIMIT, isRead, type: tf || undefined })
      setNotifications(result.notifications)
      setTotal(result.total)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [readFilter, typeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload on filter change
  useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
    load(1, readFilter, typeFilter)
  }, [readFilter, typeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Socket: watch store.recent for new notifications ─────────────────────────
  // Header.jsx keeps the socket alive. When a new notification arrives via socket,
  // Header calls addNew() → store.recent updates → we detect it here without
  // needing direct socket access (avoids race condition where socket isn't connected
  // when this page mounts).
  const prevFirstIdRef = useRef(null)

  useEffect(() => {
    if (!recent.length) return
    const newId = recent[0]?.id
    if (prevFirstIdRef.current === newId) return
    prevFirstIdRef.current = newId

    // Only prepend on page 1 and no conflicting filters
    if (page === 1) {
      const newNotif = recent[0]
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev
        return [newNotif, ...prev].slice(0, LIMIT)
      })
      setTotal((t) => t + 1)
    }
  }, [recent, page])

  // ── Mark read ─────────────────────────────────────────────────────────────────

  async function handleMarkOne(id, taskId, isRead) {
    if (selectMode) {
      toggleSelect(id)
      return
    }
    if (!isRead) {
      storeMarkOne(id)
      setNotifications((prev) =>
        prev.map((n) => n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)
      )
      try { await markOneRead(id) } catch { /* ignore */ }
    }
    if (taskId) navigate(`/tasks/${taskId}`)
  }

  async function handleMarkAll() {
    storeMarkAll()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try { await markAllRead() } catch { /* ignore */ }
  }

  // ── Pagination ────────────────────────────────────────────────────────────────

  function handlePageChange(p) {
    setPage(p)
    setSelectedIds(new Set())
    load(p, readFilter, typeFilter)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  function toggleSelectMode() {
    setSelectMode((v) => !v)
    setSelectedIds(new Set())
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleSelectAll() {
    const allIds = notifications.map((n) => n.id)
    const allSelected = allIds.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(allIds))
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  async function handleDeleteSelected() {
    if (!selectedIds.size || deleting) return
    setDeleting(true)
    try {
      const ids = [...selectedIds]
      await deleteManyNotifications(ids)
      setNotifications((prev) => prev.filter((n) => !selectedIds.has(n.id)))
      setTotal((t) => Math.max(0, t - ids.length))
      setSelectedIds(new Set())
      if (selectedIds.size >= LIMIT) {
        // Might have emptied the page — reload
        load(page, readFilter, typeFilter)
      }
    } catch { /* ignore */ }
    finally { setDeleting(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / LIMIT)
  const allOnPageSelected = notifications.length > 0 && notifications.every((n) => selectedIds.has(n.id))
  const someOnPageSelected = notifications.some((n) => selectedIds.has(n.id)) && !allOnPageSelected

  return (
    <AppLayout>
      <div className={s.page}>

        {/* ── Header ── */}
        <div className={s.pageHead}>
          <div className={s.pageTitleWrap}>
            <Bell size={22} className={s.pageTitleIcon} />
            <div>
              <h1 className={s.pageTitle}>Thông báo</h1>
              <p className={s.pageSubtitle}>
                {total > 0 ? `${total} thông báo` : 'Chưa có thông báo'}
                {unreadCount > 0 ? ` · ${unreadCount} chưa đọc` : ''}
              </p>
            </div>
          </div>

          <div className={s.pageActions}>
            {/* Select mode toolbar */}
            {selectMode ? (
              <>
                {selectedIds.size > 0 && (
                  <button
                    className={s.btnDelete}
                    onClick={handleDeleteSelected}
                    disabled={deleting}
                  >
                    <Trash2 size={13} />
                    {deleting ? 'Đang xóa…' : `Xóa ${selectedIds.size} thông báo`}
                  </button>
                )}
                <button className={s.btnGhost} onClick={toggleSelectMode}>
                  Hủy chọn
                </button>
              </>
            ) : (
              <>
                {unreadCount > 0 && (
                  <button className={s.btnMarkAll} onClick={handleMarkAll}>
                    <CheckCheck size={14} />
                    Đánh dấu tất cả đã đọc
                  </button>
                )}
                <button className={s.btnGhost} onClick={toggleSelectMode} title="Chọn để xóa">
                  <CheckSquare size={13} />
                  Chọn
                </button>
                <button
                  className={s.btnTest}
                  onClick={async () => {
                    setTesting(true)
                    try {
                      await sendTestNotification()
                      setTimeout(() => load(1, readFilter, typeFilter), 600)
                    } catch { /* ignore */ }
                    finally { setTesting(false) }
                  }}
                  disabled={testing}
                  title="Tạo notification test (dev)"
                >
                  <FlaskConical size={13} />
                  {testing ? 'Đang gửi…' : 'Test Notify'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className={s.filterBar}>
          <Filter size={13} className={s.filterIcon} />

          {/* Read status */}
          {[
            { key: 'all',    label: 'Tất cả' },
            { key: 'unread', label: 'Chưa đọc' },
            { key: 'read',   label: 'Đã đọc' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`${s.filterBtn} ${readFilter === key ? s.filterBtnActive : ''}`}
              onClick={() => setReadFilter(key)}
            >
              {label}
            </button>
          ))}

          <span className={s.filterSep} />

          {/* Type filter — click active to deselect */}
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.filterBtn} ${typeFilter === key ? s.filterBtnActive : ''}`}
              onClick={() => setTypeFilter(typeFilter === key ? '' : key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Select-all bar ── */}
        {selectMode && notifications.length > 0 && (
          <div className={s.selectBar}>
            <button className={s.selectAllBtn} onClick={handleSelectAll}>
              {allOnPageSelected
                ? <CheckSquare size={15} />
                : someOnPageSelected
                  ? <MinusSquare size={15} />
                  : <Square size={15} />
              }
              {allOnPageSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả trang này'}
            </button>
            {selectedIds.size > 0 && (
              <span className={s.selectCount}>Đã chọn {selectedIds.size}</span>
            )}
          </div>
        )}

        {/* ── List ── */}
        <div className={s.listWrap}>
          {loading ? (
            <div className={s.skeleton}>
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className={s.skeletonItem} />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className={s.empty}>
              <Bell size={32} className={s.emptyIcon} />
              <p>Không có thông báo nào.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const meta = TYPE_INFO[n.type] || { emoji: '🔔', label: n.type, color: '#64748b', bg: '#f8fafc' }
              const isSelected = selectedIds.has(n.id)
              return (
                <button
                  key={n.id}
                  className={`${s.item} ${n.is_read ? s.itemRead : s.itemUnread} ${isSelected ? s.itemSelected : ''}`}
                  onClick={() => handleMarkOne(n.id, n.task_id, n.is_read)}
                >
                  {/* Checkbox (select mode) */}
                  {selectMode && (
                    <span className={`${s.itemCheckbox} ${isSelected ? s.itemCheckboxChecked : ''}`}>
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </span>
                  )}

                  {/* Type icon */}
                  <div className={s.itemEmoji} style={{ background: meta.bg, color: meta.color }}>
                    {meta.emoji}
                  </div>

                  {/* Body */}
                  <div className={s.itemBody}>
                    <div className={s.itemTop}>
                      <span className={s.itemTitle}>{n.title}</span>
                      <span className={s.itemTypeBadge} style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </div>
                    <div className={s.itemText}>{n.body}</div>
                    {n.task_title && (
                      <div className={s.itemTask}>📌 {n.task_title}</div>
                    )}
                    <div className={s.itemMeta}>
                      {fmtRelative(n.created_at)}
                      <span className={s.itemMetaSep}>·</span>
                      {fmtDatetime(n.created_at)}
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.is_read && !selectMode && <span className={s.itemDot} />}
                </button>
              )
            })
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className={s.pagination}>
            <button
              className={s.pagBtn}
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
            >‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
              .reduce((acc, n, i, arr) => {
                if (i > 0 && n - arr[i - 1] > 1) acc.push('…')
                acc.push(n)
                return acc
              }, [])
              .map((n, i) =>
                n === '…' ? (
                  <span key={`e${i}`} className={s.pagEllipsis}>…</span>
                ) : (
                  <button
                    key={n}
                    className={`${s.pagBtn} ${page === n ? s.pagBtnActive : ''}`}
                    onClick={() => handlePageChange(n)}
                  >{n}</button>
                )
              )}
            <button
              className={s.pagBtn}
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
            >›</button>
            <span className={s.pagInfo}>
              {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} / {total}
            </span>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
