import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Bell, ChevronDown, User, LogOut } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { logout } from '../../api/auth'

export default function Header({ title = 'Dashboard', onMenuToggle }) {
  const navigate  = useNavigate()
  const { user, logout: clearAuth } = useAuthStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  async function handleLogout() {
    setDropdownOpen(false)
    try { await logout() } catch { /* ignore */ }
    clearAuth()
    navigate('/login', { replace: true })
  }

  const initials = user?.name
    ? user.name.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()
    : '?'

  return (
    <header className="flex items-center justify-between h-[60px] px-5 bg-white border-b border-gray-200 flex-shrink-0 z-10">
      {/* Left: menu toggle + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-base font-semibold text-gray-800 hidden sm:block">{title}</h1>
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button className="relative p-2 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
          <Bell size={18} />
          {/* Unread badge — hardcoded for now */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#0f345e] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden md:block max-w-[120px] truncate">
              {user?.name || 'Người dùng'}
            </span>
            <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
          </button>

          {dropdownOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              {/* Dropdown */}
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setDropdownOpen(false); navigate('/profile') }}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                >
                  <User size={15} />
                  Hồ sơ cá nhân
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={15} />
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
