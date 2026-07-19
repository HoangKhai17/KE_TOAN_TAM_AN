import api from './axios'

export async function listTaskTypes(params = {}) {
  const { data } = await api.get('/task-types', { params })
  return data.data  // { taskTypes, grouped }
}

export async function getTaskType(id) {
  const { data } = await api.get(`/task-types/${id}`)
  return data.data.taskType
}

export async function createTaskType(body) {
  const { data } = await api.post('/task-types', body)
  return data.data.taskType
}

export async function updateTaskType(id, body) {
  const { data } = await api.patch(`/task-types/${id}`, body)
  return data.data.taskType
}

export async function toggleTaskType(id) {
  const { data } = await api.post(`/task-types/${id}/toggle`)
  return data.data.taskType
}

export async function deleteTaskType(id) {
  await api.delete(`/task-types/${id}`)
}

// Checklist
export async function getChecklist(id) {
  const { data } = await api.get(`/task-types/${id}/checklist`)
  return data.data.steps
}

export async function addChecklistStep(id, stepText, level = 0) {
  const { data } = await api.post(`/task-types/${id}/checklist`, { stepText, level })
  return data.data.step
}

export async function updateChecklistStep(id, stepId, body) {
  const { data } = await api.patch(`/task-types/${id}/checklist/${stepId}`, body)
  return data.data.step
}

export async function deleteChecklistStep(id, stepId) {
  await api.delete(`/task-types/${id}/checklist/${stepId}`)
}

export async function reorderChecklist(id, steps) {
  const { data } = await api.post(`/task-types/${id}/checklist/reorder`, { steps })
  return data.data.steps
}

// Custom Fields
export async function getCustomFields(id) {
  const { data } = await api.get(`/task-types/${id}/fields`)
  return data.data.fields
}

export async function addCustomField(id, body) {
  const { data } = await api.post(`/task-types/${id}/fields`, body)
  return data.data.field
}

export async function updateCustomField(id, fieldId, body) {
  const { data } = await api.patch(`/task-types/${id}/fields/${fieldId}`, body)
  return data.data.field
}

export async function deleteCustomField(id, fieldId) {
  await api.delete(`/task-types/${id}/fields/${fieldId}`)
}

// ── Đồng bộ công việc đã phát sinh theo mẫu ──────────────────────────────────
// preview KHÔNG ghi gì; apply mới thực sự cập nhật.
export async function previewSyncTasks(id, { includeCompleted = true, theoLoaiTru = false } = {}) {
  const { data } = await api.get(`/task-types/${id}/sync-tasks/preview`, {
    params: { includeCompleted: includeCompleted ? '1' : '0', theoLoaiTru: theoLoaiTru ? '1' : '0' },
  })
  return data.data
}

// taskIds = danh sách công việc muốn đồng bộ; bỏ trống = tất cả.
// LƯU Ý: body phải là object, KHÔNG được là null — axios sẽ gửi chuỗi "null"
// và body-parser (strict) từ chối với lỗi 400.
export async function applySyncTasks(id, { includeCompleted = true, taskIds, theoLoaiTru = false } = {}) {
  const { data } = await api.post(`/task-types/${id}/sync-tasks`,
    taskIds?.length ? { taskIds } : {},
    { params: { includeCompleted: includeCompleted ? '1' : '0', theoLoaiTru: theoLoaiTru ? '1' : '0' } })
  return data.data
}

// ─── TEMP: dọn tiêu đề công việc tự sinh cũ. XOÁ CẢ KHỐI NÀY sau khi chạy xong ───
export async function previewRenameTitles() {
  const { data } = await api.get('/task-types/rename-auto-titles/preview')
  return data.data
}

export async function applyRenameTitles() {
  const { data } = await api.post('/task-types/rename-auto-titles', {})
  return data.data
}
// ─── hết khối TEMP ───
