'use strict'
const { Router } = require('express')
const { authenticate }  = require('../../middleware/auth')
const { requireRole }   = require('../../middleware/rbac')
const { validate }      = require('../../middleware/validate')
const {
  createSchema, updateSchema,
  noteSchema, optionalNoteSchema, commentSchema,
  addChecklistItemSchema, updateChecklistItemSchema, addLinkSchema,
} = require('./internalAssignments.schema')
const ctrl = require('./internalAssignments.controller')

const router    = Router()
const auth      = [authenticate]
const adminOnly = [authenticate, requireRole('admin')]

// ─── Meta ─────────────────────────────────────────────────────────────────────
router.get('/meta/stats', ...auth, ctrl.getStats)
router.get('/meta/years', ...auth, ctrl.getYears)
router.get('/',           ...auth, ctrl.listAssignments)

// ─── CRUD ─────────────────────────────────────────────────────────────────────
router.post('/',     ...adminOnly, validate(createSchema), ctrl.createAssignment)
router.get('/:id',   ...auth,      ctrl.getAssignment)
router.patch('/:id', ...adminOnly, validate(updateSchema), ctrl.updateAssignment)
router.delete('/:id', ...adminOnly, ctrl.deleteAssignment)

// ─── Admin lifecycle actions ──────────────────────────────────────────────────
router.post('/:id/send',   ...adminOnly, ctrl.sendAssignment)
router.post('/:id/cancel', ...adminOnly, ctrl.cancelAssignment)
router.post('/:id/close',  ...adminOnly, ctrl.closeAssignment)

// ─── Staff actions ────────────────────────────────────────────────────────────
router.post('/:id/accept',   ...auth, ctrl.acceptAssignment)
router.post('/:id/progress', ...auth, ctrl.progressAssignment)
router.post('/:id/complete', ...auth, validate(optionalNoteSchema), ctrl.completeAssignment)
router.post('/:id/reject',   ...auth, validate(noteSchema),         ctrl.rejectAssignment)

// ─── Comments ─────────────────────────────────────────────────────────────────
router.post('/:id/comments',          ...auth, validate(commentSchema), ctrl.addComment)
router.delete('/:id/comments/:cid',   ...auth, ctrl.deleteComment)

// ─── Checklist ────────────────────────────────────────────────────────────────
router.get('/:id/checklist',               ...auth, ctrl.listChecklist)
router.post('/:id/checklist',              ...auth, validate(addChecklistItemSchema), ctrl.addChecklistItem)
router.patch('/:id/checklist/:itemId',     ...auth, validate(updateChecklistItemSchema), ctrl.updateChecklistItem)
router.delete('/:id/checklist/:itemId',    ...auth, ctrl.deleteChecklistItem)

// ─── Links ────────────────────────────────────────────────────────────────────
router.get('/:id/links',          ...auth, ctrl.listLinks)
router.post('/:id/links',         ...auth, validate(addLinkSchema), ctrl.addLink)
router.delete('/:id/links/:linkId', ...auth, ctrl.deleteLink)

module.exports = router
