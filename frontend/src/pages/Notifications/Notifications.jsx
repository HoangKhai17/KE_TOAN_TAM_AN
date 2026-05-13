import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Filter } from 'lucide-react'
import AppLayout from '../../components/layout/AppLayout'
import { useNotificationStore } from '../../stores/notificationStore'
import { listNotifications, markOneRead, markAllRead } from '../../api/notifications'
import s from './notifications.module.css'

const TYPE_INFO = {
  task_assigned:       { emoji: '📋', label: 'Giao việc',      color: '#2563eb', bg: '#eff6ff' },
  task_overdue:        { emoji: '⚠️', label: 'Quá hạn',        color: '#dc2626', bg: '#fef2f2' },
  deadline_reminder:   { emoji: '🔔', label: 'Nhắc hạn',       color: '#d97706', bg: '#fffbeb' },
  escalation:          { emoji: '🚨', label: 'Escalation',      color: '#dc2626', bg: '#fef2f2' },
  morning_summary:     { emoji: '☀️', label: 'Tóm tắt sáng',   color: '#059669', bg: '#f0fdf4' },
  task_status_changed: { emoji: '🔄', label: 'Cập nhật',        color: '#7c3aed', bg: '#f5f3ff' },
}

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
  const navigate  = useNavigate()
  const { markOneRead: storeMarkOne, markAllRead: storeMarkAll, unreadCount } = useNotificationStore()

  const [notifications, setNotifications] = useState([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(1)
  const [filter, setFilter]               = useState('all') // all | unread | read
  const [loading, setLoading]             = useState(true)

  const LIMIT = 20

  const load = useCallback(async (p = 1, f = filter) => {
    setLoading(true)
    try {
      const isRead = f === 'unread' ? false : f === 'read' ? true : undefined
      const result = await listNotifications({ page: p, limit: LIMIT, isRead })
      setNotifications(result.notifications)
      setTotal(result.total)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load(1, filter)
    setPage(1)
  }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleMarkOne(id, taskId, isRead) {
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

  function handlePageChange(p) {
    setPage(p)
    load(p, filter)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = Math.ceil(total / LIMIT)

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
            {unreadCount > 0 && (
              <button className={s.btnMarkAll} onClick={handleMarkAll}>
                <CheckCheck size={14} />
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div className={s.filterBar}>
          <Filter size={13} className={s.filterIcon} />
          {[
            { key: 'all',    label: 'Tất cả' },
            { key: 'unread', label: 'Chưa đọc' },
            { key: 'read',   label: 'Đã đọc' },
          ].map(({ key, label }) => (
            <button
              key={key}
              className={`${s.filterBtn} ${filter === key ? s.filterBtnActive : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── List ── */}
        <div className={s.listWrap}>
          {loading ? (
            <div className={s.skeleton}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className={s.skeletonItem} />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className={s.empty}>
              <Bell size={32} className={s.emptyIcon} />
              <p>Không có thông báo nào.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const meta = TYPE_INFO[n.type] || { emoji: '🔔', label: n.type, color: '#64748b', bg: '#f8fafc' }
              return (
                <button
                  key={n.id}
                  className={`${s.item} ${n.is_read ? s.itemRead : s.itemUnread}`}
                  onClick={() => handleMarkOne(n.id, n.task_id, n.is_read)}
                >
                  {/* Type badge */}
                  <div className={s.itemEmoji} style={{ background: meta.bg, color: meta.color }}>
                    {meta.emoji}
                  </div>

                  {/* Body */}
                  <div className={s.itemBody}>
                    <div className={s.itemTop}>
                      <span className={s.itemTitle}>{n.title}</span>
                      <span
                        className={s.itemTypeBadge}
                        style={{ background: meta.bg, color: meta.color }}
                      >
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
                  {!n.is_read && <span className={s.itemDot} />}
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
