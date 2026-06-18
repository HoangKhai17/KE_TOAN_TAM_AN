const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./progress-matrix.controller')

const router = Router()
const auth = [authenticate]

router.get('/task-types', ...auth, ctrl.getTaskTypes)
router.get('/years',      ...auth, ctrl.getYears)
router.get('/export',     ...auth, ctrl.exportMatrix)
router.get('/',           ...auth, ctrl.getMatrix)

module.exports = router
