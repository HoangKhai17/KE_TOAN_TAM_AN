const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const svc = require('./shifts.service')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /shifts:
 *   get:
 *     tags: [Shifts]
 *     summary: List shifts
 *     parameters:
 *       - { in: query, name: activeOnly, schema: { type: boolean, default: true } }
 *     responses:
 *       200:
 *         description: Shift list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Shift' }
 *   post:
 *     tags: [Shifts]
 *     summary: Create a new shift (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:          { type: string, example: 'Ca Hành Chính' }
 *               shiftType:     { type: string, enum: [fixed, flexible], default: fixed }
 *               startTime:     { type: string, example: '08:00' }
 *               endTime:       { type: string, example: '17:00' }
 *               breakMinutes:  { type: integer, example: 60 }
 *               requiredHours: { type: number, example: 8 }
 *               toleranceIn:   { type: integer, example: 15, description: 'Late tolerance in minutes' }
 *               toleranceOut:  { type: integer, example: 15, description: 'Early-leave tolerance in minutes' }
 *     responses:
 *       201:
 *         description: Shift created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Shift' }
 * /shifts/{id}:
 *   put:
 *     tags: [Shifts]
 *     summary: Update a shift (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:          { type: string }
 *               shiftType:     { type: string, enum: [fixed, flexible] }
 *               startTime:     { type: string }
 *               endTime:       { type: string }
 *               breakMinutes:  { type: integer }
 *               requiredHours: { type: number }
 *               toleranceIn:   { type: integer }
 *               toleranceOut:  { type: integer }
 *               isActive:      { type: boolean }
 *     responses:
 *       200:
 *         description: Shift updated
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Shift' }
 *       404: { description: Shift not found }
 */
router.get('/', ...auth, async (req, res, next) => {
  try {
    const activeOnly = req.query.activeOnly !== 'false'
    const shifts = await svc.listShifts({ activeOnly })
    res.json(shifts)
  } catch (err) { next(err) }
})

router.post('/', ...admin, async (req, res, next) => {
  try {
    const { name, shiftType, startTime, endTime, breakMinutes, requiredHours, toleranceIn, toleranceOut } = req.body
    if (!name) return res.status(400).json({ error: { message: 'name là bắt buộc' } })
    const shift = await svc.createShift({
      name, shiftType, startTime, endTime, breakMinutes, requiredHours, toleranceIn, toleranceOut,
      createdBy: req.user.id,
    })
    res.status(201).json(shift)
  } catch (err) { next(err) }
})

router.put('/:id', ...admin, async (req, res, next) => {
  try {
    const { name, shiftType, startTime, endTime, breakMinutes, requiredHours, toleranceIn, toleranceOut, isActive } = req.body
    const shift = await svc.updateShift(req.params.id, {
      name, shiftType, startTime, endTime, breakMinutes, requiredHours, toleranceIn, toleranceOut, isActive,
    })
    res.json(shift)
  } catch (err) { next(err) }
})

router.delete('/:id', ...admin, async (req, res, next) => {
  try {
    await svc.deleteShift(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
})

module.exports = router
