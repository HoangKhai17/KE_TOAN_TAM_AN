const { Router } = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole }  = require('../../middleware/rbac')
const ctrl = require('./company-tables.controller')

const auth  = [authenticate]
const admin = [authenticate, requireRole('admin')]
const router = Router()

// Defs (read = any auth; write = admin)
router.get('/defs',      ...auth,  ctrl.listDefs)
router.get('/defs/:id',  ...auth,  ctrl.getDef)
router.post('/defs',     ...admin, ctrl.createDef)
router.patch('/defs/:id', ...admin, ctrl.updateDef)
router.delete('/defs/:id', ...admin, ctrl.deleteDef)

// Columns (admin)
router.patch('/defs/:id/columns/reorder', ...admin, ctrl.reorderColumns)
router.post('/defs/:id/columns',          ...admin, ctrl.addColumn)
router.patch('/columns/:colId',           ...admin, ctrl.updateColumn)
router.delete('/columns/:colId',          ...admin, ctrl.deleteColumn)

module.exports = router
