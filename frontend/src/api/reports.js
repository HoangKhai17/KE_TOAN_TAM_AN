import api from './axios'

// Chỉ còn báo cáo Dự báo (các loại khác đã gỡ bỏ theo yêu cầu).
export const getForecastReport = (params) => api.get('/reports/forecast', { params }).then((r) => r.data)
export const getForecastYears  = () => api.get('/reports/forecast/years').then((r) => r.data.years)

export async function exportReport(type, params = {}) {
  const res = await api.get(`/reports/export/${type}`, {
    params,
    responseType: 'blob',
    timeout: 120000,
  })
  const url  = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href  = url
  const today = new Date()
  const stamp = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  link.setAttribute('download', `${type}-${stamp}.xlsx`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}
