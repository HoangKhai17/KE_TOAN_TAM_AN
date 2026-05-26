const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const {
  createTaskSchema, updateTaskSchema, changeStatusSchema,
  addChecklistItemSchema, updateChecklistItemSchema,
  addDependencySchema,
  addCommentSchema, updateCommentSchema,
  addTimeLogSchema,
  upsertCustomFieldsSchema,
  addTaskLinkSchema,
} = require('./tasks.schema')
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

// IMPORTANT: must be before /:id to prevent 'meta' being matched as an ID
router.get('/meta/years', ...auth, ctrl.getAvailableYears)

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
router.delete('/:id', ...auth, ctrl.deleteTask)

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

// ─── Checklist ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}/checklist:
 *   get:
 *     tags: [Tasks]
 *     summary: List checklist items for a task
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Checklist items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskChecklistItem' }
 *       404: { description: Task not found }
 *   post:
 *     tags: [Tasks]
 *     summary: Add a checklist item
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stepText]
 *             properties:
 *               stepText: { type: string, maxLength: 500 }
 *     responses:
 *       201:
 *         description: Item added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/TaskChecklistItem' }
 *       404: { description: Task not found }
 */
router.get('/:id/checklist', ...auth, ctrl.listChecklist)
router.post('/:id/checklist', ...auth, validate(addChecklistItemSchema), ctrl.addChecklistItem)

/**
 * @openapi
 * /tasks/{id}/checklist/{itemId}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update a checklist item (text or completion status)
 *     parameters:
 *       - { in: path, name: id,     required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: itemId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stepText:    { type: string, maxLength: 500 }
 *               isCompleted: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     item: { $ref: '#/components/schemas/TaskChecklistItem' }
 *       404: { description: Item not found }
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a checklist item
 *     parameters:
 *       - { in: path, name: id,     required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: itemId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Item not found }
 */
router.patch('/:id/checklist/:itemId', ...auth, validate(updateChecklistItemSchema), ctrl.updateChecklistItem)
router.delete('/:id/checklist/:itemId', ...auth, ctrl.deleteChecklistItem)

// ─── Dependencies ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}/dependencies:
 *   get:
 *     tags: [Tasks]
 *     summary: List dependency tasks (tasks this task is waiting for)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: List of dependencies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     dependencies:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskDependency' }
 *       404: { description: Task not found }
 *   post:
 *     tags: [Tasks]
 *     summary: Add a dependency (task B must wait for task A)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dependsOnTaskId]
 *             properties:
 *               dependsOnTaskId: { type: string, format: uuid, description: 'ID của task phải hoàn thành trước' }
 *     responses:
 *       201:
 *         description: Dependency added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     dependency: { $ref: '#/components/schemas/TaskDependency' }
 *       409: { description: Dependency already exists }
 *       422: { description: Would create a circular dependency }
 */
router.get('/:id/dependencies', ...auth, ctrl.listDependencies)
router.post('/:id/dependencies', ...auth, validate(addDependencySchema), ctrl.addDependency)

/**
 * @openapi
 * /tasks/{id}/dependencies/{depId}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Remove a dependency
 *     parameters:
 *       - { in: path, name: id,    required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: depId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Removed }
 *       404: { description: Dependency not found }
 */
router.delete('/:id/dependencies/:depId', ...auth, ctrl.removeDependency)

// ─── Comments ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}/comments:
 *   get:
 *     tags: [Tasks]
 *     summary: List comments for a task
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page,  schema: { type: integer, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Comments list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     comments:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskComment' }
 *       404: { description: Task not found }
 *   post:
 *     tags: [Tasks]
 *     summary: Add a comment
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 5000 }
 *     responses:
 *       201:
 *         description: Comment added
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     comment: { $ref: '#/components/schemas/TaskComment' }
 *       404: { description: Task not found }
 */
router.get('/:id/comments', ...auth, ctrl.listComments)
router.post('/:id/comments', ...auth, validate(addCommentSchema), ctrl.addComment)

/**
 * @openapi
 * /tasks/{id}/comments/{commentId}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Edit a comment (owner or admin)
 *     parameters:
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: commentId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: string, maxLength: 5000 }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     comment: { $ref: '#/components/schemas/TaskComment' }
 *       403: { description: Not owner and not admin }
 *       404: { description: Comment not found }
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a comment (owner or admin)
 *     parameters:
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: commentId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Not owner and not admin }
 *       404: { description: Comment not found }
 */
router.patch('/:id/comments/:commentId', ...auth, validate(updateCommentSchema), ctrl.updateComment)
router.delete('/:id/comments/:commentId', ...auth, ctrl.deleteComment)

// ─── Time Logs ────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}/time-logs:
 *   get:
 *     tags: [Tasks]
 *     summary: List time logs for a task
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Time logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     timeLogs:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskTimeLog' }
 *       404: { description: Task not found }
 *   post:
 *     tags: [Tasks]
 *     summary: Log time spent on a task
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hours]
 *             properties:
 *               hours:      { type: number, minimum: 0.1, maximum: 24, example: 2.5 }
 *               note:       { type: string, maxLength: 500, nullable: true }
 *               loggedDate: { type: string, format: date, description: 'Mặc định: hôm nay' }
 *     responses:
 *       201:
 *         description: Time logged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     timeLog: { $ref: '#/components/schemas/TaskTimeLog' }
 *       404: { description: Task not found }
 */
router.get('/:id/time-logs', ...auth, ctrl.listTimeLogs)
router.post('/:id/time-logs', ...auth, validate(addTimeLogSchema), ctrl.addTimeLog)

/**
 * @openapi
 * /tasks/{id}/time-logs/{logId}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a time log (owner or admin)
 *     parameters:
 *       - { in: path, name: id,    required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: logId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Not owner and not admin }
 *       404: { description: Log not found }
 */
router.delete('/:id/time-logs/:logId', ...auth, ctrl.deleteTimeLog)

// ─── Custom Fields ────────────────────────────────────────────────────────────

/**
 * @openapi
 * /tasks/{id}/custom-fields:
 *   get:
 *     tags: [Tasks]
 *     summary: Get custom field values for a task (includes all schema fields, null if not set)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Custom field values
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskCustomFieldValue' }
 *       404: { description: Task not found }
 *   put:
 *     tags: [Tasks]
 *     summary: Upsert custom field values (partial update supported)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fields]
 *             properties:
 *               fields:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [fieldKey, value]
 *                   properties:
 *                     fieldKey: { type: string, example: 'ky_khai' }
 *                     value:    { nullable: true, oneOf: [{ type: string }, { type: number }, { type: boolean }] }
 *     responses:
 *       200:
 *         description: All field values after upsert
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fields:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskCustomFieldValue' }
 *       422: { description: Unknown field key or invalid select option }
 */
router.get('/:id/custom-fields', ...auth, ctrl.getCustomFields)
router.put('/:id/custom-fields', ...auth, validate(upsertCustomFieldsSchema), ctrl.upsertCustomFields)

// ─── Links ────────────────────────────────────────────────────────────────────

router.get('/:id/links', ...auth, ctrl.listLinks)
router.post('/:id/links', ...auth, validate(addTaskLinkSchema), ctrl.addLink)
router.delete('/:id/links/:linkId', ...auth, ctrl.deleteLink)

module.exports = router
