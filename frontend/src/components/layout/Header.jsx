import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Bell, ChevronDown, User, LogOut, Search, Plus, CheckCheck } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { logout } from '../../api/auth'
import { listNotifications, markOneRead, markAllRead, getUnreadCount } from '../../api/notifications'
import CheckInWidget from './CheckInWidget'
import s from './layout.module.css'

const ROUTE_LABELS = {
  dashboard:              'Trang chủ',
  companies:              'Công ty',
  tasks:                  'Công việc',
  'task-types':           'Loại công việc',
  schedules:              'Lịch định kỳ',
  staff:                  'Nhân viên',
  reports:                'Báo cáo',
  credentials:            'Thông tin đăng nhập',
  settings:               'Cài đặt',
  profile:                'Hồ sơ',
  notifications:          'Thông báo',
  attendance:             'Chấm công',
  admin:                  'Quản lý',
  payroll:                'Bảng lương',
  'internal-assignments': 'Công việc nội bộ',
  'client-requests':      'Yêu cầu KH',
}

function useBreadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean)
  if (segments.length === 0) return []
  const first = ROUTE_LABELS[segments[0]] || segments[0]
  if (segments.length === 1) return [{ label: first, path: `/${segments[0]}` }]
  return [
    { label: first, path: `/${segments[0]}` },
    { label: ROUTE_LABELS[segments[1]] || `#${segments[1].slice(0, 6)}` },
  ]
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
}

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

const TYPE_ICON = {
  task_assigned:        { emoji: '📋', color: '#2563eb' },
  task_overdue:         { emoji: '⚠️', color: '#dc2626' },
  deadline_reminder:    { emoji: '🔔', color: '#d97706' },
  escalation:           { emoji: '🚨', color: '#dc2626' },
  morning_summary:      { emoji: '☀️', color: '#059669' },
  task_status_changed:  { emoji: '🔄', color: '#7c3aed' },
  client_doc_submitted: { emoji: '📩', color: '#0891b2' },
  client_doc_overdue:   { emoji: '📂', color: '#dc2626' },
}

