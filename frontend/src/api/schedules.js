import api from './axios'

export async function listCompanySchedules(companyId) {
  const { data } = await api.get(`/companies/${companyId}/schedules`)
  return data.data.schedules
}

export async function createCompanySchedule(companyId, body) {
  const { data } = await api.post(`/companies/${companyId}/schedules`, body)
  return data.data.schedule
}

export async function getSchedule(id) {
  const { data } = await api.get(`/schedules/${id}`)
  return data.data.schedule
}

export async function updateSchedule(id, body) {
  const { data } = await api.patch(`/schedules/${id}`, body)
  return data.data.schedule
}

export async function deleteSchedule(id) {
  await api.delete(`/schedules/${id}`)
}

export async function toggleSchedule(id) {
  const { data } = await api.post(`/schedules/${id}/toggle`)
  return data.data.schedule
}

export async function previewSchedule(id) {
  const { data } = await api.get(`/schedules/${id}/preview`)
  return data.data.dates
}

// ── Console tập trung (admin) ─────────────────────────────────────────────────
export async function getRecurringOverview() {
  const { data } = await api.get('/schedules/overview')
  return data.data.overview
}

// maxDueDay: số 1–31 | '' (rỗng = xoá trần) — trần "ngày N hàng tháng" theo lịch
export async function setScheduleMaxDueDay(scheduleId, maxDueDay) {
  const { data } = await api.patch(`/schedules/overview/${scheduleId}`, { maxDueDay })
  return data.data
}

// ── Sinh bù kỳ (admin) ────────────────────────────────────────────────────────
// Bảng đối chiếu kỳ đáng-lẽ-có vs đã-có (months = cửa sổ lùi, mặc định 6)
export async function getSchedulePeriods(scheduleId, months = 6) {
  const { data } = await api.get(`/schedules/overview/${scheduleId}/periods`, { params: { months } })
  return data.data
}

// Sinh task cho các kỳ được chọn. periods = mảng 'yyyy-MM-dd'. force = sinh lại cả kỳ đã có.
export async function backfillSchedulePeriods(scheduleId, periods, force = false) {
  const { data } = await api.post(`/schedules/overview/${scheduleId}/backfill`, { periods, force })
  return data.data
}
