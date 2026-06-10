import api from './axios'

// ── Contracts ─────────────────────────────────────────────────────────────────

export async function listContracts(companyId) {
  const { data } = await api.get(`/companies/${companyId}/labor-contracts`)
  return data.data.contracts
}

export async function createContract(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/labor-contracts`, body)
  return data.data.contract
}

export async function updateContract(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/labor-contracts/${id}`, body)
  return data.data.contract
}

export async function deleteContract(companyId, id) {
  await api.delete(`/companies/${companyId}/labor-contracts/${id}`)
}

export async function exportContracts(companyId, fields = '') {
  const res = await api.get(`/companies/${companyId}/labor-contracts/export`, {
    params: fields ? { fields } : undefined,
    responseType: 'blob',
  })
  return res.data
}

// ── Columns ───────────────────────────────────────────────────────────────────

export async function listColumns(companyId) {
  const { data } = await api.get(`/companies/${companyId}/labor-contracts/columns`)
  return data.data.columns
}

export async function createColumn(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/labor-contracts/columns`, body)
  return data.data.column
}

export async function deleteColumn(companyId, id) {
  await api.delete(`/companies/${companyId}/labor-contracts/columns/${id}`)
}
