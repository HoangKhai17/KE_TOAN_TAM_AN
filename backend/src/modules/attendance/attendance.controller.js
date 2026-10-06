const svc        = require('./attendance.service')
const adjSvc     = require('./adjustments.service')
const reportSvc  = require('./report.service')
const settingsSvc = require('./settings.service')
const photoSvc   = require('./photo.service')
const deviceSvc  = require('./device.service')
const storage    = require('../../lib/storage')

// deviceInfo đến từ body: JSON object (khi gửi JSON) hoặc chuỗi JSON (khi gửi multipart form).
function parseDeviceInfo(raw) {
  if (!raw) return undefined
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return undefined }
}

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

// Dọn ảnh selfie đã upload nếu lần chấm công bị từ chối (vd thiết bị chưa duyệt) → tránh file rác.
function cleanupUploadedPhoto(req) {
  if (req.file) { try { storage.removeFile(storage.toRelative(req.file.path)) } catch { /* bỏ qua */ } }
}

async function checkIn(req, res, next) {
  try {
    const { method, notes, deviceId, deviceLabel } = req.body
    const ip         = resolveClientIp(req)
    const deviceInfo = resolveDeviceInfo(parseDeviceInfo(req.body.deviceInfo), req.headers['user-agent'])
    const photoPath  = req.file ? storage.toRelative(req.file.path) : null
    const result = await svc.checkIn({ userId: req.user.id, method, notes, ip, deviceInfo, photoPath, deviceId, deviceLabel })
    res.status(201).json(result)
  } catch (err) { cleanupUploadedPhoto(req); next(err) }
}

async function checkOut(req, res, next) {
  try {
    const { method, notes, deviceId, deviceLabel } = req.body
    const ip         = resolveClientIp(req)
    const deviceInfo = resolveDeviceInfo(parseDeviceInfo(req.body.deviceInfo), req.headers['user-agent'])
    const photoPath  = req.file ? storage.toRelative(req.file.path) : null
    const result = await svc.checkOut({ userId: req.user.id, method, notes, ip, deviceInfo, photoPath, deviceId, deviceLabel })
    res.json(result)
  } catch (err) { cleanupUploadedPhoto(req); next(err) }
}

// ── Thiết bị tin cậy (admin) ──────────────────────────────────────────────────
async function listDevices(req, res, next) {
  try {
    const { status, userId } = req.query
    const [devices, pending, lockEnabled] = await Promise.all([
      deviceSvc.listDevices({ status, userId }),
      deviceSvc.countPending(),
      deviceSvc.isLockEnabled(),
    ])
    res.json({ success: true, data: { devices, pendingCount: pending, lockEnabled } })
  } catch (err) { next(err) }
}

// Tính lại công cho các (user, ngày) có log vừa được bỏ treo.
async function recomputeReleased(items) {
  for (const { userId, dates } of items) {
    for (const d of dates) {
      try { await svc.calculateAttendanceRecord(userId, d) } catch (e) { /* bỏ qua lỗi lẻ */ }
    }
  }
}

async function approveDevice(req, res, next) {
  try {
    const released = await deviceSvc.setStatus(req.params.id, 'approved', req.user.id)
    await recomputeReleased([released])
    res.json({ success: true, data: { released: released.dates.length } })
  } catch (err) { next(err) }
}
async function revokeDevice(req, res, next) {
  try { await deviceSvc.setStatus(req.params.id, 'revoked', req.user.id); res.json({ success: true }) }
  catch (err) { next(err) }
}
async function approveAllDevices(req, res, next) {
  try {
    const { approved, affected } = await deviceSvc.approveAllPending(req.user.id)
    await recomputeReleased(affected)
    res.json({ success: true, data: { approved } })
  } catch (err) { next(err) }
}
async function renameDevice(req, res, next) {
  try { await deviceSvc.renameDevice(req.params.id, req.body?.label); res.json({ success: true }) }
  catch (err) { next(err) }
}
async function deleteDevice(req, res, next) {
  try { await deviceSvc.deleteDevice(req.params.id); res.status(204).end() }
  catch (err) { next(err) }
}
async function setDeviceLock(req, res, next) {
  try {
    const on = req.body?.enabled === true || req.body?.enabled === 'true' || req.body?.enabled === 1
    const enabled = await deviceSvc.setLockEnabled(on, req.user.id)
    res.json({ success: true, data: { lockEnabled: enabled } })
  } catch (err) { next(err) }
}

async function getLogPhoto(req, res, next) {
  try {
    const absPath = await svc.getLogPhoto(req.params.id, req.user)
    res.sendFile(absPath)
  } catch (err) { next(err) }
}

// ── Quản lý ảnh chấm công (admin) ─────────────────────────────────────────────
async function getPhotoStats(req, res, next) {
  try {
    const stats = await photoSvc.getPhotoStats()
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

async function listPhotos(req, res, next) {
  try {
    const { month, userId, logType, page, limit } = req.query
    const data = await photoSvc.listPhotos({ month, userId, logType, page, limit })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function cleanupPhotos(req, res, next) {
  try {
    const { beforeMonth, month } = req.body ?? {}
    const result = await photoSvc.cleanupBefore({ beforeMonth, month })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function setPhotoRetention(req, res, next) {
  try {
    const months = await photoSvc.setRetentionMonths(req.body?.months, req.user.id)
    res.json({ success: true, data: { retentionMonths: months } })
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

async function resetCheckout(req, res, next) {
  try {
    const { reason } = req.body
    if (!reason?.trim()) {
      return res.status(400).json({ error: { message: 'reason là bắt buộc' } })
    }
    const result = await adjSvc.resetCheckout(req.params.id, { reason, adjustedBy: req.user.id })
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
    const { defaultShiftId, saturdayShiftId, strictUnpaidFrom } = req.body
    const result = await settingsSvc.updateAttendanceSettings({
      defaultShiftId:  defaultShiftId  ?? undefined,
      saturdayShiftId: saturdayShiftId ?? undefined,
      // '' là giá trị HỢP LỆ (= áp dụng toàn bộ lịch sử) nên không dùng ?? undefined
      strictUnpaidFrom: strictUnpaidFrom === undefined ? undefined : (strictUnpaidFrom ?? ''),
      updatedBy: req.user.id,
    })
    res.json(result)
  } catch (err) { next(err) }
}

module.exports = {
  checkIn, checkOut, getToday, listRecords, getSummary,
  adjustRecord, manualAdjustRecord, createManualAttendanceRecord, resetCheckout, listAdjustments,
  getReport, exportReport, exportCustom, syncPayroll,
  listHolidays, createHoliday, updateHoliday, deleteHoliday,
  getSettings, updateSettings,
  sendConfirmation,
  getLogs,
  getLogPhoto,
  getPhotoStats, listPhotos, cleanupPhotos, setPhotoRetention,
  listDevices, approveDevice, approveAllDevices, revokeDevice, renameDevice, deleteDevice, setDeviceLock,
  getDeviceSummary,
}
