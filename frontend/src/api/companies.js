import api from './axios'

export async function listCompanies(params = {}) {
  const { data } = await api.get('/companies', { params })
  return data.data  // { companies, pagination }
}

export async function getCompany(id) {
  const { data } = await api.get(`/companies/${id}`)
  return data.data.company
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
