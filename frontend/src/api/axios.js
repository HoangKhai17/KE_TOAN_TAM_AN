import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { refreshSession } from './session'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401 (fallback for when proactive timer misses)
// refreshSession() deduplicates concurrent calls — no extra queue needed.
const SKIP_REFRESH_URLS = ['/auth/login', '/auth/refresh']

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const requestUrl      = originalRequest?.url ?? ''
    const skipRefresh     = SKIP_REFRESH_URLS.some((p) => requestUrl.includes(p))

    if (error.response?.status === 401 && !originalRequest._retry && !skipRefresh) {
      originalRequest._retry = true
      try {
        const data = await refreshSession()
        // Update both user and token — not just the token
        useAuthStore.getState().setAuth(data.user, data.accessToken)
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`
        return api(originalRequest)
      } catch (refreshError) {
        useAuthStore.getState().logout()
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
