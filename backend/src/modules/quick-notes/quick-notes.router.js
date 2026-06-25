'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const ctrl = require('./quick-notes.controller')

const router = Router()
const auth = [authenticate]

router.get('/',       ...auth, ctrl.list)
router.post('/',      ...auth, ctrl.create)
router.patch('/:id',  ...auth, ctrl.update)
router.delete('/:id', ...auth, ctrl.remove)

module.exports = router
