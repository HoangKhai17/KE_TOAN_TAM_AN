const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { createUserSchema, updateUserSchema, updateStatusSchema, resetPasswordSchema } = require('./users.schema')
const ctrl = require('./users.controller')

const router = Router()
const adminOnly = [authenticate, requireRole('admin')]

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users (admin only)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, staff] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, suspended] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: Paginated user list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/UserSafe' }
 *                     pagination: { $ref: '#/components/schemas/Pagination' }
 *       403: { description: Admin only }
 */
router.get('/', ...adminOnly, ctrl.listUsers)

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new user (admin only)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, minLength: 2, maxLength: 100 }
 *               email:    { type: string, format: email }
 *               password: { type: string, description: Min 8 chars, uppercase, number, special char }
 *               role:     { type: string, enum: [admin, staff], default: staff }
 *               phone:    { type: string, nullable: true }
 *               jobTitle: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: User created (must_change_pw set to true)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserSafe' }
 *       409: { description: Email already in use }
 *       422: { description: Validation error }
 */
router.post('/', ...adminOnly, validate(createUserSchema), ctrl.createUser)

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserSafe' }
 *       404: { description: User not found }
 */
router.get('/:id', ...adminOnly, ctrl.getUser)

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update user profile (admin only)
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
 *             properties:
 *               name:     { type: string }
 *               phone:    { type: string, nullable: true }
 *               jobTitle: { type: string, nullable: true }
 *               avatarUrl: { type: string, format: uri, nullable: true }
 *               role:     { type: string, enum: [admin, staff] }
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/UserSafe' }
 *       404: { description: User not found }
 */
router.patch('/:id', ...adminOnly, validate(updateUserSchema), ctrl.updateUser)

/**
 * @openapi
 * /users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Update user status (admin only)
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
 *               status: { type: string, enum: [active, inactive, suspended] }
 *     responses:
 *       200: { description: Status updated }
 *       404: { description: User not found }
 */
router.patch('/:id/status', ...adminOnly, validate(updateStatusSchema), ctrl.updateStatus)
router.patch('/:id/reset-password', ...adminOnly, validate(resetPasswordSchema), ctrl.resetPassword)

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete user (admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: User deleted }
 *       400: { description: Cannot delete own account }
 *       404: { description: User not found }
 */
router.delete('/:id', ...adminOnly, ctrl.deleteUser)

module.exports = router
