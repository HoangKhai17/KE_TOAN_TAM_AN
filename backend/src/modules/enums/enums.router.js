const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { updateOptionLabelSchema, addOptionSchema } = require('./enums.schema')
const ctrl = require('./enums.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /enums:
 *   get:
 *     tags: [Enums]
 *     summary: Get all enum types with their options (labels)
 *     responses:
 *       200:
 *         description: Map of typeKey → { label, isEditable, options[] }
 */
router.get('/', ...auth, ctrl.listAllEnums)

/**
 * @openapi
 * /enums/{typeKey}:
 *   get:
 *     tags: [Enums]
 *     summary: Get a single enum type's options
 *     parameters:
 *       - in: path
 *         name: typeKey
 *         required: true
 *         schema: { type: string, example: task_status }
 *     responses:
 *       200: { description: Enum type detail }
 *       404: { description: Not found }
 */
router.get('/:typeKey', ...auth, ctrl.getEnumType)

/**
 * @openapi
 * /enums/{typeKey}/options/{optionKey}:
 *   patch:
 *     tags: [Enums]
 *     summary: Update the display label of one enum option (admin only)
 *     parameters:
 *       - in: path
 *         name: typeKey
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: optionKey
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [label]
 *             properties:
 *               label: { type: string, maxLength: 200 }
 *     responses:
 *       200: { description: Updated option }
 *       404: { description: Not found }
 */
router.patch('/:typeKey/options/:optionKey', ...admin, validate(updateOptionLabelSchema), ctrl.updateOptionLabel)

/**
 * @openapi
 * /enums/{typeKey}/options:
 *   post:
 *     tags: [Enums]
 *     summary: Add a new option to an enum type (admin only)
 *     parameters:
 *       - in: path
 *         name: typeKey
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [optionKey, label]
 *             properties:
 *               optionKey: { type: string, pattern: '^[a-z0-9_]+$' }
 *               label: { type: string, maxLength: 200 }
 *     responses:
 *       201: { description: Option added }
 *       409: { description: Key already exists }
 */
router.post('/:typeKey/options', ...admin, validate(addOptionSchema), ctrl.addOption)

/**
 * @openapi
 * /enums/{typeKey}/options/{optionKey}/toggle:
 *   post:
 *     tags: [Enums]
 *     summary: Toggle is_active on an enum option (admin only)
 *     parameters:
 *       - in: path
 *         name: typeKey
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: optionKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Toggled }
 *       404: { description: Not found }
 */
router.post('/:typeKey/options/:optionKey/toggle', ...admin, ctrl.toggleOption)

module.exports = router
