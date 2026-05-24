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
} = require('./clientRequests.schema')
const ctrl = require('./clientRequests.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// ─── List & CRUD ──────────────────────────────────────────────────────────────

router.get('/',             ...auth, ctrl.listClientRequests)
router.get('/meta/years',   ...auth, ctrl.getAvailableYears)
router.post('/',            ...auth, validate(createClientRequestSchema), ctrl.createClientRequest)
router.get('/:id',          ...auth, ctrl.getClientRequest)
router.patch('/:id', ...auth, validate(updateClientRequestSchema), ctrl.updateClientRequest)
router.delete('/:id', ...admin, ctrl.deleteClientRequest)

// ─── Status actions ───────────────────────────────────────────────────────────

router.post('/:id/receive',       ...auth,  ctrl.receiveClientRequest)
router.post('/:id/unreceive',     ...auth,  ctrl.unreceiveClientRequest)
router.post('/:id/dismiss',       ...admin, ctrl.dismissClientRequest)
router.post('/:id/remind',        ...auth,  validate(remindSchema), ctrl.sendReminder)
router.post('/:id/generate-link',  ...auth,  validate(generateLinkSchema),  ctrl.generateLink)
router.post('/:id/revoke-link',    ...auth,  ctrl.revokeLink)
router.post('/:id/manual-submit',  ...auth,  validate(manualSubmitSchema),   ctrl.manualSubmit)

module.exports = router
