import api from './axios'

export async function listAssignments(params = {}) {
  const { data } = await api.get('/internal-assignments', { params })
  return data.data  // { items, pagination }
}

export async function getStats(params = {}) {
  const { data } = await api.get('/internal-assignments/meta/stats', { params })
  return data.data
}

export async function getYears() {
  const { data } = await api.get('/internal-assignments/meta/years')
  return data.data.years
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

// ── Checklist ─────────────────────────────────────────────────────────────────

export async function getChecklist(id) {
  const { data } = await api.get(`/internal-assignments/${id}/checklist`)
  return data.data.items
}

export async function addChecklistItem(id, text) {
  const { data } = await api.post(`/internal-assignments/${id}/checklist`, { text })
  return data.data.item
}

export async function updateChecklistItem(id, itemId, body) {
  const { data } = await api.patch(`/internal-assignments/${id}/checklist/${itemId}`, body)
  return data.data.item
}

export async function deleteChecklistItem(id, itemId) {
  await api.delete(`/internal-assignments/${id}/checklist/${itemId}`)
}

// ── Links ─────────────────────────────────────────────────────────────────────

export async function getLinks(id) {
  const { data } = await api.get(`/internal-assignments/${id}/links`)
  return data.data.links
}

export async function addLink(id, body) {
  const { data } = await api.post(`/internal-assignments/${id}/links`, body)
  return data.data.link
}

export async function deleteLink(id, linkId) {
  await api.delete(`/internal-assignments/${id}/links/${linkId}`)
}
