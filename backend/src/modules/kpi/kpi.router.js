'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./kpi.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// Chốt sổ / mở lại tháng (admin) — ĐẶT TRƯỚC '/:userId'
router.post('/close',  ...admin, ctrl.close)
router.post('/reopen', ...admin, ctrl.reopen)

// Hiệu suất tổng hợp + mốc quy đổi (ĐẶT TRƯỚC '/:userId')
router.get('/performance', ...auth, ctrl.performance)
router.get('/tiers',       ...auth,  ctrl.listTiers)
router.post('/tiers',      ...admin, ctrl.createTier)
router.patch('/tiers/:id', ...admin, ctrl.updateTier)
router.delete('/tiers/:id', ...admin, ctrl.deleteTier)

router.get('/',        ...auth, ctrl.list)
router.get('/:userId', ...auth, ctrl.detail)

module.exports = router
