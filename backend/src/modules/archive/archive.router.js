const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const {
  createYearSchema,
  updateYearSchema,
  createDocSchema,
  updateDocSchema,
  reorderSchema,
} = require('./archive.schema')
const ctrl = require('./archive.controller')

// Mounted at /api/companies/:companyId/archive
const router = Router({ mergeParams: true })
const auth = [authenticate]

// ── Years ─────────────────────────────────────────────────────────────────────
router.get('/years',            ...auth, ctrl.listYears)
router.post('/years',           ...auth, validate(createYearSchema), ctrl.createYear)
router.patch('/years/:yearId',  ...auth, validate(updateYearSchema), ctrl.updateYear)
router.delete('/years/:yearId', ...auth, ctrl.deleteYear)

// ── Docs (/reorder trước /:docId để tránh bị parse thành UUID) ────────────────
router.get('/years/:yearId/docs',           ...auth, ctrl.listDocs)
router.post('/years/:yearId/docs',          ...auth, validate(createDocSchema), ctrl.createDoc)
router.patch('/years/:yearId/docs/reorder', ...auth, validate(reorderSchema),    ctrl.reorderDocs)
router.patch('/years/:yearId/docs/:docId',  ...auth, validate(updateDocSchema),  ctrl.updateDoc)
router.delete('/years/:yearId/docs/:docId', ...auth, ctrl.deleteDoc)

module.exports = router
