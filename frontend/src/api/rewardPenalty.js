import api from './axios'

// ── Quy tắc (admin) ──
export async function listRules(params = {}) {
  const { data } = await api.get('/reward-penalty/rules', { params })
  return data.data.rules
}
export async function createRule(body) {
  const { data } = await api.post('/reward-penalty/rules', body)
  return data.data.rule
}
export async function updateRule(id, body) {
  const { data } = await api.patch(`/reward-penalty/rules/${id}`, body)
  return data.data.rule
}
export async function deleteRule(id) {
  await api.delete(`/reward-penalty/rules/${id}`)
}

// ── Sổ ghi ──
export async function listEntries(params = {}) {
  const { data } = await api.get('/reward-penalty/entries', { params })
  return data.data.entries
}
export async function createEntry(body) {
  const { data } = await api.post('/reward-penalty/entries', body)
  return data.data.entry
}
export async function updateEntry(id, body) {
  const { data } = await api.patch(`/reward-penalty/entries/${id}`, body)
  return data.data.entry
}
export async function approveEntry(id) {
  const { data } = await api.post(`/reward-penalty/entries/${id}/approve`)
  return data.data.entry
}
export async function deleteEntry(id) {
  await api.delete(`/reward-penalty/entries/${id}`)
}

// Năm có dữ liệu (dropdown) — kèm năm hiện tại
export async function listYears() {
  const { data } = await api.get('/reward-penalty/years')
  return data.data.years
}

// ── Tổng hợp (admin) ──
export async function getSummary(year, month) {
  const { data } = await api.get('/reward-penalty/summary', { params: { year, month } })
  return data.data.summary
}
