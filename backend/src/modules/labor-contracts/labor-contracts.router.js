const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createContractSchema, updateContractSchema, createColumnSchema } = require('./labor-contracts.schema')
const ctrl = require('./labor-contracts.controller')

// Mounted at /api/companies/:companyId/labor-contracts
const router = Router({ mergeParams: true })
const auth = [authenticate]

// Contracts
router.get('/',       ...auth, ctrl.list)
router.post('/',      ...auth, validate(createContractSchema), ctrl.create)

// Specific string-path routes BEFORE /:id to avoid 'export'/'columns' being parsed as ID
router.post('/batch',             ...auth, ctrl.batchImport)
router.get('/export',             ...auth, ctrl.exportExcel)
router.get('/columns',            ...auth, ctrl.listColumns)
router.post('/columns',           ...auth, validate(createColumnSchema), ctrl.createColumn)
router.delete('/columns/:columnId', ...auth, ctrl.deleteColumn)

// Parameterised routes last
router.patch('/:id',  ...auth, validate(updateContractSchema), ctrl.update)
router.delete('/:id', ...auth, ctrl.remove)

module.exports = router
