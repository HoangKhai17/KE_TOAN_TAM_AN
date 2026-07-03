const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createScheduleSchema } = require('./schedules.schema')
const ctrl = require('./schedules.controller')

// mergeParams: true allows access to :companyId from the parent router
const router = Router({ mergeParams: true })
const auth  = [authenticate]   // quyền theo công ty phụ trách kiểm tra trong service

/**
 * @openapi
 * /companies/{companyId}/schedules:
 *   get:
 *     tags: [Schedules]
 *     summary: List all schedules for a company
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Schedule list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     schedules:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Schedule' }
 *       404: { description: Company not found }
 */
router.get('/', ...auth, ctrl.listSchedules)

/**
 * @openapi
 * /companies/{companyId}/schedules:
 *   post:
 *     tags: [Schedules]
 *     summary: Create a new schedule for a company (admin only)
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [taskTypeId, recurrenceType, recurrenceConfig]
 *             properties:
 *               taskTypeId:         { type: string, format: uuid }
 *               assignedStaffId:    { type: string, format: uuid, nullable: true }
 *               recurrenceType:     { type: string, enum: [daily, weekly, monthly_by_date, monthly_by_weekday, monthly_last_day, quarterly, yearly, custom_dates, once] }
 *               recurrenceConfig:   { type: object, description: "Config specific to recurrence type" }
 *               deadlineOffsetDays: { type: integer, minimum: 0, default: 0 }
 *               overrideSlaDays:    { type: integer, minimum: 1, nullable: true }
 *               notes:              { type: string, nullable: true }
 *     responses:
 *       201: { description: Schedule created }
 *       404: { description: Company or task type not found }
 *       422: { description: Validation error }
 */
router.post('/', ...auth, validate(createScheduleSchema), ctrl.createSchedule)

module.exports = router
