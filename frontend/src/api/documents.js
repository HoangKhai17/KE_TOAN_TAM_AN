import api from './axios'

export async function listDocuments(companyId, params = {}) {
  const { data } = await api.get(`/companies/${companyId}/documents`, { params })
  return data.data  // { documents, pagination }
}

export async function addDocumentLink(companyId, { name, url, category = 'khac', description, taskId } = {}) {
  const { data } = await api.post(`/companies/${companyId}/documents`, {
    name, url, category,
    description: description || undefined,
    taskId:      taskId      || undefined,
  })
  return data.data.document
}

export async function updateDocumentLink(companyId, documentId, updates) {
  const { data } = await api.patch(`/companies/${companyId}/documents/${documentId}`, updates)
  return data.data.document
}

export async function deleteDocument(companyId, documentId) {
  await api.delete(`/companies/${companyId}/documents/${documentId}`)
}

export async function attachToTask(companyId, documentId, taskId) {
  const { data } = await api.post(`/companies/${companyId}/documents/${documentId}/attach`, { taskId })
  return data.data.document
}
