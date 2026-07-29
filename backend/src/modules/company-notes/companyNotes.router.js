const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createNoteSchema, updateNoteSchema } = require('./companyNotes.schema')
const ctrl = require('./companyNotes.controller')

// Mounted at /api/companies/:companyId/notes
// Quyền theo công ty phụ trách kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth  = [authenticate]

/**
 * @openapi
 * /companies/{companyId}/notes:
 *   get:
 *     tags: [CompanyNotes]
 *     summary: List important notes (điều cần lưu ý) of a company
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Note list }
 *       404: { description: Company not found }
 *   post:
 *     tags: [CompanyNotes]
 *     summary: Create a note
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201: { description: Created }
 *       404: { description: Company not found }
 */
router.get('/',  ...auth, ctrl.listNotes)
router.post('/', ...auth, validate(createNoteSchema), ctrl.createNote)

/**
 * @openapi
 * /companies/{companyId}/notes/{id}:
 *   patch:
 *     tags: [CompanyNotes]
 *     summary: Update a note
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [CompanyNotes]
 *     summary: Delete a note
 *     parameters:
 *       - { in: path, name: companyId, required: true, schema: { type: string, format: uuid } }
 *       - { in: path, name: id,        required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204: { description: Deleted }
 *       404: { description: Not found }
 */
router.patch('/:id',  ...auth, validate(updateNoteSchema), ctrl.updateNote)
router.delete('/:id', ...auth, ctrl.deleteNote)

module.exports = router
