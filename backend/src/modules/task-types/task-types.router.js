const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const {
  createTaskTypeSchema, updateTaskTypeSchema,
  checklistStepSchema, updateChecklistStepSchema, reorderChecklistSchema,
  createCustomFieldSchema, updateCustomFieldSchema,
} = require('./task-types.schema')
const ctrl = require('./task-types.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /task-types:
 *   get:
 *     tags: [Task Types]
 *     summary: List all task types, optionally filtered
 *     parameters:
 *       - in: query
 *         name: groupName
 *         schema: { type: string }
 *         description: Filter by group name (e.g. Khai thuế)
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Task type list (flat + grouped)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskTypes:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/TaskType' }
 *                     grouped:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items: { $ref: '#/components/schemas/TaskType' }
 */
router.get('/', ...auth, ctrl.listTaskTypes)

/**
 * @openapi
 * /task-types:
 *   post:
 *     tags: [Task Types]
 *     summary: Create a new task type (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:           { type: string }
 *               groupName:      { type: string, nullable: true }
 *               description:    { type: string, nullable: true }
 *               defaultSlaDays: { type: integer, minimum: 1, default: 7 }
 *     responses:
 *       201: { description: Task type created }
 *       422: { description: Validation error }
 */
router.post('/', ...admin, validate(createTaskTypeSchema), ctrl.createTaskType)

/**
 * @openapi
 * /task-types/{id}:
 *   get:
 *     tags: [Task Types]
 *     summary: Get task type detail with checklist and custom fields
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Task type detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     taskType: { $ref: '#/components/schemas/TaskTypeDetail' }
 *       404: { description: Not found }
 */
router.get('/:id', ...auth, ctrl.getTaskType)

/**
 * @openapi
 * /task-types/{id}:
 *   patch:
 *     tags: [Task Types]
 *     summary: Update task type (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 */
router.patch('/:id', ...admin, validate(updateTaskTypeSchema), ctrl.updateTaskType)

/**
 * @openapi
 * /task-types/{id}/toggle:
 *   post:
 *     tags: [Task Types]
 *     summary: Toggle is_active on/off (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Toggled }
 */
router.post('/:id/toggle', ...admin, ctrl.toggleTaskType)

/**
 * @openapi
 * /task-types/{id}:
 *   delete:
 *     tags: [Task Types]
 *     summary: Delete a task type (admin only) — chỉ khi CHƯA có task/lịch sử dụng
 *     responses:
 *       204: { description: Deleted }
 *       409: { description: Đang được sử dụng — không thể xoá }
 */
router.delete('/:id', ...admin, ctrl.deleteTaskType)

// ── Checklist ─────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /task-types/{id}/checklist:
 *   get:
 *     tags: [Task Types]
 *     summary: Get checklist template steps
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Checklist steps ordered by step_order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     steps:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/ChecklistStep' }
 */
router.get('/:id/checklist', ...auth, ctrl.getChecklist)

/**
 * @openapi
 * /task-types/{id}/checklist:
 *   post:
 *     tags: [Task Types]
 *     summary: Add a checklist step (auto-appended at end)
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
 *             required: [stepText]
 *             properties:
 *               stepText: { type: string, maxLength: 300 }
 *     responses:
 *       201: { description: Step added }
 */
router.post('/:id/checklist', ...admin, validate(checklistStepSchema), ctrl.addChecklistStep)

/**
 * @openapi
 * /task-types/{id}/checklist/reorder:
 *   post:
 *     tags: [Task Types]
 *     summary: Reorder checklist steps (admin only)
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
 *             required: [steps]
 *             properties:
 *               steps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:        { type: string, format: uuid }
 *                     stepOrder: { type: integer, minimum: 1 }
 *     responses:
 *       200: { description: Reordered, returns new order }
 */
router.post('/:id/checklist/reorder', ...admin, validate(reorderChecklistSchema), ctrl.reorderChecklist)

/**
 * @openapi
 * /task-types/{id}/checklist/{stepId}:
 *   patch:
 *     tags: [Task Types]
 *     summary: Update checklist step text or order (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: stepId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 */
router.patch('/:id/checklist/:stepId', ...admin, validate(updateChecklistStepSchema), ctrl.updateChecklistStep)

/**
 * @openapi
 * /task-types/{id}/checklist/{stepId}:
 *   delete:
 *     tags: [Task Types]
 *     summary: Delete a checklist step (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: stepId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id/checklist/:stepId', ...admin, ctrl.deleteChecklistStep)

// ── Custom Fields ─────────────────────────────────────────────────────────────

/**
 * @openapi
 * /task-types/{id}/fields:
 *   get:
 *     tags: [Task Types]
 *     summary: Get custom field schemas for a task type
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Custom field schema list
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
 *                       items: { $ref: '#/components/schemas/CustomFieldSchema' }
 */
router.get('/:id/fields', ...auth, ctrl.getCustomFields)

/**
 * @openapi
 * /task-types/{id}/fields:
 *   post:
 *     tags: [Task Types]
 *     summary: Add a custom field schema (admin only)
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
 *             required: [fieldKey, label, dataType]
 *             properties:
 *               fieldKey:     { type: string, pattern: '^[a-z][a-z0-9_]*$', example: so_to_khai }
 *               label:        { type: string, example: Số tờ khai }
 *               dataType:     { type: string, enum: [text, number, date, boolean, select] }
 *               options:      { type: array, items: { type: string }, nullable: true, description: Required for select type }
 *               isRequired:   { type: boolean, default: false }
 *               displayOrder: { type: integer, default: 0 }
 *     responses:
 *       201: { description: Field created }
 *       409: { description: Field key already exists }
 */
router.post('/:id/fields', ...admin, validate(createCustomFieldSchema), ctrl.addCustomField)

/**
 * @openapi
 * /task-types/{id}/fields/{fieldId}:
 *   patch:
 *     tags: [Task Types]
 *     summary: Update a custom field schema (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: fieldId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 */
router.patch('/:id/fields/:fieldId', ...admin, validate(updateCustomFieldSchema), ctrl.updateCustomField)

/**
 * @openapi
 * /task-types/{id}/fields/{fieldId}:
 *   delete:
 *     tags: [Task Types]
 *     summary: Delete a custom field schema (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: fieldId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
router.delete('/:id/fields/:fieldId', ...admin, ctrl.deleteCustomField)

module.exports = router
