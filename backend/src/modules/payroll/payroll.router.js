const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { createPeriodSchema, updatePeriodSchema, upsertRecordSchema } = require('./payroll.schema')
const ctrl = require('./payroll.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /payroll:
 *   get:
 *     tags: [Payroll]
 *     summary: List payroll periods (newest first)
 *     parameters:
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 24, maximum: 60 } }
 *     responses:
 *       200:
 *         description: Payroll period list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     periods:    { type: array, items: { $ref: '#/components/schemas/PayrollPeriod' } }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *   post:
 *     tags: [Payroll]
 *     summary: Create a new payroll period (admin, draft status)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [periodYear, periodMonth, startDate, endDate]
 *             properties:
 *               periodYear:  { type: integer, example: 2026 }
 *               periodMonth: { type: integer, minimum: 1, maximum: 12, example: 5 }
 *               startDate:   { type: string, format: date, example: '2026-05-01' }
 *               endDate:     { type: string, format: date, example: '2026-05-31' }
 *               notes:       { type: string, nullable: true }
 *     responses:
 *       201: { description: Period created }
 *       409: { description: Period for this month/year already exists }
 */
router.get('/',       ...auth,  ctrl.listPeriods)
router.get('/years',  ...auth,  ctrl.listDistinctYears)
router.post('/',      ...admin, validate(createPeriodSchema), ctrl.createPeriod)

/**
 * @openapi
 * /payroll/{id}:
 *   get:
 *     tags: [Payroll]
 *     summary: Get payroll period detail
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Period detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { $ref: '#/components/schemas/PayrollPeriod' }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Payroll]
 *     summary: Update period dates/notes (admin, draft only)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated }
 *       409: { description: Period not in draft status }
 */
router.get('/:id',   ...auth,  ctrl.getPeriod)
router.patch('/:id', ...admin, validate(updatePeriodSchema), ctrl.updatePeriod)

/**
 * @openapi
 * /payroll/{id}/confirm:
 *   post:
 *     tags: [Payroll]
 *     summary: Confirm payroll period — draft → confirmed (admin only)
 *     description: Locks all records. No further edits allowed after confirmation.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Period confirmed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { $ref: '#/components/schemas/PayrollPeriod' }
 *       409: { description: Period is not in draft status }
 */
router.post('/:id/confirm', ...admin, ctrl.confirmPeriod)

/**
 * @openapi
 * /payroll/{id}/mark-paid:
 *   post:
 *     tags: [Payroll]
 *     summary: Mark payroll period as paid — confirmed → paid (admin only)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Period marked as paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     period: { $ref: '#/components/schemas/PayrollPeriod' }
 *       409: { description: Period is not in confirmed status }
 */
router.post('/:id/mark-paid', ...admin, ctrl.markPaid)

/**
 * @openapi
 * /payroll/{id}/export:
 *   get:
 *     tags: [Payroll]
 *     summary: Export payroll period as Excel file (admin only)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       404: { description: Period not found }
 */
router.get('/:id/export',        ...admin, ctrl.exportExcel)
router.get('/:id/export-custom', ...admin, ctrl.exportExcelCustom)
router.post('/:id/send-emails',  ...admin, ctrl.sendPayrollEmails)

/**
 * @openapi
 * /payroll/{id}/records:
 *   get:
 *     tags: [Payroll]
 *     summary: List salary records for a period
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Salary records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     records:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/PayrollRecord' }
 *       404: { description: Period not found }
 *   put:
 *     tags: [Payroll]
 *     summary: Create or update a salary record for one employee (admin, draft only)
 *     description: Uses ON CONFLICT upsert — safe to call multiple times.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:          { type: string, format: uuid }
 *               baseSalary:      { type: integer, default: 0 }
 *               allowances:      { type: integer, default: 0 }
 *               bonus:           { type: integer, default: 0 }
 *               bhxhEmployee:    { type: integer, default: 0 }
 *               bhytEmployee:    { type: integer, default: 0 }
 *               bhtnEmployee:    { type: integer, default: 0 }
 *               bhxhEmployer:    { type: integer, default: 0 }
 *               bhytEmployer:    { type: integer, default: 0 }
 *               bhtnEmployer:    { type: integer, default: 0 }
 *               pitDeduction:    { type: integer, default: 0 }
 *               otherDeductions: { type: integer, default: 0 }
 *               components:      { type: object, nullable: true }
 *               notes:           { type: string, nullable: true }
 *     responses:
 *       200:
 *         description: Record upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     record: { $ref: '#/components/schemas/PayrollRecord' }
 *       409: { description: Period is not in draft status }
 */
router.get('/:id/records', ...auth,  ctrl.listRecords)
router.put('/:id/records', ...admin, validate(upsertRecordSchema), ctrl.upsertRecord)

/**
 * @openapi
 * /payroll/{id}/records/{recordId}:
 *   delete:
 *     tags: [Payroll]
 *     summary: Delete a salary record (admin, draft only)
 *     parameters:
 *       - { in: path, name: id,       required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: recordId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: Period is not in draft status }
 */
router.delete('/:id/records/:recordId', ...admin, ctrl.deleteRecord)

module.exports = router
