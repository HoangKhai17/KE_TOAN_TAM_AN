import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  CheckSquare,
  ListTodo,
  CalendarDays,
  Users,
  BarChart3,
  KeyRound,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { logout } from '../../api/auth'

const NAV_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/companies',    label: 'Công ty',            icon: Building2 },
  { to: '/tasks',        label: 'Công việc',          icon: CheckSquare },
  { to: '/task-types',   label: 'Loại công việc',     icon: ListTodo },
  { to: '/schedules',    label: 'Lịch định kỳ',       icon: CalendarDays },
  { to: '/staff',        label: 'Nhân viên',          icon: Users, adminOnly: true },
  { to: '/reports',      label: 'Báo cáo',            icon: BarChart3 },
  { to: '/credentials',  label: 'Thông tin đăng nhập',icon: KeyRound },
]

export default function Sidebar({ open, onToggle }) {
  const navigate = useNavigate()
  const { user, logout: clearAuth } = useAuthStore()

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const isAdmin = user?.role === 'admin'

  return (
    <aside
      className={`
        flex flex-col flex-shrink-0 h-full
        bg-[#0f345e] text-white
        transition-all duration-200 ease-in-out
        ${open ? 'w-60' : 'w-16'}
      `}
      style={{ minHeight: '100vh' }}
    >
      {/* ── Logo / collapse toggle ── */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 min-h-[60px]">
        {open && (
          <span className="font-bold text-sm tracking-wide text-white/90 truncate">
            Kế Toán Tâm An
          </span>
        )}
        <button
          onClick={onToggle}
          className="ml-auto p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label={open ? 'Thu sidebar' : 'Mở sidebar'}
        >
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 my-0.5 rounded-lg text-sm font-medium
              transition-all duration-150 group
              ${isActive
                ? 'bg-white/15 text-white'
                : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`
            }
            title={!open ? label : undefined}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  className={`flex-shrink-0 ${isActive ? 'text-[#d4a440]' : 'text-white/60 group-hover:text-white/90'}`}
                />
                {open && <span className="truncate">{label}</span>}
                {open && isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#d4a440] flex-shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── User info + logout ── */}
      <div className="border-t border-white/10 p-3">
        <div className={`flex items-center gap-3 px-2 py-2 ${open ? '' : 'justify-center'}`}>
          <UserAvatar name={user?.name} />
          {open && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name || '—'}</p>
              <p className="text-xs text-white/50 truncate capitalize">{user?.role || ''}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={`
            mt-1 flex items-center gap-2.5 w-full px-3 py-2 rounded-lg
            text-xs font-medium text-white/55 hover:text-white hover:bg-red-500/20
            transition-colors
            ${!open ? 'justify-center' : ''}
          `}
          title={!open ? 'Đăng xuất' : undefined}
        >
          <LogOut size={15} className="flex-shrink-0" />
          {open && 'Đăng xuất'}
        </button>
      </div>
    </aside>
  )
}

function UserAvatar({ name }) {
  const initials = name
    ? name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
    : '?'
  return (
    <div className="w-8 h-8 rounded-full bg-[#d4a440]/80 flex items-center justify-center flex-shrink-0 text-xs font-bold text-[#0f345e]">
      {initials}
    </div>
  )
}
