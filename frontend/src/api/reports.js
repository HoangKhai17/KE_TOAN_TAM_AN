import api from './axios'

export const getOverviewReport = (params) => api.get('/reports/overview', { params }).then((r) => r.data)
export const getStaffReport    = (params) => api.get('/reports/staff',    { params }).then((r) => r.data)
export const getCompanyReport  = (params) => api.get('/reports/company',  { params }).then((r) => r.data)
export const getSlaReport      = (params) => api.get('/reports/sla',      { params }).then((r) => r.data)
export const getAgingReport    = (params) => api.get('/reports/aging',    { params }).then((r) => r.data)
export const getVelocityReport = (params) => api.get('/reports/velocity', { params }).then((r) => r.data)
export const getForecastReport = (params) => api.get('/reports/forecast', { params }).then((r) => r.data)

export async function exportReport(type, params = {}) {
  const res = await api.get(`/reports/export/${type}`, {
    params,
    responseType: 'blob',
    timeout: 120000,
  })
  const url  = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href  = url
  link.setAttribute('download', `${type}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
