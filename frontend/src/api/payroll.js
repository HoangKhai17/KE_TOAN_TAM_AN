import api from './axios'

export async function listPeriods(params = {}) {
  const { data } = await api.get('/payroll', { params })
  return data.data
}

export async function listDistinctYears() {
  const { data } = await api.get('/payroll/years')
  return data.data.years
}

export async function createPeriod(body) {
  const { data } = await api.post('/payroll', body)
  return data.data.period
}

export async function getPeriod(id) {
  const { data } = await api.get(`/payroll/${id}`)
  return data.data.period
}

export async function updatePeriod(id, body) {
  const { data } = await api.patch(`/payroll/${id}`, body)
  return data.data.period
}

export async function confirmPeriod(id) {
  const { data } = await api.post(`/payroll/${id}/confirm`)
  return data.data.period
}

export async function markPaid(id) {
  const { data } = await api.post(`/payroll/${id}/mark-paid`)
  return data.data.period
}

export async function exportExcel(id) {
  const response = await api.get(`/payroll/${id}/export`, { responseType: 'blob', timeout: 120000 })
  return response
}

export async function exportExcelCustom(id, params) {
  return api.get(`/payroll/${id}/export-custom`, { params, responseType: 'blob', timeout: 120000 })
}

export async function listRecords(id) {
  const { data } = await api.get(`/payroll/${id}/records`)
  return data.data.records
}

export async function upsertRecord(id, body) {
  const { data } = await api.put(`/payroll/${id}/records`, body)
  return data.data.record
}

export async function deleteRecord(id, recordId) {
  await api.delete(`/payroll/${id}/records/${recordId}`)
}

export async function sendPayrollEmails(id) {
  const { data } = await api.post(`/payroll/${id}/send-emails`)
  return data.data
}
