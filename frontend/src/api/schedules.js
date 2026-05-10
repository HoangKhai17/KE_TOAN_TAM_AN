import api from './axios'

export async function listCompanySchedules(companyId) {
  const { data } = await api.get(`/companies/${companyId}/schedules`)
  return data.data.schedules
}

export async function createCompanySchedule(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/schedules`, body)
  return data.data.schedule
}

export async function getSchedule(id) {
  const { data } = await api.get(`/schedules/${id}`)
  return data.data.schedule
}

export async function updateSchedule(id, body) {
  const { data } = await api.patch(`/schedules/${id}`, body)
  return data.data.schedule
}

export async function deleteSchedule(id) {
  await api.delete(`/schedules/${id}`)
}

export async function toggleSchedule(id) {
  const { data } = await api.post(`/schedules/${id}/toggle`)
  return data.data.schedule
}

export async function previewSchedule(id) {
  const { data } = await api.get(`/schedules/${id}/preview`)
  return data.data.dates
}
