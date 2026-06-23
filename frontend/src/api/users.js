import api from './axios'

export async function listUsers(params = {}) {
  const { data } = await api.get('/users', { params })
  return data.data  // { users, pagination }
}

// Minimal user list for dropdowns — accessible to all roles (not admin-only)
export async function listUserOptions(params = {}) {
  const { data } = await api.get('/users/options', { params })
  return data.data  // { users: [{ id, name, role }] }
}

export async function getUser(id) {
  const { data } = await api.get(`/users/${id}`)
  return data.data.user
}

export async function createUser(body) {
  const { data } = await api.post('/users', body)
  return data.data.user
}

export async function updateUser(id, body) {
  const { data } = await api.patch(`/users/${id}`, body)
  return data.data.user
}

export async function updateUserStatus(id, status) {
  const { data } = await api.patch(`/users/${id}/status`, { status })
  return data.data.user
}

export async function deleteUser(id) {
  await api.delete(`/users/${id}`)
}

export async function resetUserPassword(id, newPassword) {
  const { data } = await api.patch(`/users/${id}/reset-password`, { newPassword })
  return data.data.user
}

export async function exportStaffExcel(params = {}) {
  const { data } = await api.get('/users/export', { params, responseType: 'blob', timeout: 120000 })
  return data
}
