const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./attendance.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /attendance/check-in:
 *   post:
 *     tags: [Attendance]
 *     summary: Check in for today
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method: { type: string, enum: [web, mobile, manual], default: web }
 *               notes:  { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Checked in, attendance record created/updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AttendanceRecord' }
 *       409: { description: Already checked in today }
 * /attendance/check-out:
 *   post:
 *     tags: [Attendance]
 *     summary: Check out for today
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method: { type: string, enum: [web, mobile, manual], default: web }
 *               notes:  { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Checked out, attendance record updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AttendanceRecord' }
 *       400: { description: No check-in found for today }
 */
router.post('/check-in',  ...auth,  ctrl.checkIn)
router.post('/check-out', ...auth,  ctrl.checkOut)

/**
 * @openapi
 * /attendance/today:
 *   get:
 *     tags: [Attendance]
 *     summary: Get today's attendance status for the calling user
 *     responses:
 *       200:
 *         description: Today status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasCheckedIn:   { type: boolean }
 *                 checkInTime:    { type: string, format: date-time, nullable: true }
 *                 hasCheckedOut:  { type: boolean }
 *                 checkOutTime:   { type: string, format: date-time, nullable: true }
 *                 checkInCount:   { type: integer }
 *                 checkOutCount:  { type: integer }
 *                 record:         { $ref: '#/components/schemas/AttendanceRecord', nullable: true }
 */
router.get('/today', ...auth, ctrl.getToday)

/**
 * @openapi
 * /attendance/records:
 *   get:
 *     tags: [Attendance]
 *     summary: List attendance records (staff sees own, admin can filter by userId)
 *     parameters:
 *       - { in: query, name: userId, schema: { type: string, format: uuid }, description: "Admin only" }
 *       - { in: query, name: month,  schema: { type: integer, example: 5 } }
 *       - { in: query, name: year,   schema: { type: integer, example: 2026 } }
 *       - { in: query, name: status, schema: { type: string, enum: [present, late, early_leave, late_and_early, absent, on_leave, business_trip, wfh, holiday, unscheduled] } }
 *       - { in: query, name: page,   schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,  schema: { type: integer, default: 31 } }
 *     responses:
 *       200:
 *         description: Attendance record list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 records:    { type: array, items: { $ref: '#/components/schemas/AttendanceRecord' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/records', ...auth, ctrl.listRecords)

/**
 * @openapi
 * /attendance/records/summary:
 *   get:
 *     tags: [Attendance]
 *     summary: Get aggregated attendance summary for a user/month (admin only)
 *     parameters:
 *       - { in: query, name: userId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: month,  schema: { type: integer, example: 5 } }
 *       - { in: query, name: year,   schema: { type: integer, example: 2026 } }
 *     responses:
 *       200:
 *         description: Attendance summary
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AttendanceSummary' }
 */
router.get('/records/summary', ...admin, ctrl.getSummary)

/**
 * @openapi
 * /attendance/records/{id}/adjust:
 *   put:
 *     tags: [Attendance]
 *     summary: Manually adjust an attendance record field (admin). Writes audit trail.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field, newValue, reason]
 *             properties:
 *               field:    { type: string, enum: [check_in_time, check_out_time, status, notes] }
 *               newValue: { type: string, example: '2026-05-17T08:05:00' }
 *               reason:   { type: string, example: 'Hệ thống chấm công bị lỗi sáng nay' }
 *     responses:
 *       200:
 *         description: Record updated, recalculated if time field
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AttendanceRecord' }
 *       400: { description: Field not supported }
 *       404: { description: Record not found }
 * /attendance/records/{id}/adjustments:
 *   get:
 *     tags: [Attendance]
 *     summary: List adjustment audit trail for a record (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Audit trail list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/AttendanceAdjustment' }
 */
router.put('/records/:id/adjust',         ...admin, ctrl.adjustRecord)
router.post('/records/:id/manual-adjust', ...admin, ctrl.manualAdjustRecord)
router.get('/records/:id/adjustments',    ...admin, ctrl.listAdjustments)
router.post('/manual-record',             ...admin, ctrl.createManualAttendanceRecord)

/**
 * @openapi
 * /attendance/report:
 *   get:
 *     tags: [Attendance]
 *     summary: Monthly attendance report — all employees (admin)
 *     parameters:
 *       - { in: query, name: month, schema: { type: integer, example: 5 } }
 *       - { in: query, name: year,  schema: { type: integer, example: 2026 } }
 *     responses:
 *       200:
 *         description: Per-employee monthly summary
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/MonthlyReportItem' }
 * /attendance/sync-payroll:
 *   post:
 *     tags: [Attendance]
 *     summary: Push attendance summary into payroll records for a period (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payrollPeriodId]
 *             properties:
 *               payrollPeriodId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sync result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 periodId:     { type: string, format: uuid }
 *                 periodYear:   { type: integer }
 *                 periodMonth:  { type: integer }
 *                 updatedCount: { type: integer }
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userName: { type: string }
 *                       workDate: { type: string, format: date }
 *                       status:   { type: string }
 *       409: { description: Payroll period already paid — cannot update }
 */
router.get('/report',              ...admin, ctrl.getReport)
router.get('/report/export',       ...admin, ctrl.exportReport)
router.post('/sync-payroll',        ...admin, ctrl.syncPayroll)
router.post('/send-confirmation',   ...admin, ctrl.sendConfirmation)

/**
 * @openapi
 * /attendance/holidays:
 *   get:
 *     tags: [Attendance]
 *     summary: List public holidays
 *     parameters:
 *       - { in: query, name: year, schema: { type: integer, example: 2026 } }
 *     responses:
 *       200:
 *         description: Holiday list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/PublicHoliday' }
 *   post:
 *     tags: [Attendance]
 *     summary: Create or update a public holiday (admin). Upserts by date.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [holidayDate, name]
 *             properties:
 *               holidayDate:  { type: string, format: date, example: '2026-09-02' }
 *               name:         { type: string, example: 'Quốc khánh' }
 *               otMultiplier: { type: number, example: 3.0 }
 *     responses:
 *       201:
 *         description: Holiday created or updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PublicHoliday' }
 * /attendance/holidays/{id}:
 *   delete:
 *     tags: [Attendance]
 *     summary: Delete a public holiday (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Deleted }
 *       404: { description: Not found }
 */
router.get('/holidays',        ...auth,  ctrl.listHolidays)
router.post('/holidays',       ...admin, ctrl.createHoliday)
router.put('/holidays/:id',    ...admin, ctrl.updateHoliday)
router.delete('/holidays/:id', ...admin, ctrl.deleteHoliday)

/**
 * @openapi
 * /attendance/settings:
 *   get:
 *     tags: [Attendance]
 *     summary: Get attendance system settings (admin)
 *     responses:
 *       200:
 *         description: Current settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 saturdayShiftId: { type: string, format: uuid, nullable: true }
 *                 saturdayMode:    { type: string, enum: [dayoff, workday] }
 *   patch:
 *     tags: [Attendance]
 *     summary: Update attendance system settings (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               saturdayShiftId: { type: string, format: uuid, nullable: true }
 *     responses:
 *       200:
 *         description: Updated settings
 */
router.get('/settings',   ...admin, ctrl.getSettings)
router.patch('/settings', ...admin, ctrl.updateSettings)

module.exports = router
