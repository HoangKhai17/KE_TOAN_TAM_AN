import api from './axios'

export async function listCompanies(params = {}) {
  const { data } = await api.get('/companies', { params })
  return data.data  // { companies, pagination }
}

export async function getCompany(id) {
  const { data } = await api.get(`/companies/${id}`)
  return data.data.company
}

// Xuất tổng hợp nhiều công ty ra Excel/zip (admin) — server-side, trả về Blob
export async function exportCompanies(body) {
  const res = await api.post('/companies/export', body, { responseType: 'blob', timeout: 120000 })
  const cd = res.headers['content-disposition'] || ''
  const m = /filename="?([^"]+)"?/i.exec(cd)
  const filename = m ? m[1] : (body.layout === 'per_company' ? 'export.zip' : 'export.xlsx')
  return { blob: res.data, filename }
}

// Xem tổng hợp dữ liệu công ty trên hệ thống (JSON) — cùng RBAC như export
export async function overviewCompanies(body) {
  const { data } = await api.post('/companies/overview', body, { timeout: 120000 })
  return data.data  // { companyCount, sections: [{ key, label, columns, rows }] }
}

export async function createCompany(body) {
  const { data } = await api.post('/companies', body)
  return data.data.company
}

export async function updateCompany(id, body) {
  const { data } = await api.patch(`/companies/${id}`, body)
  return data.data.company
}

export async function terminateCompany(id) {
  await api.post(`/companies/${id}/terminate`)
}

export async function deleteCompany(id) {
  await api.delete(`/companies/${id}`)
}

export async function getAssignments(companyId) {
  const { data } = await api.get(`/companies/${companyId}/assignments`)
  return data.data.assignments
}

export async function assignStaff(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/assign`, body)
  return data.data
}

export async function getActivityLog(companyId, { page = 1, limit = 10 } = {}) {
  const { data } = await api.get(`/companies/${companyId}/activity`, { params: { page, limit } })
  return { activities: data.data.activities, total: data.data.total }
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(companyId) {
  const { data } = await api.get(`/companies/${companyId}/notes`)
  return data.data.notes
}

export async function createNote(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/notes`, body)
  return data.data.note
}

export async function updateNote(companyId, noteId, body) {
  const { data } = await api.patch(`/companies/${companyId}/notes/${noteId}`, body)
  return data.data.note
}

export async function deleteNote(companyId, noteId) {
  await api.delete(`/companies/${companyId}/notes/${noteId}`)
}

// ── Tùy chọn danh sách riêng của mỗi user: thứ tự kéo-thả + ghim ưu tiên ──────

export async function setCompanyOrder(orderedIds) {
  const { data } = await api.patch('/companies/order', { orderedIds })
  return data.data
}

export async function setCompanyPin(companyId, isPinned) {
  const { data } = await api.patch(`/companies/${companyId}/pin`, { isPinned })
  return data.data
}
