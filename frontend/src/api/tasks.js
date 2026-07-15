import api from './axios'

// ─── Core ─────────────────────────────────────────────────────────────────────

export async function listTasks(params = {}) {
  const { data } = await api.get('/tasks', { params })
  return data.data  // { tasks, pagination }
}

export async function getTaskYears() {
  const { data } = await api.get('/tasks/meta/years')
  return data.data.years  // number[]
}

// Xuất Excel: gửi cột + dữ liệu đã render (đúng như bảng) → nhận file Blob
export async function exportTasksExcel(body) {
  const { data } = await api.post('/tasks/export', body, { responseType: 'blob', timeout: 120000 })
  return data
}

export async function getTask(id) {
  const { data } = await api.get(`/tasks/${id}`)
  return data.data.task
}

export async function createTask(body) {
  const { data } = await api.post('/tasks', body)
  return data.data.task
}

export async function updateTask(id, body) {
  const { data } = await api.patch(`/tasks/${id}`, body)
  return data.data.task
}

export async function deleteTask(id) {
  await api.delete(`/tasks/${id}`)
}

export async function changeTaskStatus(id, body) {
  const { data } = await api.post(`/tasks/${id}/status`, body)
  return data.data.task
}

export async function getTaskActivity(id, params = {}) {
  const { data } = await api.get(`/tasks/${id}/activity`, { params })
  return data.data.logs
}

// ─── Checklist ────────────────────────────────────────────────────────────────

export async function getTaskChecklist(id) {
  const { data } = await api.get(`/tasks/${id}/checklist`)
  return data.data.items
}

export async function addTaskChecklistItem(id, body) {
  const { data } = await api.post(`/tasks/${id}/checklist`, body)
  return data.data.item
}

export async function updateTaskChecklistItem(id, itemId, body) {
  const { data } = await api.patch(`/tasks/${id}/checklist/${itemId}`, body)
  // Gắn kèm cờ autoCompleted (khi tích đủ checklist → task tự hoàn thành) vào item
  return { ...data.data.item, autoCompleted: data.data.autoCompleted === true }
}

export async function deleteTaskChecklistItem(id, itemId) {
  await api.delete(`/tasks/${id}/checklist/${itemId}`)
}

// items: [{ id, stepOrder }] theo thứ tự mới (kéo thả)
export async function reorderTaskChecklist(id, items) {
  const { data } = await api.post(`/tasks/${id}/checklist/reorder`, { items })
  return data.data.items
}

// ─── Dependencies ─────────────────────────────────────────────────────────────

export async function getTaskDependencies(id) {
  const { data } = await api.get(`/tasks/${id}/dependencies`)
  return data.data.dependencies
}

export async function addTaskDependency(id, body) {
  const { data } = await api.post(`/tasks/${id}/dependencies`, body)
  return data.data.dependency
}

export async function deleteTaskDependency(id, depId) {
  await api.delete(`/tasks/${id}/dependencies/${depId}`)
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function getTaskComments(id, params = {}) {
  const { data } = await api.get(`/tasks/${id}/comments`, { params })
  return data.data.comments
}

export async function addTaskComment(id, body) {
  const { data } = await api.post(`/tasks/${id}/comments`, body)
  return data.data.comment
}

export async function updateTaskComment(id, commentId, body) {
  const { data } = await api.patch(`/tasks/${id}/comments/${commentId}`, body)
  return data.data.comment
}

export async function deleteTaskComment(id, commentId) {
  await api.delete(`/tasks/${id}/comments/${commentId}`)
}

// ─── Time Logs ────────────────────────────────────────────────────────────────

export async function getTaskTimeLogs(id) {
  const { data } = await api.get(`/tasks/${id}/time-logs`)
  return data.data.timeLogs
}

export async function addTaskTimeLog(id, body) {
  const { data } = await api.post(`/tasks/${id}/time-logs`, body)
  return data.data.timeLog
}

export async function deleteTaskTimeLog(id, logId) {
  await api.delete(`/tasks/${id}/time-logs/${logId}`)
}

// ─── Custom Fields ────────────────────────────────────────────────────────────

export async function getTaskCustomFields(id) {
  const { data } = await api.get(`/tasks/${id}/custom-fields`)
  return data.data.fields
}

export async function upsertTaskCustomFields(id, body) {
  const { data } = await api.put(`/tasks/${id}/custom-fields`, body)
  return data.data.fields
}

// ─── Links ────────────────────────────────────────────────────────────────────

export async function getTaskLinks(id) {
  const { data } = await api.get(`/tasks/${id}/links`)
  return data.data.links
}

export async function addTaskLink(id, body) {
  const { data } = await api.post(`/tasks/${id}/links`, body)
  return data.data.link
}

export async function deleteTaskLink(id, linkId) {
  await api.delete(`/tasks/${id}/links/${linkId}`)
}
