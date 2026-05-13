import api from './axios'

export async function listNotifications({ page = 1, limit = 20, isRead, type } = {}) {
  const params = { page, limit }
  if (isRead !== undefined) params.is_read = isRead
  if (type) params.type = type
  const { data } = await api.get('/notifications', { params })
  return data.data
}

export async function getUnreadCount() {
  const { data } = await api.get('/notifications/unread-count')
  return data.data.count
}

export async function markOneRead(id) {
  const { data } = await api.patch(`/notifications/${id}/read`)
  return data.data.notification
}

export async function markAllRead() {
  const { data } = await api.post('/notifications/read-all')
  return data.data.updated
}

export async function deleteNotification(id) {
  await api.delete(`/notifications/${id}`)
}

export async function deleteManyNotifications(ids) {
  const { data } = await api.post('/notifications/delete-many', { ids })
  return data.data.deleted
}

export async function testEmail(cfg) {
  const { data } = await api.post('/system-configs/test-email', cfg)
  return data.data
}

export async function sendTestNotification() {
  const { data } = await api.post('/notifications/test')
  return data.data.notification
}
