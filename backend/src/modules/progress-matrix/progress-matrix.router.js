const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./progress-matrix.controller')

const router = Router()
const auth = [authenticate]

router.get('/task-types', ...auth, ctrl.getTaskTypes)
router.get('/years',      ...auth, ctrl.getYears)
router.get('/sources',    ...auth, ctrl.getSources)
router.get('/by-company', ...auth, ctrl.getByCompany)
router.get('/by-staff',   ...auth, ctrl.getByStaff)
router.post('/export',    ...auth, ctrl.exportReport)
router.get('/',           ...auth, ctrl.getMatrix)

module.exports = router
