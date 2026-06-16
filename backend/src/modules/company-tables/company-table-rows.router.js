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

// Rows — specific paths before `/:rowId`
router.patch('/:defId/rows/reorder', ...auth, ctrl.reorderRows)
router.post('/:defId/rows/batch',    ...auth, ctrl.batchRows)
router.get('/:defId/rows',           ...auth, ctrl.listRows)
router.post('/:defId/rows',          ...auth, ctrl.createRow)
router.patch('/:defId/rows/:rowId',  ...auth, ctrl.updateRow)
router.delete('/:defId/rows/:rowId', ...auth, ctrl.deleteRow)

module.exports = router
