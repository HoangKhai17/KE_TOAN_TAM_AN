'use strict'
const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const { validate } = require('../../middleware/validate')
const ctrl = require('./rewardPenalty.controller')
const { ruleSchema, ruleUpdateSchema, entrySchema, entryUpdateSchema, gradeSchema, gradeUpdateSchema } = require('./rewardPenalty.schema')

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

// ── Quy đổi xếp loại (grades) — xem: mọi người đăng nhập; quản lý: admin ──
router.get('/grades',        ...auth,  ctrl.listGrades)
router.post('/grades',       ...admin, validate(gradeSchema), ctrl.createGrade)
router.patch('/grades/:id',  ...admin, validate(gradeUpdateSchema), ctrl.updateGrade)
router.delete('/grades/:id', ...admin, ctrl.deleteGrade)

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
// Giải trình dạng hội thoại (staff trên dòng của mình; admin trên mọi dòng).
router.post('/entries/:id/discuss', ...auth,  ctrl.discussEntry)

module.exports = router
