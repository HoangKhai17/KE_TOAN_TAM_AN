const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createOriginalDocumentSchema, updateOriginalDocumentSchema } = require('./originalDocuments.schema')
const ctrl = require('./originalDocuments.controller')

// Mounted at /api/companies/:companyId/original-documents
// "KH lưu HS gốc tại Cty" — cấu trúc giống Chứng từ phát sinh.
// Quyền theo công ty phụ trách kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth  = [authenticate]

/**
 * @openapi
 * /companies/{companyId}/original-documents:
 *   get:
 *     tags: [OriginalDocuments]
 *     summary: List original documents (KH lưu HS gốc tại Cty) of a company
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Original document list }
 *       404: { description: Company not found }
 *   post:
 *     tags: [OriginalDocuments]
 *     summary: Create an original document
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Created }
 *       404: { description: Company not found }
 */
router.get('/',  ...auth, ctrl.listOriginalDocuments)
router.post('/', ...auth, validate(createOriginalDocumentSchema), ctrl.createOriginalDocument)

/**
 * @openapi
 * /companies/{companyId}/original-documents/{id}:
 *   patch:
 *     tags: [OriginalDocuments]
 *     summary: Update an original document
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [OriginalDocuments]
 *     summary: Delete an original document
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.patch('/:id',  ...auth, validate(updateOriginalDocumentSchema), ctrl.updateOriginalDocument)
router.delete('/:id', ...auth, ctrl.deleteOriginalDocument)

module.exports = router
