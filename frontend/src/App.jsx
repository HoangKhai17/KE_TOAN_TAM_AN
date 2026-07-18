import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ToastContainer from './components/ui/Toast'
import { useAuthStore } from './stores/authStore'
import { refreshSession } from './api/session'
import { useTokenRefresh } from './hooks/useTokenRefresh'
import SocketProvider from './providers/SocketProvider'
import Login from './pages/Login/Login'
import Dashboard from './pages/Dashboard/Dashboard'
import Staff from './pages/Staff/Staff'
import StaffDetail from './pages/Staff/StaffDetail'
import Attendance from './pages/Attendance/Attendance'
import AttendanceAdmin from './pages/Attendance/AttendanceAdmin'
import Companies from './pages/Companies/Companies'
import CompanyDetail from './pages/Companies/CompanyDetail'
import CompanyOverview from './pages/Companies/CompanyOverview'
import Settings from './pages/Settings/Settings'
import Tasks from './pages/Tasks/Tasks'
import TaskDetail from './pages/Tasks/TaskDetail'
import Payroll from './pages/Payroll/Payroll'
import PayrollDetail from './pages/Payroll/PayrollDetail'
import Reports from './pages/Reports/Reports'
import ProgressMatrix from './pages/ProgressMatrix/ProgressMatrix'
import Notifications from './pages/Notifications/Notifications'
import PublicForm from './pages/PublicForm/PublicForm'
import AdminClientRequests from './pages/AdminClientRequests/AdminClientRequests'
import InternalAssignments from './pages/InternalAssignments/InternalAssignments'
import InternalDocLinks from './pages/InternalAssignments/InternalDocLinks'
import MobileHome from './pages/MobileHome/MobileHome'
import { homePath } from './utils/isMobile'
import s from './App.module.css'

// ── Route guards ──────────────────────────────────────────────────────
// isAuthReady is always true by the time these render (AppRoutes handles
// the loading state), but the checks are kept for safety.

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAuthReady     = useAuthStore((s) => s.isAuthReady)
  if (!isAuthReady)     return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function GuestRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAuthReady     = useAuthStore((s) => s.isAuthReady)
  if (!isAuthReady)    return null
  if (isAuthenticated) return <Navigate to={homePath()} replace />
  return children
}

// ── Bootstrap spinner ─────────────────────────────────────────────────

function BootstrapScreen() {
  return (
    <div className={s.bootstrap}>
      <div className={s.bootstrapSpinner} />
    </div>
  )
}

// ── AppRoutes (inside BrowserRouter so hooks have router context) ─────

