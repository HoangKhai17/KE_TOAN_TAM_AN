'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./onedrive.controller')

const router = Router()
const adminOnly = [authenticate, requireRole('admin')]

router.get('/status',     ...adminOnly, ctrl.getStatus)
router.get('/auth-url',   ...adminOnly, ctrl.getAuthUrl)
router.post('/exchange',  ...adminOnly, ctrl.exchangeCode)
router.post('/disconnect',...adminOnly, ctrl.disconnectOneDrive)

module.exports = router
