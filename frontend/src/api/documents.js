import api from './axios'

export async function listDocuments(companyId, params = {}) {
  const { data } = await api.get(`/companies/${companyId}/documents`, { params })
  return data.data  // { documents, pagination }
}

// Tài liệu là LINK hoặc FILE:
//   link → truyền `url`
//   file → tải lên qua /attachments/company/:companyId trước, rồi truyền `attachmentId`
export async function addDocumentLink(
  companyId,
  { name, url, attachmentId, category = 'khac', description, taskId } = {},
) {
  const { data } = await api.post(`/companies/${companyId}/documents`, {
    name, category,
    // Chỉ gửi ĐÚNG MỘT trong hai — backend có ràng buộc phải có url hoặc file,
    // không được cả hai. Gửi kèm cả hai (kể cả undefined) là hỏng validate.
    url:          attachmentId ? undefined : url,
    attachmentId: attachmentId || undefined,
    description:  description  || undefined,
    taskId:       taskId       || undefined,
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
