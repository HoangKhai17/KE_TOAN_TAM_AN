const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const svc = require('./overtime.service')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /overtime-requests:
 *   get:
 *     tags: [Overtime]
 *     summary: List OT requests (staff sees own, admin sees all)
 *     parameters:
 *       - { in: query, name: userId, schema: { type: string, format: uuid }, description: "Admin only" }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, approved, rejected, cancelled] } }
 *       - { in: query, name: from,   schema: { type: string, format: date } }
 *       - { in: query, name: to,     schema: { type: string, format: date } }
 *       - { in: query, name: page,   schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,  schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: OT request list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:   { type: array, items: { $ref: '#/components/schemas/OvertimeRequest' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *   post:
 *     tags: [Overtime]
 *     summary: Create an OT request. ot_hours and ot_rate are calculated automatically.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otDate, startTime, endTime]
 *             properties:
 *               otDate:    { type: string, format: date, example: '2026-06-07' }
 *               startTime: { type: string, example: '18:00' }
 *               endTime:   { type: string, example: '21:00' }
 *               reason:    { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: OT request created. ot_rate — weekday 1.5, weekend 2.0, holiday 3.0
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/OvertimeRequest' }
 *       400: { description: Missing required fields }
 */
router.get('/',  ...auth, async (req, res, next) => {
  try {
    const { userId, status, from, to, page, limit } = req.query
    const isAdmin = req.user.role === 'admin'
    const statusArr   = status ? status.split(',').filter(Boolean) : undefined
    const effectiveUserIds = isAdmin
      ? (userId ? userId.split(',').filter(Boolean) : undefined)
      : [req.user.id]
    const result = await svc.listOvertimeRequests({
      userId: effectiveUserIds, status: statusArr, from, to,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    })
    res.json(result)
  } catch (err) { next(err) }
})

router.post('/', ...auth, async (req, res, next) => {
  try {
    const { otDate, startTime, endTime, reason, clientCompanyId } = req.body
    if (!otDate || !startTime || !endTime) {
      return res.status(400).json({ error: { message: 'otDate, startTime và endTime là bắt buộc' } })
    }
    const request = await svc.createOvertimeRequest({
      userId: req.user.id, otDate, startTime, endTime, reason, clientCompanyId: clientCompanyId || null,
    })
    res.status(201).json(request)
  } catch (err) { next(err) }
})

/**
 * @openapi
 * /overtime-requests/{id}/approve:
 *   put:
 *     tags: [Overtime]
 *     summary: Approve OT request (admin). Updates attendance_records.ot_hours.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Approved }
 *       404: { description: Not found or already reviewed }
 * /overtime-requests/{id}/reject:
 *   put:
 *     tags: [Overtime]
 *     summary: Reject OT request (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rejectionNote: { type: string }
 *     responses:
 *       200: { description: Rejected }
 *       404: { description: Not found or already reviewed }
 */
router.get('/export-custom', ...admin, async (req, res, next) => {
  try {
    const { from, to, status, userId, fields = '' } = req.query
    const fieldList  = fields ? fields.split(',').filter(Boolean) : []
    const statusArr  = status ? status.split(',').filter(Boolean) : undefined
    const userIdArr  = userId ? userId.split(',').filter(Boolean) : undefined
    await svc.exportOvertimeRecords({ from, to, status: statusArr, userId: userIdArr, fields: fieldList, res })
  } catch (err) { next(err) }
})

router.put('/:id/approve', ...admin, async (req, res, next) => {
  try {
    const { approvalNote } = req.body ?? {}
    const request = await svc.approveOvertimeRequest(req.params.id, req.user.id, approvalNote)
    res.json(request)
  } catch (err) { next(err) }
})

router.put('/:id/reject', ...admin, async (req, res, next) => {
  try {
    const { rejectionNote } = req.body
    const request = await svc.rejectOvertimeRequest(req.params.id, { rejectionNote, reviewedBy: req.user.id })
    res.json(request)
  } catch (err) { next(err) }
})

module.exports = router
