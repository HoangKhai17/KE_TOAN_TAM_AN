const { Router } = require('express')
const { authenticate }    = require('../../middleware/auth')
const { requireRole }     = require('../../middleware/rbac')
const ctrl = require('./reports.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

router.get('/staff',    ...auth,  ctrl.getStaffPerformance)
router.get('/company',  ...auth,  ctrl.getCompanyStatus)
router.get('/sla',      ...auth,  ctrl.getSlaCompliance)
router.get('/aging',    ...auth,  ctrl.getAging)
router.get('/velocity', ...auth,  ctrl.getVelocity)
router.get('/forecast', ...auth,  ctrl.getForecast)
router.get('/export/:type', ...admin, ctrl.exportReport)

module.exports = router
