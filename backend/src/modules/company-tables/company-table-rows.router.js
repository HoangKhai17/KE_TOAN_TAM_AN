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

// Rows — `reorder` must be declared before `/:rowId`
router.patch('/:defId/rows/reorder', ...auth, ctrl.reorderRows)
router.get('/:defId/rows',           ...auth, ctrl.listRows)
router.post('/:defId/rows',          ...auth, ctrl.createRow)
router.patch('/:defId/rows/:rowId',  ...auth, ctrl.updateRow)
router.delete('/:defId/rows/:rowId', ...auth, ctrl.deleteRow)

module.exports = router
