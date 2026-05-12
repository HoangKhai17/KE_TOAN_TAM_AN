'use strict'

const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./scheduler.controller')

const router = Router()
const admin  = [authenticate, requireRole('admin')]

router.get   ('/status',      ...admin, ctrl.getStatus)
router.post  ('/run-now',    ...admin, ctrl.runNow)
router.get   ('/logs',       ...admin, ctrl.getLogs)
router.patch ('/config',     ...admin, ctrl.updateConfig)
router.delete('/logs',       ...admin, ctrl.clearLogs)
router.delete('/logs/:id',   ...admin, ctrl.deleteLog)

module.exports = router
