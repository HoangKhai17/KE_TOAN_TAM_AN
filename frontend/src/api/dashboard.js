import api from './axios'

export const getDashboardSummary = (params) => api.get('/dashboard/summary', { params }).then((r) => r.data)
export const getDashboardCharts  = (params) => api.get('/dashboard/charts',  { params }).then((r) => r.data)
// Cảnh báo kế toán (hợp đồng / giấy phép sắp hết hạn). Trả { withinDays, total, overdue, dueSoon, contracts, licenses, items }
export const getAccountingAlerts = (withinDays = 30) =>
  api.get('/dashboard/accounting-alerts', { params: { withinDays } }).then((r) => r.data.data)

// Nguồn cảnh báo thuế: RAW rows + định nghĩa cột bảng tùy chỉnh (frontend tự đánh giá công thức Trạng thái)
export const getTaxAlertSources = () =>
  api.get('/dashboard/tax-alerts').then((r) => r.data.data)
