import api from './axios'

export async function listDebts(companyId) {
  const { data } = await api.get(`/companies/${companyId}/nsnn`)
  return data.data.debts
}

export async function createDebt(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/nsnn`, body)
  return data.data.debt
}

export async function updateDebt(companyId, id, body) {
  const { data } = await api.patch(`/companies/${companyId}/nsnn/${id}`, body)
  return data.data.debt
}

export async function deleteDebt(companyId, id) {
  await api.delete(`/companies/${companyId}/nsnn/${id}`)
}

export async function batchImport(companyId, rows) {
  const { data } = await api.post(`/companies/${companyId}/nsnn/batch`, rows)
  return data.data // { inserted, failed, errors }
}

export async function exportDebts(companyId, fields = '') {
  const res = await api.get(`/companies/${companyId}/nsnn/export`, {
    params: fields ? { fields } : undefined,
    responseType: 'blob',
  })
  return res.data
}

export async function listColumns(companyId) {
  const { data } = await api.get(`/companies/${companyId}/nsnn/columns`)
  return data.data.columns
}

export async function createColumn(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/nsnn/columns`, body)
  return data.data.column
}

export async function deleteColumn(companyId, id) {
  await api.delete(`/companies/${companyId}/nsnn/columns/${id}`)
}
