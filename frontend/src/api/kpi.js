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

// Hiệu suất tổng hợp (KPI đúng hạn → điểm + thưởng/phạt → xếp loại → tiền). { closed, rows }
export async function getKpiPerformance(year, month) {
  const { data } = await api.get('/kpi/performance', { params: { year, month } })
  return data.data
}

// Mốc quy đổi % đúng hạn → điểm
export async function listKpiTiers() {
  const { data } = await api.get('/kpi/tiers')
  return data.data.tiers
}
export async function createKpiTier(body) {
  const { data } = await api.post('/kpi/tiers', body)
  return data.data.tier
}
export async function updateKpiTier(id, body) {
  const { data } = await api.patch(`/kpi/tiers/${id}`, body)
  return data.data.tier
}
export async function deleteKpiTier(id) {
  await api.delete(`/kpi/tiers/${id}`)
}
