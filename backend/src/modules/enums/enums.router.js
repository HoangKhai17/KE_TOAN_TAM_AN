const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { updateOptionLabelSchema } = require('./enums.schema')
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

module.exports = router
