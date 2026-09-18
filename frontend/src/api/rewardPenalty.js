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
// Giải trình dạng hội thoại (staff/admin nhắn trong 1 thread trên dòng)
export async function discussEntry(id, text) {
  const { data } = await api.post(`/reward-penalty/entries/${id}/discuss`, { text })
  return data.data.entry
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

// ── Quy đổi xếp loại (grades) ──
export async function listGrades(params = {}) {
  const { data } = await api.get('/reward-penalty/grades', { params })
  return data.data.grades
}
export async function createGrade(body) {
  const { data } = await api.post('/reward-penalty/grades', body)
  return data.data.grade
}
export async function updateGrade(id, body) {
  const { data } = await api.patch(`/reward-penalty/grades/${id}`, body)
  return data.data.grade
}
export async function deleteGrade(id) {
  await api.delete(`/reward-penalty/grades/${id}`)
}
