const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole } = require('../../middleware/rbac')
const ctrl = require('./attendance.controller')

const router = Router()
const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]

// Attendance records
router.get('/records',         ...auth,  ctrl.listAttendance)
router.post('/records',        ...admin, ctrl.upsertAttendance)
router.delete('/records/:id',  ...admin, ctrl.deleteAttendance)

// Leave requests
router.get('/leave',                   ...auth, ctrl.listLeave)
router.post('/leave',                  ...auth, ctrl.createLeave)
router.patch('/leave/:id/review',      ...admin, ctrl.reviewLeave)
router.patch('/leave/:id/cancel',      ...auth,  ctrl.cancelLeave)

// Monthly summary (admin only)
router.get('/summary', ...admin, ctrl.getSummary)

module.exports = router
