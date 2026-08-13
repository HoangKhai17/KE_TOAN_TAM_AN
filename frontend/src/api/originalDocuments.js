import api from './axios'

export async function listOriginalDocuments(companyId) {
  const { data } = await api.get(`/companies/${companyId}/original-documents`)
  return data.data.originalDocuments
}

export async function createOriginalDocument(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/original-documents`, body)
  return data.data.originalDocument
}

export async function updateOriginalDocument(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/original-documents/${id}`, body)
  return data.data.originalDocument
}

export async function deleteOriginalDocument(companyId, id) {
  await api.delete(`/companies/${companyId}/original-documents/${id}`)
}
