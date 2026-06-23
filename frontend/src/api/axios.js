import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { refreshSession } from './session'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000, // fail-fast, tránh giữ kết nối treo vô hạn (docs/13 Pha A). Export dùng timeout riêng dài hơn.
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

    // 429 Too Many Requests — chờ (Retry-After + jitter) rồi thử lại tối đa 2 lần,
    // tránh "hammer" làm server càng quá tải (docs/13 Pha A)
    if (error.response?.status === 429 && originalRequest) {
      const tries = originalRequest._retry429 ?? 0
      if (tries < 2) {
        originalRequest._retry429 = tries + 1
        const ra = Number(error.response.headers?.['retry-after'])
        const waitMs = (Number.isFinite(ra) && ra > 0 ? ra : 1.5) * 1000 + Math.random() * 400
        await new Promise((resolve) => setTimeout(resolve, waitMs))
        return api(originalRequest)
      }
    }

    return Promise.reject(error)
  }
)

export default api
