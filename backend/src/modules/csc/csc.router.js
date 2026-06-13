const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createContractSchema, updateContractSchema, createColumnSchema } = require('./csc.schema')
const ctrl = require('./csc.controller')

const router = Router({ mergeParams: true })
const auth = [authenticate]

// Custom columns
router.get('/columns',           ...auth, ctrl.listColumns)
router.post('/columns',          ...auth, validate(createColumnSchema), ctrl.createColumn)
router.delete('/columns/:colId', ...auth, ctrl.deleteColumn)

// Contracts (export before /:id to avoid route collision)
router.get('/export',  ...auth, ctrl.exportExcel)
router.get('/',        ...auth, ctrl.listContracts)
router.post('/',       ...auth, validate(createContractSchema), ctrl.createContract)
router.patch('/:id',   ...auth, validate(updateContractSchema), ctrl.updateContract)
router.delete('/:id',  ...auth, ctrl.deleteContract)

module.exports = router
