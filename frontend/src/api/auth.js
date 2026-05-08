import api from './axios'

// Re-export so callers only need to import from this one file
export { refreshSession } from './session'

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password })
  return data.data  // { accessToken, user }
}

export async function logout() {
  await api.post('/auth/logout')
}
