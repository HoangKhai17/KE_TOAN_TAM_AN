const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const {
  createYearSchema,
  updateYearSchema,
  createDocSchema,
  updateDocSchema,
  reorderSchema,
  createColumnSchema,
} = require('./archive.schema')
const ctrl = require('./archive.controller')

// Mounted at /api/companies/:companyId/archive
const router = Router({ mergeParams: true })
const auth = [authenticate]

// ── Columns (company-level, không gắn với year) ───────────────────────────────
router.get('/columns',            ...auth, ctrl.listColumns)
router.post('/columns',           ...auth, validate(createColumnSchema), ctrl.createColumn)
router.delete('/columns/:colId',  ...auth, ctrl.deleteColumn)

// ── Years ─────────────────────────────────────────────────────────────────────
router.get('/years',            ...auth, ctrl.listYears)
router.post('/years',           ...auth, validate(createYearSchema), ctrl.createYear)
router.patch('/years/:yearId',  ...auth, validate(updateYearSchema), ctrl.updateYear)
router.delete('/years/:yearId', ...auth, ctrl.deleteYear)

// ── Batch import (company-level, không gắn với year cụ thể) ──────────────────
router.post('/batch',                       ...auth, ctrl.batchImport)

// ── Export (/export trước /:docId để tránh bị parse thành UUID) ──────────────
router.get('/years/:yearId/export',         ...auth, ctrl.exportExcel)

// ── Docs (/reorder trước /:docId để tránh bị parse thành UUID) ────────────────
router.get('/years/:yearId/docs',           ...auth, ctrl.listDocs)
router.post('/years/:yearId/docs',          ...auth, validate(createDocSchema), ctrl.createDoc)
router.patch('/years/:yearId/docs/reorder', ...auth, validate(reorderSchema),    ctrl.reorderDocs)
router.patch('/years/:yearId/docs/:docId',  ...auth, validate(updateDocSchema),  ctrl.updateDoc)
router.delete('/years/:yearId/docs/:docId', ...auth, ctrl.deleteDoc)

module.exports = router
