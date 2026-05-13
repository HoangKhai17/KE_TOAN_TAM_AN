import api from './axios'

export async function listDocuments(companyId, params = {}) {
  const { data } = await api.get(`/companies/${companyId}/documents`, { params })
  return data.data  // { documents, pagination }
}

export async function uploadDocument(companyId, file, { category = 'khac', taskId } = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('category', category)
  if (taskId) form.append('taskId', taskId)
  const { data } = await api.post(`/companies/${companyId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data.data.document
}

export async function deleteDocument(companyId, documentId) {
  await api.delete(`/companies/${companyId}/documents/${documentId}`)
}

export async function getLinkUrl(companyId, documentId) {
  const { data } = await api.get(`/companies/${companyId}/documents/${documentId}/link`)
  return data.data.url
}

export async function attachToTask(companyId, documentId, taskId) {
  const { data } = await api.post(`/companies/${companyId}/documents/${documentId}/attach`, { taskId })
  return data.data.document
}