function AppRoutes() {
  const setAuth     = useAuthStore((s) => s.setAuth)
  const logout      = useAuthStore((s) => s.logout)
  const setAuthReady= useAuthStore((s) => s.setAuthReady)
  const isAuthReady = useAuthStore((s) => s.isAuthReady)

  // Proactive token refresh — schedules a timer whenever accessToken changes
  useTokenRefresh()

  // Bootstrap: on mount, try to restore session from the HttpOnly refresh cookie.
  // If the cookie is still valid, setAuth and continue.
  // If not (expired / first visit), just logout and show login.
  useEffect(() => {
    let cancelled = false

    refreshSession()
      .then((data) => {
        if (!cancelled) setAuth(data.user, data.accessToken)
      })
      .catch(() => {
        if (!cancelled) logout()
      })
      .finally(() => {
        if (!cancelled) setAuthReady()
      })

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Show spinner until we know whether the user is authenticated
  if (!isAuthReady) return <BootstrapScreen />

  return (
    <Routes>
      {/* Public */}
      <Route
        path="/login"
        element={<GuestRoute><Login /></GuestRoute>}
      />

      {/* Protected */}
      <Route
        path="/dashboard"
        element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
      />
      <Route
        path="/staff"
        element={<ProtectedRoute><Staff /></ProtectedRoute>}
      />
      <Route
        path="/staff/:id"
        element={<ProtectedRoute><StaffDetail /></ProtectedRoute>}
      />
      <Route
        path="/attendance"
        element={<ProtectedRoute><Attendance /></ProtectedRoute>}
      />
      <Route
        path="/attendance/admin"
        element={<ProtectedRoute><AttendanceAdmin /></ProtectedRoute>}
      />
      <Route
        path="/companies"
        element={<ProtectedRoute><Companies /></ProtectedRoute>}
      />
      <Route
        path="/companies/overview"
        element={<ProtectedRoute><CompanyOverview /></ProtectedRoute>}
      />
      {/* Chi tiết KH — 2 chế độ: /ho-so (tab nghiệp vụ) và /bang-du-lieu (bảng tùy biến).
          Route trần /companies/:id sẽ tự chuyển hướng về tab dùng gần nhất. */}
      <Route
        path="/companies/:id"
        element={<ProtectedRoute><CompanyDetail /></ProtectedRoute>}
      />
      <Route
        path="/companies/:id/:mode"
        element={<ProtectedRoute><CompanyDetail /></ProtectedRoute>}
      />
      <Route
        path="/companies/:id/:mode/:tabId"
        element={<ProtectedRoute><CompanyDetail /></ProtectedRoute>}
      />

      <Route
        path="/settings"
        element={<ProtectedRoute><Settings /></ProtectedRoute>}
      />
      <Route
        path="/tasks"
        element={<ProtectedRoute><Tasks /></ProtectedRoute>}
      />
      <Route
        path="/tasks/:id"
        element={<ProtectedRoute><TaskDetail /></ProtectedRoute>}
      />
      <Route
        path="/task-types"
        element={<Navigate to="/settings?section=task-types" replace />}
      />
      <Route
        path="/schedules"
        element={<Navigate to="/companies" replace />}
      />
      <Route
        path="/credentials"
        element={<Navigate to="/companies" replace />}
      />
      <Route
        path="/payroll"
        element={<ProtectedRoute><Payroll /></ProtectedRoute>}
      />
      <Route
        path="/payroll/:id"
        element={<ProtectedRoute><PayrollDetail /></ProtectedRoute>}
      />
      <Route
        path="/reports"
        element={<ProtectedRoute><Reports /></ProtectedRoute>}
      />
      <Route
        path="/progress-matrix"
        element={<ProtectedRoute><ProgressMatrix /></ProtectedRoute>}
      />
      <Route
        path="/notifications"
        element={<ProtectedRoute><Notifications /></ProtectedRoute>}
      />

      {/* TODO Phase 2: implement ChangePassword page.
          Redirects to dashboard until the page exists. */}
      <Route
        path="/change-password"
        element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>}
      />

      {/* CDR management */}
      <Route
        path="/client-requests"
        element={<ProtectedRoute><AdminClientRequests /></ProtectedRoute>}
      />

      {/* Internal assignments */}
      <Route
        path="/internal-assignments"
        element={<ProtectedRoute><InternalAssignments /></ProtectedRoute>}
      />
      <Route
        path="/internal-assignments/documents"
        element={<ProtectedRoute><InternalDocLinks /></ProtectedRoute>}
      />

      {/* Màn hình mobile (Chấm công + Ghi chú nhanh) */}
      <Route
        path="/m"
        element={<ProtectedRoute><MobileHome /></ProtectedRoute>}
      />

      {/* Phase 17 — Public form (no auth required) */}
      <Route path="/public/form/:token" element={<PublicForm />} />

      {/* Catch-all — mobile → /m, desktop → /dashboard */}
      <Route path="/" element={<Navigate to={homePath()} replace />} />
      <Route path="*" element={<Navigate to={homePath()} replace />} />
    </Routes>
  )
}

// ── Root export ───────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <AppRoutes />
      </SocketProvider>
      <ToastContainer />
    </BrowserRouter>
  )
}
