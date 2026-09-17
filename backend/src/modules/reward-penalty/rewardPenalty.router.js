'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const ctrl = require('./rewardPenalty.controller')
const { ruleSchema, ruleUpdateSchema, entrySchema, entryUpdateSchema } = require('./rewardPenalty.schema')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// Mounted at /api/reward-penalty

// ── Quy tắc (chỉ admin) ──
router.get('/rules',        ...admin, ctrl.listRules)
router.post('/rules',       ...admin, validate(ruleSchema), ctrl.createRule)
router.patch('/rules/:id',  ...admin, validate(ruleUpdateSchema), ctrl.updateRule)
router.delete('/rules/:id', ...admin, ctrl.deleteRule)

// Danh sách năm có dữ liệu (mọi người đăng nhập; staff scope trong controller)
router.get('/years', ...auth, ctrl.listYears)

// ── Tổng hợp (chỉ admin) ──
router.get('/summary', ...admin, ctrl.getSummary)

// ── Sổ ghi ──
// Xem: mọi người đăng nhập (staff bị giới hạn về CỦA MÌNH trong controller).
router.get('/entries', ...auth, ctrl.listEntries)
// Ghi/duyệt/sửa/xoá: chỉ admin.
router.post('/entries',             ...admin, validate(entrySchema), ctrl.createEntry)
router.patch('/entries/:id',        ...admin, validate(entryUpdateSchema), ctrl.updateEntry)
router.post('/entries/:id/approve', ...admin, ctrl.approveEntry)
router.delete('/entries/:id',       ...admin, ctrl.deleteEntry)

module.exports = router
