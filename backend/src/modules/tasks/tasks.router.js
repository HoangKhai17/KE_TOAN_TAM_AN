const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { createTaskSchema, updateTaskSchema, changeStatusSchema } = require('./tasks.schema')
const ctrl = require('./tasks.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks with multi-dimensional filters and pagination
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: companyId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: assignedTo
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: array, items: { type: string } }
 *         style: form
 *         explode: true
 *         description: Filter by one or more statuses
 *       - in: query
 *         name: priority
 *         schema: { type: array, items: { type: string } }
 *         style: form
 *         explode: true
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [auto, manual] }
 *       - in: query
 *         name: dueDateFrom
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: dueDateTo
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: periodLabel
 *         schema: { type: string, example: T05/2026 }
 *       - in: query
 *         name: isOverdue
 *         schema: { type: boolean }
 *         description: Filter tasks past due date with non-completed status
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Full-text search on title + description
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [created_at, due_date, priority, updated_at], default: created_at }
 *       - in: query
 *         name: sortDir
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Paginated task list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     tasks:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Task' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/', ...auth, ctrl.listTasks)

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task manually
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, companyId]
 *             properties:
 *               title:      { type: string, maxLength: 300 }
 *               description: { type: string, nullable: true }
 *               companyId:  { type: string, format: uuid }
 *               taskTypeId: { type: string, format: uuid, nullable: true }
 *               assignedTo: { type: string, format: uuid, nullable: true }
 *               dueDate:    { type: string, format: date, nullable: true }
 *               priority:   { type: string, enum: [low, medium, high, urgent], default: medium }
 *               slaDays:    { type: integer, minimum: 1, nullable: true }
 *     responses:
 *       201: { description: Task created (checklist auto-copied from task type if taskTypeId provided) }
 *       404: { description: Company or task type not found }
 *       422: { description: Validation error }
 */
router.post('/', ...auth, validate(createTaskSchema), ctrl.createTask)

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Task detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     task: { $ref: '#/components/schemas/Task' }
 *       404: { description: Not found }
 */
router.get('/:id', ...auth, ctrl.getTask)

/**
 * @openapi
 * /tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update task fields (title, description, assignedTo, dueDate, priority, slaDays)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
router.patch('/:id', ...auth, validate(updateTaskSchema), ctrl.updateTask)

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete task permanently (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.delete('/:id', ...admin, ctrl.deleteTask)

/**
 * @openapi
 * /tasks/{id}/status:
 *   post:
 *     tags: [Tasks]
 *     summary: Change task status (validates allowed transitions)
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
 *             required: [status]
 *             properties:
 *               status:       { type: string, enum: [pending, in_progress, on_hold, pending_review, needs_revision, completed] }
 *               onHoldReason: { type: string, description: "Required when status = on_hold" }
 *               force:        { type: boolean, default: false, description: "Force complete even if checklist not fully done" }
 *     responses:
 *       200: { description: Status changed }
 *       409: { description: Unchecked checklist items (use force=true to override) }
 *       422: { description: Invalid transition or missing on_hold_reason }
 */
router.post('/:id/status', ...auth, validate(changeStatusSchema), ctrl.changeTaskStatus)

/**
 * @openapi
 * /tasks/{id}/activity:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task activity log (status changes, assignments, etc.)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Activity log
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     logs:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ActivityLog' }
 */
router.get('/:id/activity', ...auth, ctrl.getActivityLog)

module.exports = router
