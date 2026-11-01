const { Router } = require('express')
const { authenticate }    = require('../../middleware/auth')
const { requireRole }     = require('../../middleware/rbac')
const ctrl = require('./reports.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// Chỉ còn báo cáo Dự báo (các loại khác đã gỡ bỏ theo yêu cầu).
router.get('/forecast', ...auth,  ctrl.getForecast)
router.get('/export/:type', ...admin, ctrl.exportReport)

module.exports = router
