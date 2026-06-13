const { Router } = require('express')
const { authenticate, requireRole } = require('../../middleware/auth')
const { validate }                  = require('../../middleware/validate')
const ctrl                          = require('./nsnn.controller')
const { createDebtSchema, updateDebtSchema, createColumnSchema } = require('./nsnn.schema')

const auth   = [authenticate]
const router = Router({ mergeParams: true })

router.get('/columns',           ...auth, ctrl.listColumns)
router.post('/columns',          ...auth, ctrl.createColumn)
router.delete('/columns/:colId', ...auth, ctrl.deleteColumn)

router.get('/export', ...auth, ctrl.exportExcel)
router.post('/batch', ...auth, ctrl.batchImport)

router.get('/',      ...auth, ctrl.listDebts)
router.post('/',     ...auth, validate(createDebtSchema), ctrl.createDebt)
router.patch('/:id', ...auth, validate(updateDebtSchema), ctrl.updateDebt)
router.delete('/:id',...auth, ctrl.deleteDebt)

module.exports = router
