const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { loginSchema, changePasswordSchema } = require('./auth.schema')
const ctrl = require('./auth.controller')

const router = Router()

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email and password
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: admin@ketoan-taman.vn }
 *               password: { type: string, example: Admin@2026! }
 *     responses:
 *       200:
 *         description: Login successful — refreshToken set as HttpOnly cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     user: { $ref: '#/components/schemas/UserSafe' }
 *       401: { description: Invalid credentials }
 *       423: { description: Account locked }
 */
router.post('/login', validate(loginSchema), ctrl.postLogin)

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token and get new access token
 *     description: Reads `refreshToken` HttpOnly cookie. Returns new access token and rotates the cookie.
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string }
 *                     user: { $ref: '#/components/schemas/UserSafe' }
 *       401: { description: Invalid or expired refresh token }
 */
router.post('/refresh', ctrl.postRefresh)

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout current session
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *       401: { description: Unauthorized }
 */
router.post('/logout', authenticate, ctrl.postLogout)

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Logout all sessions for current user
 *     responses:
 *       200:
 *         description: All sessions terminated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *       401: { description: Unauthorized }
 */
router.post('/logout-all', authenticate, ctrl.postLogoutAll)

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change own password (invalidates all sessions)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:
 *                 type: string
 *                 description: Min 8 chars, must contain uppercase, number, and special character
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Current password incorrect }
 *       422: { description: Validation error }
 */
router.post('/change-password', authenticate, validate(changePasswordSchema), ctrl.postChangePassword)

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     responses:
 *       200:
 *         description: Current user
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
 *       401: { description: Unauthorized }
 */
router.get('/me', authenticate, ctrl.getMe)

module.exports = router
