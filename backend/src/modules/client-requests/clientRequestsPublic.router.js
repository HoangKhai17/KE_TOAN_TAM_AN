'use strict'
const { Router } = require('express')
const rateLimit = require('express-rate-limit')
const { validate } = require('../../middleware/validate')
const { submitPublicFormSchema } = require('./clientRequests.schema')
const ctrl = require('./clientRequests.controller')

const router = Router()

const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 10 phút.' } },
})

router.get('/:token',        ctrl.getPublicForm)
router.post('/:token/submit', submitLimiter, validate(submitPublicFormSchema), ctrl.submitPublicForm)

module.exports = router
