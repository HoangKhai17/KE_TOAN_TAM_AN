import api from './axios'

export async function listAssignments(params = {}) {
  const { data } = await api.get('/internal-assignments', { params })
  return data.data  // { items, pagination }
}

export async function getStats() {
  const { data } = await api.get('/internal-assignments/meta/stats')
  return data.data
}

export async function getAssignment(id) {
  const { data } = await api.get(`/internal-assignments/${id}`)
  return data.data.item
}

export async function createAssignment(body) {
  const { data } = await api.post('/internal-assignments', body)
  return data.data.item
}

export async function updateAssignment(id, body) {
  const { data } = await api.patch(`/internal-assignments/${id}`, body)
  return data.data.item
}

export async function deleteAssignment(id) {
  await api.delete(`/internal-assignments/${id}`)
}

export async function sendAssignment(id) {
  const { data } = await api.post(`/internal-assignments/${id}/send`)
  return data.data.item
}

export async function cancelAssignment(id) {
  await api.post(`/internal-assignments/${id}/cancel`)
}

export async function closeAssignment(id) {
  await api.post(`/internal-assignments/${id}/close`)
}

export async function acceptAssignment(id) {
  const { data } = await api.post(`/internal-assignments/${id}/accept`)
  return data.data.item
}

export async function progressAssignment(id) {
  const { data } = await api.post(`/internal-assignments/${id}/progress`)
  return data.data.item
}

export async function completeAssignment(id, note) {
  const { data } = await api.post(`/internal-assignments/${id}/complete`, { note: note || null })
  return data.data.item
}

export async function rejectAssignment(id, note) {
  const { data } = await api.post(`/internal-assignments/${id}/reject`, { note })
  return data.data.item
}

export async function addComment(id, content) {
  const { data } = await api.post(`/internal-assignments/${id}/comments`, { content })
  return data.data.comment
}

export async function deleteComment(id, commentId) {
  await api.delete(`/internal-assignments/${id}/comments/${commentId}`)
}
