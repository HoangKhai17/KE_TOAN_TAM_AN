'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const {
  createClientRequestSchema,
  updateClientRequestSchema,
  remindSchema,
  generateLinkSchema,
  manualSubmitSchema,
  addCommentSchema,
  updateCommentSchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
  reorderChecklistSchema,
} = require('./clientRequests.schema')
const ctrl = require('./clientRequests.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// ─── List & CRUD ──────────────────────────────────────────────────────────────

router.get('/',             ...auth, ctrl.listClientRequests)
router.get('/meta/years',   ...auth, ctrl.getAvailableYears)
router.get('/meta/column-values', ...auth, ctrl.getColumnValues)
router.get('/stats',        ...auth, ctrl.getStats)
router.post('/',            ...auth, validate(createClientRequestSchema), ctrl.createClientRequest)
router.get('/:id',          ...auth, ctrl.getClientRequest)
router.patch('/:id', ...auth, validate(updateClientRequestSchema), ctrl.updateClientRequest)
router.delete('/:id', ...auth, ctrl.deleteClientRequest)

// ─── Status actions ───────────────────────────────────────────────────────────

router.post('/:id/receive',       ...auth, ctrl.receiveClientRequest)
router.post('/:id/unreceive',     ...auth, ctrl.unreceiveClientRequest)
router.post('/:id/dismiss',       ...auth, ctrl.dismissClientRequest)
router.post('/:id/priority',      ...auth, ctrl.setPriority)
router.post('/:id/remind',        ...auth,  validate(remindSchema), ctrl.sendReminder)
router.post('/:id/generate-link',  ...auth,  validate(generateLinkSchema),  ctrl.generateLink)
router.post('/:id/revoke-link',    ...auth,  ctrl.revokeLink)
router.post('/:id/manual-submit',  ...auth,  validate(manualSubmitSchema),   ctrl.manualSubmit)

// ─── Bình luận ──────────────────────────────────────────────────────────────────

router.get('/:id/comments',                 ...auth, ctrl.listComments)
router.post('/:id/comments',                ...auth, validate(addCommentSchema),    ctrl.addComment)
router.patch('/:id/comments/:commentId',    ...auth, validate(updateCommentSchema), ctrl.updateComment)
router.delete('/:id/comments/:commentId',   ...auth, ctrl.deleteComment)

// ─── Checklist (giấy tờ cần thu) ─────────────────────────────────────────────────

router.get('/:id/checklist',                ...auth, ctrl.listChecklist)
router.post('/:id/checklist',               ...auth, validate(addChecklistItemSchema),    ctrl.addChecklistItem)
router.post('/:id/checklist/reorder',       ...auth, validate(reorderChecklistSchema),    ctrl.reorderChecklist)
router.patch('/:id/checklist/:itemId',      ...auth, validate(updateChecklistItemSchema), ctrl.updateChecklistItem)
router.delete('/:id/checklist/:itemId',     ...auth, ctrl.deleteChecklistItem)

module.exports = router
