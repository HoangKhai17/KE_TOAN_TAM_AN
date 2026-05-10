const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./scheduler.controller')

const router = Router()
const admin  = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /admin/scheduler/status:
 *   get:
 *     tags: [Admin]
 *     summary: Get task generator scheduler status (admin only)
 *     responses:
 *       200:
 *         description: Scheduler status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     scheduler: { $ref: '#/components/schemas/SchedulerStatus' }
 */
router.get('/status', ...admin, ctrl.getStatus)

/**
 * @openapi
 * /admin/scheduler/run-now:
 *   post:
 *     tags: [Admin]
 *     summary: Manually trigger the task generator (admin only)
 *     description: Idempotent — will not create duplicate tasks. Blocks until complete.
 *     responses:
 *       200:
 *         description: Run result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     result:
 *                       type: object
 *                       properties:
 *                         generated:  { type: integer, description: 'Số task được tạo mới' }
 *                         skipped:    { type: integer, description: 'Số schedule bỏ qua (đã tạo hoặc chưa đến ngày)' }
 *                         errors:     { type: integer, description: 'Số schedule gặp lỗi' }
 *                         durationMs: { type: integer, description: 'Thời gian chạy (ms)' }
 *       409: { description: Scheduler is already running }
 */
router.post('/run-now', ...admin, ctrl.runNow)

module.exports = router
