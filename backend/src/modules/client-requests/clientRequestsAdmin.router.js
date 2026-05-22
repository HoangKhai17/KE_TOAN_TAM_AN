'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./clientRequests.controller')

const router = Router()
const admin = [authenticate, requireRole('admin')]

router.get('/overview', ...admin, ctrl.getAdminOverview)

module.exports = router
