const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const { addLinkSchema, updateLinkSchema, attachDocumentSchema } = require('./documents.schema')
const ctrl = require('./documents.controller')

// Mounted at /api/companies/:companyId/documents
const router = Router({ mergeParams: true })
const auth      = [authenticate]
const adminOnly = [authenticate, requireRole('admin')]

router.get('/',            ...auth,      ctrl.listDocuments)
router.post('/',           ...auth,      validate(addLinkSchema),     ctrl.addDocumentLink)
router.patch('/:id',       ...auth,      validate(updateLinkSchema),  ctrl.updateDocumentLink)
router.post('/:id/attach', ...auth,      validate(attachDocumentSchema), ctrl.attachToTask)
router.delete('/:id',      ...adminOnly, ctrl.deleteDocument)

module.exports = router
