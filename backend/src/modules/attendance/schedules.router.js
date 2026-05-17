const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const svc = require('./schedules.service')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /work-schedules:
 *   get:
 *     tags: [Work Schedules]
 *     summary: List work schedules (staff sees own, admin can filter by userId)
 *     parameters:
 *       - { in: query, name: userId, schema: { type: string, format: uuid }, description: "Admin only" }
 *       - { in: query, name: month,  schema: { type: integer, example: 5 } }
 *       - { in: query, name: year,   schema: { type: integer, example: 2026 } }
 *     responses:
 *       200:
 *         description: Work schedule list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/WorkSchedule' }
 * /work-schedules/bulk:
 *   post:
 *     tags: [Work Schedules]
 *     summary: Generate monthly work schedule for a user (admin). Skips existing rows.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, month, year]
 *             properties:
 *               userId: { type: string, format: uuid }
 *               month:  { type: integer, example: 5 }
 *               year:   { type: integer, example: 2026 }
 *     responses:
 *       201:
 *         description: Schedule generation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 generated: { type: integer, description: 'Rows inserted' }
 *                 skipped:   { type: integer, description: 'Rows already existed' }
 *                 total:     { type: integer }
 *                 records:   { type: array, items: { $ref: '#/components/schemas/WorkSchedule' } }
 */
router.get('/', ...auth, async (req, res, next) => {
  try {
    const { userId, month, year } = req.query
    const now = new Date()
    const isAdmin = req.user.role === 'admin'
    const effectiveUserId = isAdmin ? (userId || undefined) : req.user.id

    const schedules = await svc.listWorkSchedules({
      userId: effectiveUserId,
      month:  month ? parseInt(month, 10) : now.getMonth() + 1,
      year:   year  ? parseInt(year,  10) : now.getFullYear(),
    })
    res.json(schedules)
  } catch (err) { next(err) }
})

router.post('/bulk', ...admin, async (req, res, next) => {
  try {
    const { userId, month, year } = req.body
    if (!userId || !month || !year) {
      return res.status(400).json({ error: { message: 'userId, month và year là bắt buộc' } })
    }
    const result = await svc.generateMonthlySchedule({
      userId,
      month: parseInt(month, 10),
      year:  parseInt(year,  10),
      createdBy: req.user.id,
    })
    res.status(201).json(result)
  } catch (err) { next(err) }
})

module.exports = router
