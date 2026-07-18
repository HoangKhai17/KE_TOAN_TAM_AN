'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { validate } = require('../../middleware/validate')
const {
  createProcessSchema, updateProcessSchema, saveGraphSchema,
} = require('./companyProcesses.schema')
const ctrl = require('./companyProcesses.controller')

// mergeParams: true để lấy được :companyId từ router cha
const router = Router({ mergeParams: true })
const auth = [authenticate]
// Quyền SỬA (admin hoặc nhân sự phụ trách công ty) kiểm tra trong service —
// vì phải tra companies.assigned_staff_id, không làm ở middleware được.

// ── Quy trình ─────────────────────────────────────────────────────────────────
router.get('/',             ...auth, ctrl.listProcesses)
router.post('/',            ...auth, validate(createProcessSchema), ctrl.createProcess)
router.patch('/:processId', ...auth, validate(updateProcessSchema), ctrl.updateProcess)
router.delete('/:processId', ...auth, ctrl.deleteProcess)

// ── Sơ đồ (nút + cạnh) ────────────────────────────────────────────────────────
router.get('/:processId/graph', ...auth, ctrl.getGraph)
router.put('/:processId/graph', ...auth, validate(saveGraphSchema), ctrl.saveGraph)

module.exports = router
