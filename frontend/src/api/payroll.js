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

export async function deletePeriod(id) {
  await api.delete(`/payroll/${id}`)
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

// Kéo Thưởng/Phạt (KPI) tháng {year,month} vào bảng lương của kỳ tương ứng.
export async function applyRewardPenalty(year, month) {
  const { data } = await api.post('/payroll/apply-reward-penalty', { year, month })
  return data.data  // { applied, missing, periodId, considered }
}

// ── Hồ sơ lương (cấu hình lương) ──
export async function listSalaries() {
  const { data } = await api.get('/payroll/salaries')
  return data.data.salaries
}
export async function getSalaryHistory(userId) {
  const { data } = await api.get(`/payroll/salaries/${userId}/history`)
  return data.data.history
}
export async function createSalary(body) {
  const { data } = await api.post('/payroll/salaries', body)
  return data.data.salary
}
export async function updateSalary(id, body) {
  const { data } = await api.patch(`/payroll/salaries/${id}`, body)
  return data.data.salary
}
export async function deleteSalary(id) {
  await api.delete(`/payroll/salaries/${id}`)
}
export async function generatePeriodRecords(id) {
  const { data } = await api.post(`/payroll/${id}/generate`)
  return data.data  // { generated, missingSalary, considered }
}
