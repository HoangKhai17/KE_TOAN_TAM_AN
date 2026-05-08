const { Router } = require('express')
const { z } = require('zod')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const ctrl = require('./system-configs.controller')

const router = Router()
const admin = [authenticate, requireRole('admin')]

const updateConfigSchema = z.object({
  value: z.union([z.string(), z.number()]).transform(String),
})

/**
 * @openapi
 * /system-configs:
 *   get:
 *     tags: [System Configs]
 *     summary: List all system configuration entries (admin only)
 *     responses:
 *       200:
 *         description: Config list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     configs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:          { type: string, format: uuid }
 *                           key:         { type: string }
 *                           value:       { type: string }
 *                           description: { type: string, nullable: true }
 *                           updatedBy:   { type: string, format: uuid, nullable: true }
 *                           updatedAt:   { type: string, format: date-time }
 */
router.get('/', ...admin, ctrl.listConfigs)

/**
 * @openapi
 * /system-configs/{key}:
 *   patch:
 *     tags: [System Configs]
 *     summary: Update a single config value by key (admin only)
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         example: deadline_warning_days
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: { oneOf: [{ type: string }, { type: number }] }
 *     responses:
 *       200:  { description: Config updated }
 *       404:  { description: Key not found }
 *       422:  { description: Validation error }
 */
router.patch('/:key', ...admin, validate(updateConfigSchema), ctrl.updateConfig)

module.exports = router
