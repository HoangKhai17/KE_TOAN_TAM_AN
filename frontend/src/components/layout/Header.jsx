import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Menu, Bell, ChevronDown, User, LogOut, Search, Plus } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { logout } from '../../api/auth'
import s from './layout.module.css'

const ROUTE_LABELS = {
  dashboard:   'Trang chủ',
  companies:   'Công ty',
  tasks:       'Công việc',
  'task-types':'Loại công việc',
  schedules:   'Lịch định kỳ',
  staff:       'Nhân viên',
  reports:     'Báo cáo',
  credentials: 'Thông tin đăng nhập',
  settings:    'Cài đặt',
  profile:     'Hồ sơ',
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

export default function Header({ onMenuToggle }) {
  const navigate   = useNavigate()
  const { user, logout: clearAuth } = useAuthStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const crumbs = useBreadcrumb()

  async function handleLogout() {
    setDropdownOpen(false)
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
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
            placeholder="Tìm khách hàng, mã số thuế…"
            readOnly
            onFocus={(e) => e.target.blur()}
          />
          <span className={s.headerSearchKbd}>⌘K</span>
        </div>

        {/* Create task button */}
        <button className={s.btnSuccess}>
          <Plus size={14} />
          Tạo công việc
        </button>

        {/* Notification bell */}
        <button className={s.headerIconBtn} aria-label="Thông báo">
          <Bell size={18} />
          <span className={s.headerBadge} />
        </button>

        <span className={s.headerDivider} />

        {/* User dropdown */}
        <div className={s.headerUserWrap}>
          <button
            className={s.headerUser}
            onClick={() => setDropdownOpen((v) => !v)}
            aria-label="Tài khoản"
          >
            <div className={`${s.avatar} ${s.avatarMd} ${s.avatarNavy}`}>
              {initials}
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
                  onClick={() => { setDropdownOpen(false); navigate('/profile') }}
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
