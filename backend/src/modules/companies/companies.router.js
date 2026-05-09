const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { createCompanySchema, updateCompanySchema, assignStaffSchema } = require('./companies.schema')
const ctrl = require('./companies.controller')

const router = Router()
const auth = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /companies:
 *   get:
 *     tags: [Companies]
 *     summary: List companies with pagination and filters
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, terminated] }
 *       - in: query
 *         name: businessType
 *         schema: { type: string, enum: [TNHH, CP, HKD, DN_TU_NHAN, KHAC] }
 *       - in: query
 *         name: assignedStaffId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search on company name and tax code
 *     responses:
 *       200:
 *         description: Paginated company list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     companies:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Company' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', ...auth, ctrl.listCompanies)

/**
 * @openapi
 * /companies:
 *   post:
 *     tags: [Companies]
 *     summary: Create a new company (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:             { type: string, minLength: 2, maxLength: 200 }
 *               taxCode:          { type: string, maxLength: 20, nullable: true }
 *               address:          { type: string, nullable: true }
 *               businessType:     { type: string, enum: [TNHH, CP, HKD, DN_TU_NHAN, KHAC], default: TNHH }
 *               industry:         { type: string, nullable: true }
 *               legalRepName:     { type: string, nullable: true }
 *               legalRepPhone:    { type: string, nullable: true }
 *               contactName:      { type: string, nullable: true }
 *               contactPhone:     { type: string, nullable: true }
 *               contactEmail:     { type: string, format: email, nullable: true }
 *               bankAccount:      { type: string, nullable: true }
 *               bankName:         { type: string, nullable: true }
 *               serviceStartDate: { type: string, format: date, nullable: true }
 *               notes:            { type: string, nullable: true }
 *               assignedStaffId:  { type: string, format: uuid, nullable: true }
 *     responses:
 *       201:
 *         description: Company created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     company: { $ref: '#/components/schemas/Company' }
 *       409: { description: Tax code already exists }
 *       422: { description: Validation error }
 */
router.post('/', ...admin, validate(createCompanySchema), ctrl.createCompany)

/**
 * @openapi
 * /companies/{id}:
 *   get:
 *     tags: [Companies]
 *     summary: Get company details with task counts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Company detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     company: { $ref: '#/components/schemas/Company' }
 *       404: { description: Not found }
 */
router.get('/:id', ...auth, ctrl.getCompany)

/**
 * @openapi
 * /companies/{id}:
 *   patch:
 *     tags: [Companies]
 *     summary: Update company info (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Company' }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
router.patch('/:id', ...admin, validate(updateCompanySchema), ctrl.updateCompany)

/**
 * @openapi
 * /companies/{id}/terminate:
 *   post:
 *     tags: [Companies]
 *     summary: Terminate company — set status to terminated (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Company terminated }
 *       404: { description: Not found }
 */
router.post('/:id/terminate', ...admin, ctrl.terminateCompany)

/**
 * @openapi
 * /companies/{id}:
 *   delete:
 *     tags: [Companies]
 *     summary: Hard-delete company (admin only). Blocked if company has tasks or assignment history.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Company deleted }
 *       404: { description: Not found }
 *       409: { description: Company has activities — use terminate instead }
 */
router.delete('/:id', ...admin, ctrl.deleteCompany)

/**
 * @openapi
 * /companies/{id}/assignments:
 *   get:
 *     tags: [Companies]
 *     summary: Get staff assignment history for a company
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Assignment history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     assignments:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Assignment' }
 */
router.get('/:id/assignments', ...auth, ctrl.getAssignments)

/**
 * @openapi
 * /companies/{id}/assign:
 *   post:
 *     tags: [Companies]
 *     summary: Assign staff to company — closes previous open assignment (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staffId]
 *             properties:
 *               staffId:   { type: string, format: uuid }
 *               startDate: { type: string, format: date, description: Defaults to today }
 *               notes:     { type: string, nullable: true }
 *     responses:
 *       201: { description: Assignment created }
 *       422: { description: Staff must be active with role=staff }
 */
router.post('/:id/assign', ...admin, validate(assignStaffSchema), ctrl.assignStaff)

module.exports = router
