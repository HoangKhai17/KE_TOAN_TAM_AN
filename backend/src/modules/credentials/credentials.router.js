const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createCredentialSchema, updateCredentialSchema } = require('./credentials.schema')
const ctrl = require('./credentials.controller')

// Mounted at /api/companies/:companyId/credentials
// Quyền theo công ty phụ trách được kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth  = [authenticate]

/**
 * @openapi
 * /companies/{companyId}/credentials:
 *   get:
 *     tags: [Credentials]
 *     summary: List credentials for a company (password always masked as ***)
 *     parameters:
 *       - { in: path,  name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: isActive,  schema: { type: boolean }, description: 'Lọc theo trạng thái' }
 *     responses:
 *       200:
 *         description: Credential list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     credentials:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Credential' }
 *       404: { description: Company not found }
 *   post:
 *     tags: [Credentials]
 *     summary: Create a credential (admin only)
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [systemName, username, password]
 *             properties:
 *               systemName: { type: string, maxLength: 200, example: 'Cổng thuế điện tử eTax' }
 *               systemUrl:  { type: string, format: uri, nullable: true }
 *               username:   { type: string, maxLength: 200 }
 *               password:   { type: string, description: 'Mã hóa AES-256-GCM server-side' }
 *               notes:      { type: string, nullable: true }
 *               isActive:   { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Credential created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     credential: { $ref: '#/components/schemas/Credential' }
 *       404: { description: Company not found }
 */
router.get('/',     ...auth,  ctrl.listCredentials)
router.post('/',    ...auth,  validate(createCredentialSchema), ctrl.createCredential)

/**
 * @openapi
 * /companies/{companyId}/credentials/{id}:
 *   get:
 *     tags: [Credentials]
 *     summary: Get a single credential (password masked)
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Credential detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     credential: { $ref: '#/components/schemas/Credential' }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Credentials]
 *     summary: Update a credential (admin only)
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               systemName: { type: string }
 *               systemUrl:  { type: string, format: uri, nullable: true }
 *               username:   { type: string }
 *               password:   { type: string }
 *               notes:      { type: string, nullable: true }
 *               isActive:   { type: boolean }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Credentials]
 *     summary: Delete a credential permanently (admin only)
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.get('/:id',          ...auth,  ctrl.getCredential)
router.patch('/:id',        ...auth,  validate(updateCredentialSchema), ctrl.updateCredential)
router.delete('/:id',       ...auth,  ctrl.deleteCredential)

/**
 * @openapi
 * /companies/{companyId}/credentials/{id}/reveal:
 *   post:
 *     tags: [Credentials]
 *     summary: Reveal plaintext password (writes audit log)
 *     description: Returns the decrypted password once. Every call is recorded in audit_logs with action=credential.revealed.
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Plaintext password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     password: { type: string, example: 'P@ssw0rd123' }
 *       404: { description: Not found }
 */
router.post('/:id/reveal',  ...auth,  ctrl.revealCredential)

module.exports = router
