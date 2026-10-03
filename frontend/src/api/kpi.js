import api from './axios'

// Danh sách KPI tháng (admin: tất cả NV; staff: chỉ mình). Trả { closed, rows }
export async function listKpi(year, month) {
  const { data } = await api.get('/kpi', { params: { year, month } })
  return data.data
}

// Chi tiết breakdown 1 NV. Trả { closed, byCompany, byType }. range = { from, to } (ưu tiên hơn year/month).
export async function getKpiDetail(userId, year, month, range = {}) {
  const params = { year, month }
  if (range.from) params.from = range.from
  if (range.to) params.to = range.to
  const { data } = await api.get(`/kpi/${userId}`, { params })
  return data.data
}

// Từng task của 1 NV trong kỳ. Trả { tasks: [...] }. range = { from, to }.
export async function getKpiUserTasks(userId, year, month, range = {}) {
  const params = { year, month }
  if (range.from) params.from = range.from
  if (range.to) params.to = range.to
  const { data } = await api.get(`/kpi/${userId}/tasks`, { params })
  return data.data.tasks
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
// filters (admin): { role: 'staff'|'admin', userIds: [] } — bỏ trống = tất cả.
export async function getKpiPerformance(year, month, filters = {}) {
  const params = { year, month }
  if (filters.role) params.role = filters.role
  if (Array.isArray(filters.userIds) && filters.userIds.length) params.userIds = filters.userIds.join(',')
  if (Array.isArray(filters.sources) && filters.sources.length) params.sources = filters.sources.join(',')
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  const { data } = await api.get('/kpi/performance', { params })
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
