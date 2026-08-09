import api from './axios'

export async function listCredentials(companyId, params = {}) {
  const { data } = await api.get(`/companies/${companyId}/credentials`, { params })
  return data.data.credentials
}

export async function createCredential(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/credentials`, body)
  return data.data.credential
}

export async function updateCredential(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/credentials/${id}`, body)
  return data.data.credential
}

export async function deleteCredential(companyId, id) {
  await api.delete(`/companies/${companyId}/credentials/${id}`)
}

export async function reorderCredentials(companyId, orderedIds) {
  await api.patch(`/companies/${companyId}/credentials/reorder`, { orderedIds })
}

// Xem mật khẩu: buộc gửi kèm mật khẩu ĐĂNG NHẬP của user để re-auth (server verify)
export async function revealCredential(companyId, id, password) {
  const { data } = await api.post(`/companies/${companyId}/credentials/${id}/reveal`, { password })
  return data.data.password
}
