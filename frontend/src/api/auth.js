import api from './axios'

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password })
  return data.data
}

export async function logout() {
  await api.post('/auth/logout')
}

export async function refreshToken() {
  const { data } = await api.post('/auth/refresh')
  return data.data
}
