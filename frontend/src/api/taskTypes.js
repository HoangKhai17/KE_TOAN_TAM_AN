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

// Checklist
export async function getChecklist(id) {
  const { data } = await api.get(`/task-types/${id}/checklist`)
  return data.data.steps
}

export async function addChecklistStep(id, stepText) {
  const { data } = await api.post(`/task-types/${id}/checklist`, { stepText })
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
