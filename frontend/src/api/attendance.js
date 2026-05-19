import api from './axios'

// ── Check-in / Check-out ──────────────────────────────────────────────────────

export const checkIn  = (body = {}) => api.post('/attendance/check-in', body).then(r => r.data)
export const checkOut = (body = {}) => api.post('/attendance/check-out', body).then(r => r.data)
export const getToday = ()           => api.get('/attendance/today').then(r => r.data)

// ── Records ───────────────────────────────────────────────────────────────────

export const listAttendanceRecords = (params) =>
  api.get('/attendance/records', { params }).then(r => r.data)

export const getRecordsSummary = (params) =>
  api.get('/attendance/records/summary', { params }).then(r => r.data)

// ── Adjustments ───────────────────────────────────────────────────────────────

export const adjustRecord = (id, body) =>
  api.put(`/attendance/records/${id}/adjust`, body).then(r => r.data)

export const listRecordAdjustments = (id) =>
  api.get(`/attendance/records/${id}/adjustments`).then(r => r.data)

// ── Monthly Report & Payroll Sync ─────────────────────────────────────────────

export const getMonthlyReport = (params) =>
  api.get('/attendance/report', { params }).then(r => r.data)

export const syncPayroll = (payrollPeriodId) =>
  api.post('/attendance/sync-payroll', { payrollPeriodId }).then(r => r.data)

// ── Holidays ──────────────────────────────────────────────────────────────────

export const listHolidays = (year) =>
  api.get('/attendance/holidays', { params: year ? { year } : {} }).then(r => r.data.holidays ?? r.data)

export const createHoliday = (body) =>
  api.post('/attendance/holidays', body).then(r => r.data)

export const deleteHoliday = (id) =>
  api.delete(`/attendance/holidays/${id}`).then(r => r.data)

// ── Shifts ────────────────────────────────────────────────────────────────────

export const listShifts = (activeOnly = true) =>
  api.get('/shifts', { params: { activeOnly } }).then(r => r.data)

export const createShift = (body) =>
  api.post('/shifts', body).then(r => r.data)

export const updateShift = (id, body) =>
  api.put(`/shifts/${id}`, body).then(r => r.data)

// ── Work Schedules ────────────────────────────────────────────────────────────

export const listWorkSchedules = (params) =>
  api.get('/work-schedules', { params }).then(r => r.data)

export const generateMonthlySchedule = (body) =>
  api.post('/work-schedules/bulk', body).then(r => r.data)

// ── Leave Requests ────────────────────────────────────────────────────────────

export const listLeaveRequests = (params) =>
  api.get('/leave-requests', { params }).then(r => r.data)

export const createLeaveRequest = (body) =>
  api.post('/leave-requests', body).then(r => r.data)

export const approveLeaveRequest = (id) =>
  api.put(`/leave-requests/${id}/approve`).then(r => r.data)

export const rejectLeaveRequest = (id, body = {}) =>
  api.put(`/leave-requests/${id}/reject`, body).then(r => r.data)

export const cancelLeaveRequest = (id) =>
  api.delete(`/leave-requests/${id}/cancel`).then(r => r.data)

// ── Overtime Requests ─────────────────────────────────────────────────────────

export const listOvertimeRequests = (params) =>
  api.get('/overtime-requests', { params }).then(r => r.data)

export const createOvertimeRequest = (body) =>
  api.post('/overtime-requests', body).then(r => r.data)

export const approveOvertimeRequest = (id) =>
  api.put(`/overtime-requests/${id}/approve`).then(r => r.data)

export const rejectOvertimeRequest = (id, body = {}) =>
  api.put(`/overtime-requests/${id}/reject`, body).then(r => r.data)

// ── Attendance Settings ───────────────────────────────────────────────────────

export const getAttendanceSettings = () =>
  api.get('/attendance/settings').then(r => r.data)

export const updateAttendanceSettings = (body) =>
  api.patch('/attendance/settings', body).then(r => r.data)