export default function Header({ onMenuToggle }) {
  const navigate   = useNavigate()
  const { user, accessToken, logout: clearAuth } = useAuthStore()
  const unreadCount  = useNotificationStore((s) => s.unreadCount)
  const recent       = useNotificationStore((s) => s.recent)
  const hasLoaded    = useNotificationStore((s) => s.hasLoaded)
  const setUnreadCount  = useNotificationStore((s) => s.setUnreadCount)
  const setRecent       = useNotificationStore((s) => s.setRecent)
  const storeMarkOne    = useNotificationStore((s) => s.markOneRead)
  const storeMarkAll    = useNotificationStore((s) => s.markAllRead)

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [bellOpen, setBellOpen]         = useState(false)
  const [searchQuery, setSearchQuery]   = useState('')
  const bellRef = useRef(null)
  const crumbs  = useBreadcrumb()

  // Bootstrap: load unread count + recent 10 notifications
  useEffect(() => {
    if (!accessToken) return
    let cancelled = false

    Promise.all([
      getUnreadCount(),
      listNotifications({ limit: 10 }),
    ]).then(([count, result]) => {
      if (cancelled) return
      setUnreadCount(count)
      setRecent(result.notifications)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close bell dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return
    function handle(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [bellOpen])

  function handleSearchKeyDown(e) {
    if (e.key === 'Enter' && searchQuery.trim()) {
      navigate(`/tasks?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  async function handleLogout() {
    setDropdownOpen(false)
    try { await logout() } catch { /* ignore */ }
    clearAuth() // → accessToken becomes null → SocketProvider's useEffect disconnects socket
    navigate('/login', { replace: true })
  }

  async function handleMarkOne(id) {
    storeMarkOne(id)
    try { await markOneRead(id) } catch { /* ignore */ }
  }

  async function handleMarkAll() {
    storeMarkAll()
    try { await markAllRead() } catch { /* ignore */ }
  }

  const initials = getInitials(user?.name)

  return (
    <header className={s.header}>

      {/* ── Left: menu toggle + breadcrumb ── */}
      <div className={s.headerLeft}>
        <button className={s.headerMenuBtn} onClick={onMenuToggle} aria-label="Toggle menu">
          <Menu size={18} />
        </button>

        <nav className={s.breadcrumb} aria-label="Breadcrumb">
          <Link to="/dashboard" className={s.breadcrumbHome}>Trang chủ</Link>
          {crumbs.map((crumb, i) => (
            <span key={i} className={s.breadcrumbItem}>
              <span className={s.breadcrumbSep}>/</span>
              {crumb.path && i < crumbs.length - 1 ? (
                <Link to={crumb.path} className={s.breadcrumbHome}>{crumb.label}</Link>
              ) : (
                <span className={s.breadcrumbCurrent}>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>

      {/* ── Right: search + actions + user ── */}
      <div className={s.headerRight}>

        {/* Search */}
        <div className={s.headerSearchWrap}>
          <span className={s.headerSearchIcon}>
            <Search size={14} />
          </span>
          <input
            className={s.headerSearchInput}
            type="text"
            placeholder="Tìm theo tên, tiêu đề… (Enter)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <span className={s.headerSearchKbd}>⌘K</span>
        </div>

        {/* Create task button */}
        <button className={s.btnPrimary} onClick={() => navigate('/tasks?new=1')}>
          <Plus size={14} />
          Tạo công việc
        </button>

        {/* Check-in widget */}
        <CheckInWidget />

        {/* Notification bell */}
        <div className={s.bellWrap} ref={bellRef}>
          <button
            className={s.headerIconBtn}
            aria-label="Thông báo"
            onClick={() => setBellOpen((v) => !v)}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className={s.headerBadge}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className={s.bellDropdown}>
              <div className={s.bellDropdownHead}>
                <span className={s.bellDropdownTitle}>Thông báo</span>
                {unreadCount > 0 && (
                  <button className={s.bellMarkAll} onClick={handleMarkAll} title="Đánh dấu tất cả đã đọc">
                    <CheckCheck size={13} /> Đọc tất cả
                  </button>
                )}
              </div>

              <div className={s.bellList}>
                {!hasLoaded ? (
                  <div className={s.bellEmpty}>Đang tải…</div>
                ) : recent.length === 0 ? (
                  <div className={s.bellEmpty}>Không có thông báo nào.</div>
                ) : (
                  recent.map((n) => {
                    const meta = TYPE_ICON[n.type] || { emoji: '🔔', color: '#64748b' }
                    return (
                      <button
                        key={n.id}
                        className={`${s.bellItem} ${n.is_read ? s.bellItemRead : s.bellItemUnread}`}
                        onClick={() => {
                          handleMarkOne(n.id)
                          if (n.task_id) {
                            setBellOpen(false)
                            navigate(`/tasks/${n.task_id}`)
                          }
                        }}
                      >
                        <span className={s.bellItemEmoji} style={{ color: meta.color }}>{meta.emoji}</span>
                        <div className={s.bellItemBody}>
                          <div className={s.bellItemTitle}>{n.title}</div>
                          <div className={s.bellItemText}>{n.body}</div>
                          <div className={s.bellItemTime}>{fmtRelative(n.created_at)}</div>
                        </div>
                        {!n.is_read && <span className={s.bellItemDot} />}
                      </button>
                    )
                  })
                )}
              </div>

              <Link
                to="/notifications"
                className={s.bellViewAll}
                onClick={() => setBellOpen(false)}
              >
                Xem tất cả thông báo →
              </Link>
            </div>
          )}
        </div>

        <span className={s.headerDivider} />

        {/* User dropdown */}
        <div className={s.headerUserWrap}>
          <button
            className={s.headerUser}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="Tài khoản"
          >
            <div className={`${s.avatar} ${s.avatarMd} ${user?.avatarUrl ? '' : s.avatarNavy}`}>
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt={user.name} className={s.avatarImg} />
                : initials}
            </div>
            <div className={s.headerUserInfo}>
              <span className={s.headerUserName}>{user?.name || 'Người dùng'}</span>
              <span className={s.headerUserRole}>{user?.role || ''}</span>
            </div>
            <ChevronDown size={13} className={s.headerUserChevron} />
          </button>

          {dropdownOpen && (
            <>
              <div
                className={s.headerDropdownBackdrop}
                onClick={() => setDropdownOpen(false)}
              />
              <div className={s.headerDropdown}>
                <div className={s.headerDropdownInfo}>
                  <div className={s.headerDropdownName}>{user?.name}</div>
                  <div className={s.headerDropdownEmail}>{user?.email}</div>
                </div>
                <button
                  className={s.headerDropdownItem}
                  onClick={() => { setDropdownOpen(false); navigate(`/staff/${user?.id}`) }}
                >
                  <User size={14} />
                  Hồ sơ cá nhân
                </button>
                <button
                  className={`${s.headerDropdownItem} ${s.headerDropdownItemDanger}`}
                  onClick={handleLogout}
                >
                  <LogOut size={14} />
                  Đăng xuất
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
