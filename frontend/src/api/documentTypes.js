import api from './axios'

export async function listDocumentTypes(companyId) {
  const { data } = await api.get(`/companies/${companyId}/document-types`)
  return data.data.documentTypes
}

export async function createDocumentType(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/document-types`, body)
  return data.data.documentType
}

export async function updateDocumentType(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/document-types/${id}`, body)
  return data.data.documentType
}

export async function deleteDocumentType(companyId, id) {
  await api.delete(`/companies/${companyId}/document-types/${id}`)
}
