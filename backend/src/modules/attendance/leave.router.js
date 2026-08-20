const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const svc = require('./leave.service')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /leave-requests:
 *   get:
 *     tags: [Leave]
 *     summary: List leave requests (staff sees own, admin sees all)
 *     parameters:
 *       - { in: query, name: userId,    schema: { type: string, format: uuid }, description: "Admin only — filter by user" }
 *       - { in: query, name: status,    schema: { type: string, enum: [pending, approved, rejected, cancelled] } }
 *       - { in: query, name: leaveType, schema: { type: string, enum: [annual, sick, compensatory, unpaid, business_trip, wfh] } }
 *       - { in: query, name: from,      schema: { type: string, format: date } }
 *       - { in: query, name: to,        schema: { type: string, format: date } }
 *       - { in: query, name: page,      schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit,     schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Leave request list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requests:   { type: array, items: { $ref: '#/components/schemas/LeaveRequest' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *   post:
 *     tags: [Leave]
 *     summary: Create a leave request (any authenticated user for themselves)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [leaveType, startDate, endDate]
 *             properties:
 *               leaveType: { type: string, enum: [annual, sick, compensatory, unpaid, business_trip, wfh] }
 *               startDate: { type: string, format: date, example: '2026-06-02' }
 *               endDate:   { type: string, format: date, example: '2026-06-04' }
 *               reason:    { type: string, nullable: true }
 *     responses:
 *       201: { description: Leave request created, total_days excludes weekends & holidays }
 *       400: { description: Missing required fields }
 */
router.get('/',  ...auth, async (req, res, next) => {
  try {
    const { userId, status, leaveType, from, to, page, limit } = req.query
    const isAdmin = req.user.role === 'admin'
    const statusArr        = status ? status.split(',').filter(Boolean) : undefined
    const effectiveUserIds = isAdmin
      ? (userId ? userId.split(',').filter(Boolean) : undefined)
      : [req.user.id]
    const result = await svc.listLeaveRequests({
      userId: effectiveUserIds, status: statusArr, leaveType, from, to,
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    })
    res.json(result)
  } catch (err) { next(err) }
})

router.post('/', ...auth, async (req, res, next) => {
  try {
    const { leaveType, startDate, endDate, reason, dayPart, hours } = req.body
    if (!leaveType || !startDate || !endDate) {
      return res.status(400).json({ error: { message: 'leaveType, startDate và endDate là bắt buộc' } })
    }
    const request = await svc.createLeaveRequest({
      userId: req.user.id, leaveType, startDate, endDate, reason,
      dayPart: dayPart ?? 'full', hours: hours ?? null,
    })
    res.status(201).json(request)
  } catch (err) { next(err) }
})

// Chính sách từng loại nghỉ — nguồn cho dropdown ở giao diện (thay hardcode).
router.get('/policies', ...auth, async (req, res, next) => {
  try { res.json(await svc.listLeavePolicies()) } catch (err) { next(err) }
})

// Quỹ phép năm. Nhân viên chỉ xem của mình; admin xem tất cả hoặc lọc theo người.
router.get('/balance', ...auth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const userId  = isAdmin ? (req.query.userId || undefined) : req.user.id
    res.json(await svc.getLeaveBalance({ userId, year: req.query.year }))
  } catch (err) { next(err) }
})

/**
 * @openapi
 * /leave-requests/{id}/approve:
 *   put:
 *     tags: [Leave]
 *     summary: Approve a leave request (admin). Auto-updates attendance_records for covered dates.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Approved, attendance_records updated }
 *       404: { description: Not found or already reviewed }
 * /leave-requests/{id}/reject:
 *   put:
 *     tags: [Leave]
 *     summary: Reject a leave request (admin)
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
 * /leave-requests/{id}/revoke:
 *   put:
 *     tags: [Leave]
 *     summary: Revoke an already-approved leave request (admin). Recalculates attendance for covered dates.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason: { type: string, description: "Lý do thu hồi — bắt buộc, lưu vào rejection_note với tiền tố [Thu hồi]" }
 *     responses:
 *       200: { description: Revoked, attendance_records recalculated }
 *       404: { description: Not found or not in approved state }
 *       422: { description: Missing reason }
 * /leave-requests/{id}/cancel:
 *   delete:
 *     tags: [Leave]
 *     summary: Cancel own pending leave request
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Cancelled }
 *       404: { description: Not found or not cancellable }
 */
router.get('/export-custom', ...admin, async (req, res, next) => {
  try {
    const { from, to, status, userId, fields = '' } = req.query
    const fieldList  = fields ? fields.split(',').filter(Boolean) : []
    const statusArr  = status ? status.split(',').filter(Boolean) : undefined
    const userIdArr  = userId ? userId.split(',').filter(Boolean) : undefined
    await svc.exportLeaveRecords({ from, to, status: statusArr, userId: userIdArr, fields: fieldList, res })
  } catch (err) { next(err) }
})

router.put('/:id/approve', ...admin, async (req, res, next) => {
  try {
    const { approvalNote, force } = req.body ?? {}
    const request = await svc.approveLeaveRequest(req.params.id, req.user.id, approvalNote, { force: force === true })
    res.json(request)
  } catch (err) { next(err) }
})

router.put('/:id/reject', ...admin, async (req, res, next) => {
  try {
    const { rejectionNote } = req.body
    const request = await svc.rejectLeaveRequest(req.params.id, { rejectionNote, reviewedBy: req.user.id })
    res.json(request)
  } catch (err) { next(err) }
})

router.put('/:id/revoke', ...admin, async (req, res, next) => {
  try {
    const { reason } = req.body ?? {}
    const request = await svc.revokeLeaveRequest(req.params.id, { reason, actorId: req.user.id })
    res.json(request)
  } catch (err) { next(err) }
})

router.delete('/:id/cancel', ...auth, async (req, res, next) => {
  try {
    const request = await svc.cancelLeaveRequest(req.params.id, req.user.id)
    res.json(request)
  } catch (err) { next(err) }
})

// Xóa hẳn đơn nghỉ (chỉ khi CHƯA duyệt) — chủ đơn hoặc admin
router.delete('/:id', ...auth, async (req, res, next) => {
  try {
    await svc.deleteLeaveRequest(req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
})

module.exports = router
