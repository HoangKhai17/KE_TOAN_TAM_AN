import api from './axios'

// ── Attendance Records ────────────────────────────────────────────────────────

export const listAttendanceRecords = (params) =>
  api.get('/attendance/records', { params }).then((r) => r.data)

export const upsertAttendanceRecord = (body) =>
  api.post('/attendance/records', body).then((r) => r.data)

export const deleteAttendanceRecord = (id) =>
  api.delete(`/attendance/records/${id}`)

// ── Leave Requests ────────────────────────────────────────────────────────────

export const listLeaveRequests = (params) =>
  api.get('/attendance/leave', { params }).then((r) => r.data)

export const createLeaveRequest = (body) =>
  api.post('/attendance/leave', body).then((r) => r.data)

export const reviewLeaveRequest = (id, body) =>
  api.patch(`/attendance/leave/${id}/review`, body).then((r) => r.data)

export const cancelLeaveRequest = (id) =>
  api.patch(`/attendance/leave/${id}/cancel`).then((r) => r.data)

// ── Summary ───────────────────────────────────────────────────────────────────

export const getAttendanceSummary = (params) =>
  api.get('/attendance/summary', { params }).then((r) => r.data)
