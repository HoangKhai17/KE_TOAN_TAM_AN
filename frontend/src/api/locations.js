import api from './axios'

export async function listLocations(companyId, params = {}) {
  const { data } = await api.get(`/companies/${companyId}/locations`, { params })
  return data.data.locations
}

export async function createLocation(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/locations`, body)
  return data.data.location
}

export async function updateLocation(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/locations/${id}`, body)
  return data.data.location
}

export async function deleteLocation(companyId, id) {
  await api.delete(`/companies/${companyId}/locations/${id}`)
}
