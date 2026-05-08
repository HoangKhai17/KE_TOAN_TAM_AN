const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { updateScheduleSchema } = require('./schedules.schema')
const ctrl = require('./schedules.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /schedules/{id}:
 *   get:
 *     tags: [Schedules]
 *     summary: Get schedule detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Schedule detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     schedule: { $ref: '#/components/schemas/Schedule' }
 *       404: { description: Not found }
 */
router.get('/:id', ...auth, ctrl.getSchedule)

/**
 * @openapi
 * /schedules/{id}:
 *   patch:
 *     tags: [Schedules]
 *     summary: Update schedule (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
router.patch('/:id', ...admin, validate(updateScheduleSchema), ctrl.updateSchedule)

/**
 * @openapi
 * /schedules/{id}:
 *   delete:
 *     tags: [Schedules]
 *     summary: Delete schedule — only if no tasks have been generated (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: Cannot delete — tasks already generated }
 */
router.delete('/:id', ...admin, ctrl.deleteSchedule)

/**
 * @openapi
 * /schedules/{id}/preview:
 *   get:
 *     tags: [Schedules]
 *     summary: Preview next 10 dates this schedule will trigger
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Preview dates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     dates:
 *                       type: array
 *                       items: { type: string, format: date }
 */
router.get('/:id/preview', ...auth, ctrl.previewSchedule)

/**
 * @openapi
 * /schedules/{id}/toggle:
 *   post:
 *     tags: [Schedules]
 *     summary: Toggle is_active on/off (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Toggled }
 */
router.post('/:id/toggle', ...admin, ctrl.toggleSchedule)

module.exports = router
