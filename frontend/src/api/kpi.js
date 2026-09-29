import api from './axios'

// Danh sách KPI tháng (admin: tất cả NV; staff: chỉ mình). Trả { closed, rows }
export async function listKpi(year, month) {
  const { data } = await api.get('/kpi', { params: { year, month } })
  return data.data
}

// Chi tiết breakdown 1 NV. Trả { closed, byCompany, byType }
export async function getKpiDetail(userId, year, month) {
  const { data } = await api.get(`/kpi/${userId}`, { params: { year, month } })
  return data.data
}

export async function closeKpiMonth(year, month) {
  const { data } = await api.post('/kpi/close', { year, month })
  return data.data
}

export async function reopenKpiMonth(year, month) {
  const { data } = await api.post('/kpi/reopen', { year, month })
  return data.data
}
