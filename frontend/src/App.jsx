import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'

// Layouts (to be built in Phase 2)
function AppLayout({ children }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>
}

// Placeholder pages
function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Kế Toán Tâm An</h1>
        <p className="text-sm text-gray-500">Login page — Phase 2</p>
      </div>
    </div>
  )
}

function DashboardPage() {
  return (
    <AppLayout>
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-2">Phase 13</p>
      </div>
    </AppLayout>
  )
}

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
