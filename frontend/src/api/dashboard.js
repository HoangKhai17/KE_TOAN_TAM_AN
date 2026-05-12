import api from './axios'

export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params }).then((r) => r.data)
export const getDashboardCharts  = (params) => api.get('/dashboard/charts',  { params }).then((r) => r.data)
