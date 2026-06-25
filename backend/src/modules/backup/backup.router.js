'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./backup.controller')

const router = Router()
const admin = [authenticate, requireRole('admin')]

router.get('/',              ...admin, ctrl.getOverview)   // config + danh sách backup
router.post('/run',          ...admin, ctrl.runBackup)     // sao lưu thủ công
router.patch('/config',      ...admin, ctrl.updateConfig)  // bật/tắt + giờ + retention
router.get('/:file/download', ...admin, ctrl.download)     // tải 1 bản
router.delete('/:file',      ...admin, ctrl.remove)        // xoá 1 bản

module.exports = router
