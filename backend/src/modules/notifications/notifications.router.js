'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./notifications.controller')

const router = Router()
const auth = [authenticate]

router.get('/',             ...auth, ctrl.list)
router.get('/unread-count', ...auth, ctrl.unreadCount)
router.patch('/:id/read',   ...auth, ctrl.markOne)
router.post('/read-all',    ...auth, ctrl.markAll)

module.exports = router
