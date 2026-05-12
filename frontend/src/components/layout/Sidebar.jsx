import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, CheckSquare,
  Users, BarChart3, Settings,
  ChevronLeft, ChevronRight, LogOut, Wallet, CalendarCheck,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { logout } from '../../api/auth'
import s from './layout.module.css'

const NAV_GROUPS = [
  {
    label: 'ĐIỀU HƯỚNG',
    items: [
      { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
      { to: '/companies',  label: 'Công ty',    icon: Building2 },
      { to: '/tasks',      label: 'Công việc',  icon: CheckSquare },
      { to: '/reports',    label: 'Báo cáo',    icon: BarChart3 },
    ],
  },
  {
    label: 'QUẢN TRỊ HỆ THỐNG',
    items: [
      { to: '/staff',      label: 'Nhân viên',   icon: Users,          adminOnly: true },
      { to: '/attendance', label: 'Chấm công',   icon: CalendarCheck },
      { to: '/payroll',    label: 'Bảng lương',  icon: Wallet,          adminOnly: true },
      { to: '/settings',   label: 'Cài đặt',     icon: Settings,        adminOnly: true },
    ],
  },
]

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
}

export default function Sidebar({ open, onToggle }) {
  const navigate = useNavigate()
  const { user, logout: clearAuth } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || isAdmin),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside className={`${s.sidebar} ${open ? s.sidebarExpanded : s.sidebarCollapsed}`}>

      {/* ── Logo / toggle ── */}
      <div className={s.sidebarLogo}>
        <div className={s.sidebarBrand}>
          <div className={s.sidebarLogoMark}>
            <img src="/logo_taman.png" alt="Logo Kế Toán Tâm An" />
          </div>
          {open && (
            <div>
              <div className={s.sidebarTitle}>Kế Toán Tâm An</div>
              <div className={s.sidebarSubtitle}>Nội bộ</div>
            </div>
          )}
        </div>
        <button
          className={s.sidebarToggle}
          onClick={onToggle}
          aria-label={open ? 'Thu sidebar' : 'Mở sidebar'}
        >
          {open ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className={s.sidebarNav}>
        {visibleGroups.map((group) => (
          <div key={group.label} className={s.sidebarSection}>
            {open && <div className={s.sidebarSectionLabel}>{group.label}</div>}
            {group.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                title={!open ? label : undefined}
                className={({ isActive }) =>
                  `${s.navItem} ${isActive ? s.navItemActive : ''}`
                }
              >
                <span className={s.navIcon}>
                  <Icon size={17} />
                </span>
                <span className={`${s.navLabel} ${!open ? s.navLabelHidden : ''}`}>
                  {label}
                </span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* ── User + logout ── */}
      <div className={s.sidebarFooter}>
        <div className={s.sidebarUser}>
          <div className={`${s.avatar} ${s.avatarMd} ${user?.avatarUrl ? '' : s.avatarGold}`}>
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user?.name} className={s.avatarImg} />
              : getInitials(user?.name)}
          </div>
          {open && (
            <div className={s.sidebarUserInfo}>
              <div className={s.sidebarUserName}>{user?.name || '—'}</div>
              <div className={s.sidebarUserRole}>{user?.role || ''}</div>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          title={!open ? 'Đăng xuất' : undefined}
          className={`${s.sidebarLogout} ${!open ? s.sidebarLogoutCollapsed : ''}`}
        >
          <LogOut size={14} />
          {open && 'Đăng xuất'}
        </button>
      </div>
    </aside>
  )
}
