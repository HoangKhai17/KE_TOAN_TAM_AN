const svc        = require('./attendance.service')
const adjSvc     = require('./adjustments.service')
const reportSvc  = require('./report.service')
const settingsSvc = require('./settings.service')

// Extract real client IP, handling Docker/Nginx proxy headers correctly.
// X-Forwarded-For can be a comma-separated list; the first entry is the origin client.
function resolveClientIp(req) {
  const xfwd = req.headers['x-forwarded-for']
  if (xfwd) return xfwd.split(',')[0].trim()
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || null
}

// Build device_info string to store in attendance_logs.device_info (VARCHAR 200).
// Prefer structured JSON sent from frontend; fall back to raw User-Agent header.
function resolveDeviceInfo(bodyDeviceInfo, ua) {
  if (bodyDeviceInfo && typeof bodyDeviceInfo === 'object') {
    const compact = {
      type:    bodyDeviceInfo.type    ?? 'unknown',
      os:      bodyDeviceInfo.os      ?? 'Unknown',
      browser: bodyDeviceInfo.browser ?? 'Unknown',
      isPWA:   bodyDeviceInfo.isPWA   ?? false,
    }
    return JSON.stringify(compact).slice(0, 200)
  }
  return ua?.slice(0, 200) ?? null
}

async function checkIn(req, res, next) {
  try {
    const { method, notes, deviceInfo: bodyDeviceInfo } = req.body
    const ip         = resolveClientIp(req)
    const deviceInfo = resolveDeviceInfo(bodyDeviceInfo, req.headers['user-agent'])
    const result = await svc.checkIn({ userId: req.user.id, method, notes, ip, deviceInfo })
    res.status(201).json(result)
  } catch (err) { next(err) }
}

async function checkOut(req, res, next) {
  try {
    const { method, notes, deviceInfo: bodyDeviceInfo } = req.body
    const ip         = resolveClientIp(req)
    const deviceInfo = resolveDeviceInfo(bodyDeviceInfo, req.headers['user-agent'])
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
    const { userId, month, year, from, to, status, page, limit } = req.query
    const now     = new Date()
    const isAdmin = req.user.role === 'admin'
    const effectiveUserId = isAdmin ? (userId || undefined) : req.user.id

    const result = await svc.listAttendanceRecords({
      userId: effectiveUserId,
      month:  month ? parseInt(month, 10) : now.getMonth() + 1,
      year:   year  ? parseInt(year,  10) : now.getFullYear(),
      from,
      to,
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

async function manualAdjustRecord(req, res, next) {
  try {
    const { checkInTime, checkOutTime, reason } = req.body
    if (!reason?.trim()) {
      return res.status(400).json({ error: { message: 'reason là bắt buộc' } })
    }
    const result = await adjSvc.manualAdjust(req.params.id, {
      checkInTime, checkOutTime, reason, adjustedBy: req.user.id,
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function createManualAttendanceRecord(req, res, next) {
  try {
    const { userId, workDate, checkInTime, checkOutTime, reason } = req.body
    if (!userId || !workDate || !reason?.trim()) {
      return res.status(400).json({ error: { message: 'userId, workDate và reason là bắt buộc' } })
    }
    const result = await adjSvc.createManualRecord(userId, workDate, {
      checkInTime, checkOutTime, reason, adjustedBy: req.user.id,
    })
    res.status(201).json(result)
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

async function exportReport(req, res, next) {
  try {
    const { month, year } = req.query
    const now = new Date()
    await reportSvc.exportMonthlyReportExcel(
      month ? parseInt(month, 10) : now.getMonth() + 1,
      year  ? parseInt(year,  10) : now.getFullYear(),
      res
    )
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

async function updateHoliday(req, res, next) {
  try {
    const { name, otMultiplier } = req.body
    const holiday = await reportSvc.updateHoliday(req.params.id, { name, otMultiplier })
    res.json(holiday)
  } catch (err) { next(err) }
}

async function deleteHoliday(req, res, next) {
  try {
    await reportSvc.deleteHoliday(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

// Device summary — first check-in device info per user per day for a month (admin)
async function getDeviceSummary(req, res, next) {
  try {
    const { userId, month, year } = req.query
    const now = new Date()
    const summary = await svc.getDeviceSummary({
      userId: userId || null,
      month:  month ? parseInt(month, 10) : now.getMonth() + 1,
      year:   year  ? parseInt(year,  10) : now.getFullYear(),
    })
    res.json({ summary })
  } catch (err) { next(err) }
}

// Attendance Logs — raw check-in/out entries for a user+date (admin audit view)

async function getLogs(req, res, next) {
  try {
    const { userId, date } = req.query
    if (!userId || !date) {
      return res.status(400).json({ error: { message: 'userId và date là bắt buộc' } })
    }
    const logs = await svc.getAttendanceLogs(userId, date)
    res.json({ logs })
  } catch (err) { next(err) }
}

// Custom export — field-selectable xlsx (summary or per-day detail)
async function exportCustom(req, res, next) {
  try {
    const { month, year, type = 'summary', fields = '' } = req.query
    const now        = new Date()
    const m          = month ? parseInt(month, 10) : now.getMonth() + 1
    const y          = year  ? parseInt(year,  10) : now.getFullYear()
    const fieldList  = fields ? fields.split(',').filter(Boolean) : []

    if (type === 'detail') {
      await reportSvc.exportDetailRecords({ month: m, year: y, fields: fieldList, res })
    } else {
      await reportSvc.exportCustomSummary({ month: m, year: y, fields: fieldList, res })
    }
  } catch (err) { next(err) }
}

// ── Attendance Settings ───────────────────────────────────────────────────────

async function getSettings(req, res, next) {
  try {
    const result = await settingsSvc.getAttendanceSettings()
    res.json(result)
  } catch (err) { next(err) }
}

async function sendConfirmation(req, res, next) {
  try {
    const now = new Date()
    const { month = now.getMonth() + 1, year = now.getFullYear() } = req.body
    const result = await svc.sendAttendanceConfirmation({
      month: parseInt(month, 10),
      year:  parseInt(year,  10),
    })
    res.json(result)
  } catch (err) { next(err) }
}

async function updateSettings(req, res, next) {
  try {
    const { defaultShiftId, saturdayShiftId } = req.body
    const result = await settingsSvc.updateAttendanceSettings({
      defaultShiftId:  defaultShiftId  ?? undefined,
      saturdayShiftId: saturdayShiftId ?? undefined,
      updatedBy: req.user.id,
    })
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  checkIn, checkOut, getToday, listRecords, getSummary,
  adjustRecord, manualAdjustRecord, createManualAttendanceRecord, listAdjustments,
  getReport, exportReport, exportCustom, syncPayroll,
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
  getSettings, updateSettings,
  sendConfirmation,
  getLogs,
  getDeviceSummary,
}
