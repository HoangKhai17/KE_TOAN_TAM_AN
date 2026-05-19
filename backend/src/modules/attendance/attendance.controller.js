const svc        = require('./attendance.service')
const adjSvc     = require('./adjustments.service')
const reportSvc  = require('./report.service')
const settingsSvc = require('./settings.service')

async function checkIn(req, res, next) {
  try {
    const { method, notes } = req.body
    const ip         = req.ip
    const deviceInfo = req.headers['user-agent']?.slice(0, 200)
    const result = await svc.checkIn({ userId: req.user.id, method, notes, ip, deviceInfo })
    res.status(201).json(result)
  } catch (err) { next(err) }
}

async function checkOut(req, res, next) {
  try {
    const { method, notes } = req.body
    const ip         = req.ip
    const deviceInfo = req.headers['user-agent']?.slice(0, 200)
    const result = await svc.checkOut({ userId: req.user.id, method, notes, ip, deviceInfo })
    res.json(result)
  } catch (err) { next(err) }
}

async function getToday(req, res, next) {
  try {
    const result = await svc.getToday(req.user.id)
    res.json(result)
  } catch (err) { next(err) }
}

async function listRecords(req, res, next) {
  try {
    const { userId, month, year, status, page, limit } = req.query
    const now     = new Date()
    const isAdmin = req.user.role === 'admin'
    const effectiveUserId = isAdmin ? (userId || undefined) : req.user.id

    const result = await svc.listAttendanceRecords({
      userId: effectiveUserId,
      month:  month ? parseInt(month, 10) : now.getMonth() + 1,
      year:   year  ? parseInt(year,  10) : now.getFullYear(),
      status,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 31,
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function getSummary(req, res, next) {
  try {
    const { userId, month, year } = req.query
    const now = new Date()
    const summary = await svc.getAttendanceSummary({
      userId: userId || undefined,
      year:   year  ? parseInt(year,  10) : now.getFullYear(),
      month:  month ? parseInt(month, 10) : now.getMonth() + 1,
    })
    res.json(summary)
  } catch (err) { next(err) }
}

// CC-5 — Adjustments

async function adjustRecord(req, res, next) {
  try {
    const { field, newValue, reason } = req.body
    if (!field || newValue === undefined || !reason) {
      return res.status(400).json({ error: { message: 'field, newValue và reason là bắt buộc' } })
    }
    const result = await adjSvc.adjustAttendanceRecord(req.params.id, {
      field, newValue, reason, adjustedBy: req.user.id,
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function listAdjustments(req, res, next) {
  try {
    const result = await adjSvc.listAdjustments(req.params.id)
    res.json(result)
  } catch (err) { next(err) }
}

// CC-5 — Report & Payroll Sync

async function getReport(req, res, next) {
  try {
    const { month, year } = req.query
    const now = new Date()
    const result = await reportSvc.getMonthlyReport({
      month: month ? parseInt(month, 10) : now.getMonth() + 1,
      year:  year  ? parseInt(year,  10) : now.getFullYear(),
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function syncPayroll(req, res, next) {
  try {
    const { payrollPeriodId } = req.body
    if (!payrollPeriodId) {
      return res.status(400).json({ error: { message: 'payrollPeriodId là bắt buộc' } })
    }
    const result = await reportSvc.syncAttendanceToPayroll(payrollPeriodId)
    res.json(result)
  } catch (err) { next(err) }
}

// CC-5 — Holidays CRUD

async function listHolidays(req, res, next) {
  try {
    const { year } = req.query
    const holidays = await reportSvc.listHolidays({ year: year ? parseInt(year, 10) : undefined })
    res.json(holidays)
  } catch (err) { next(err) }
}

async function createHoliday(req, res, next) {
  try {
    const { holidayDate, name, otMultiplier } = req.body
    if (!holidayDate || !name) {
      return res.status(400).json({ error: { message: 'holidayDate và name là bắt buộc' } })
    }
    const holiday = await reportSvc.createHoliday({ holidayDate, name, otMultiplier })
    res.status(201).json(holiday)
  } catch (err) { next(err) }
}

async function deleteHoliday(req, res, next) {
  try {
    await reportSvc.deleteHoliday(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── Attendance Settings ───────────────────────────────────────────────────────

async function getSettings(req, res, next) {
  try {
    const result = await settingsSvc.getAttendanceSettings()
    res.json(result)
  } catch (err) { next(err) }
}

async function updateSettings(req, res, next) {
  try {
    const { saturdayShiftId } = req.body
    const result = await settingsSvc.updateAttendanceSettings({
      saturdayShiftId: saturdayShiftId ?? null,
      updatedBy: req.user.id,
    })
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  checkIn, checkOut, getToday, listRecords, getSummary,
  adjustRecord, listAdjustments,
  getReport, syncPayroll,
  listHolidays, createHoliday, deleteHoliday,
  getSettings, updateSettings,
}
