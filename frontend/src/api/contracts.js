import api from './axios'

export async function listContracts(companyId) {
  const { data } = await api.get(`/companies/${companyId}/contracts`)
  return data.data.contracts
}

export async function createContract(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/contracts`, body)
  return data.data.contract
}

export async function updateContract(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/contracts/${id}`, body)
  return data.data.contract
}

export async function deleteContract(companyId, id) {
  await api.delete(`/companies/${companyId}/contracts/${id}`)
}
