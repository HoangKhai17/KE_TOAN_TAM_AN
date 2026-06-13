import api from './axios'

export async function listContracts(companyId) {
  const { data } = await api.get(`/companies/${companyId}/csc`)
  return data.data.contracts
}

export async function createContract(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/csc`, body)
  return data.data.contract
}

export async function updateContract(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/csc/${id}`, body)
  return data.data.contract
}

export async function deleteContract(companyId, id) {
  await api.delete(`/companies/${companyId}/csc/${id}`)
}

export async function exportContracts(companyId, fields = '') {
  const res = await api.get(`/companies/${companyId}/csc/export`, {
    params: fields ? { fields } : undefined,
    responseType: 'blob',
  })
  return res.data
}

export async function listColumns(companyId) {
  const { data } = await api.get(`/companies/${companyId}/csc/columns`)
  return data.data.columns
}

export async function createColumn(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/csc/columns`, body)
  return data.data.column
}

export async function deleteColumn(companyId, id) {
  await api.delete(`/companies/${companyId}/csc/columns/${id}`)
}
