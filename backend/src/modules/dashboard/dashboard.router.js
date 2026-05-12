const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./dashboard.controller')

const router = Router()
const auth = [authenticate]

router.get('/summary', ...auth, ctrl.getSummary)
router.get('/charts',  ...auth, ctrl.getCharts)

module.exports = router
