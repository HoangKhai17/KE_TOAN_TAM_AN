const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createDocumentTypeSchema, updateDocumentTypeSchema } = require('./documentTypes.schema')
const ctrl = require('./documentTypes.controller')

// Mounted at /api/companies/:companyId/document-types
// Quyền theo công ty phụ trách kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth  = [authenticate]

/**
 * @openapi
 * /companies/{companyId}/document-types:
 *   get:
 *     tags: [DocumentTypes]
 *     summary: List document types (chứng từ phát sinh) of a company
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Document type list }
 *       404: { description: Company not found }
 *   post:
 *     tags: [DocumentTypes]
 *     summary: Create a document type
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Created }
 *       404: { description: Company not found }
 */
router.get('/',  ...auth, ctrl.listDocumentTypes)
router.post('/', ...auth, validate(createDocumentTypeSchema), ctrl.createDocumentType)

/**
 * @openapi
 * /companies/{companyId}/document-types/{id}:
 *   patch:
 *     tags: [DocumentTypes]
 *     summary: Update a document type
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [DocumentTypes]
 *     summary: Delete a document type
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.patch('/:id',  ...auth, validate(updateDocumentTypeSchema), ctrl.updateDocumentType)
router.delete('/:id', ...auth, ctrl.deleteDocumentType)

module.exports = router
