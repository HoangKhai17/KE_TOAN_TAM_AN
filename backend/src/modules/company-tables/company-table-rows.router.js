const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./company-tables.controller')

const auth   = [authenticate]
// mounted at /api/companies/:companyId/tables
const router = Router({ mergeParams: true })

// Per-company columns (hybrid)
router.get('/:defId/company-columns',           ...auth, ctrl.listCompanyColumns)
router.post('/:defId/company-columns',          ...auth, ctrl.addCompanyColumn)
router.delete('/:defId/company-columns/:colId', ...auth, ctrl.deleteCompanyColumn)

// File (cột kiểu 'file') — gộp toàn bộ file của bảng theo (rowId, colKey)
router.get('/:defId/files', ...auth, ctrl.listDefFiles)

// Rows — specific paths before `/:rowId`
router.patch('/:defId/rows/reorder', ...auth, ctrl.reorderRows)
router.post('/:defId/rows/batch',    ...auth, ctrl.batchRows)
router.post('/:defId/rows/upsert',   ...auth, ctrl.upsertRows)
router.get('/:defId/rows',           ...auth, ctrl.listRows)
router.post('/:defId/rows',          ...auth, ctrl.createRow)
router.patch('/:defId/rows/:rowId',  ...auth, ctrl.updateRow)
router.delete('/:defId/rows/:rowId', ...auth, ctrl.deleteRow)

module.exports = router
