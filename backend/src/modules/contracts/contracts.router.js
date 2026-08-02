const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const { createContractSchema, updateContractSchema } = require('./contracts.schema')
const ctrl = require('./contracts.controller')

// Mounted at /api/companies/:companyId/contracts
// Quyền theo công ty phụ trách kiểm tra trong service (admin: toàn quyền; staff: cty của mình)
const router = Router({ mergeParams: true })
const auth = [authenticate]

router.get('/',  ...auth, ctrl.listContracts)
router.post('/', ...auth, validate(createContractSchema), ctrl.createContract)

router.get('/:id',    ...auth, ctrl.getContract)
router.patch('/:id',  ...auth, validate(updateContractSchema), ctrl.updateContract)
router.delete('/:id', ...auth, ctrl.deleteContract)

module.exports = router
