const svc = require('./attendance.service')

// ── Attendance Records ────────────────────────────────────────────────────────

async function listAttendance(req, res, next) {
  try {
    const { userId, from, to, status, page, limit } = req.query
    const isAdmin = req.user.role === 'admin'
    const effectiveUserId = isAdmin ? (userId || undefined) : req.user.id
    const result = await svc.listAttendanceRecords({
      userId: effectiveUserId,
      from, to, status,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function upsertAttendance(req, res, next) {
  try {
    const { userId, workDate, checkIn, checkOut, status, notes } = req.body
    if (!workDate) return res.status(400).json({ error: { message: 'workDate is required' } })
    const record = await svc.upsertAttendanceRecord({
      userId:    userId || req.user.id,
      workDate, checkIn, checkOut, status, notes,
      createdBy: req.user.id,
    })
    res.json(record)
  } catch (err) { next(err) }
}

async function deleteAttendance(req, res, next) {
  try {
    await svc.deleteAttendanceRecord(req.params.id)
    res.status(204).send()
  } catch (err) { next(err) }
}

// ── Leave Requests ────────────────────────────────────────────────────────────

async function listLeave(req, res, next) {
  try {
    const { userId, status, leaveType, from, to, page, limit } = req.query
    const isAdmin = req.user.role === 'admin'
    const effectiveUserId = isAdmin ? (userId || undefined) : req.user.id
    const result = await svc.listLeaveRequests({
      userId: effectiveUserId,
      status, leaveType, from, to,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function createLeave(req, res, next) {
  try {
    const { leaveType, startDate, endDate, reason } = req.body
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: { message: 'leaveType, startDate và endDate là bắt buộc' } })
    }
    const request = await svc.createLeaveRequest({
      userId: req.user.id,
      leaveType, startDate, endDate, reason,
    })
    res.status(201).json(request)
  } catch (err) { next(err) }
}

async function reviewLeave(req, res, next) {
  try {
    const { status, reviewNote } = req.body
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: { message: 'status phải là approved hoặc rejected' } })
    }
    const request = await svc.reviewLeaveRequest(req.params.id, {
      status, reviewNote, reviewedBy: req.user.id,
    })
    res.json(request)
  } catch (err) { next(err) }
}

async function cancelLeave(req, res, next) {
  try {
    const request = await svc.cancelLeaveRequest(req.params.id, req.user.id)
    res.json(request)
  } catch (err) { next(err) }
}

// ── Summary ───────────────────────────────────────────────────────────────────

async function getSummary(req, res, next) {
  try {
    const { userId, year, month } = req.query
    const now = new Date()
    const summary = await svc.getAttendanceSummary({
      userId: userId || undefined,
      year:  year  ? parseInt(year,  10) : now.getFullYear(),
      month: month ? parseInt(month, 10) : now.getMonth() + 1,
    })
    res.json(summary)
  } catch (err) { next(err) }
}

module.exports = {
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  listLeave,
  createLeave,
  reviewLeave,
  cancelLeave,
  getSummary,
}
