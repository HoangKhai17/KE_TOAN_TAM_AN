import api from './axios'

// Re-export so callers only need to import from this one file
export { refreshSession } from './session'

export async function login({ email, password, rememberMe = true }) {
  const { data } = await api.post('/auth/login', { email, password, rememberMe })
  return data.data  // { accessToken, user }
}

export async function logout() {
  await api.post('/auth/logout')
}

// Cấu hình "giữ đăng nhập" (admin)
export async function getSessionConfig() {
  const { data } = await api.get('/auth/session-config')
  return data.data  // { sessionDays }
}
export async function setSessionConfig(days) {
  const { data } = await api.put('/auth/session-config', { days })
  return data.data  // { sessionDays }
}
