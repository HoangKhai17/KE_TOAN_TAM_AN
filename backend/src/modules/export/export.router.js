const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./export.controller')

const router = Router()
// Sinh Excel dùng chung (style chuẩn). Chỉ cần đăng nhập.
router.post('/xlsx', authenticate, ctrl.exportXlsx)

module.exports = router
