'use strict'
const { Router }      = require('express')
const { authenticate } = require('../../middleware/auth')
const { requireRole }  = require('../../middleware/rbac')
const { validate }     = require('../../middleware/validate')
const {
  createCategorySchema, updateCategorySchema,
  createLinkSchema, updateLinkSchema,
} = require('./internalDocLinks.schema')
const svc = require('./internalDocLinks.service')

const router    = Router()
const auth      = [authenticate]
const adminOnly = [authenticate, requireRole('admin')]

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', ...auth, async (req, res, next) => {
  try {
    const categories = await svc.listCategories()
    res.json({ success: true, data: { categories } })
  } catch (err) { next(err) }
})

router.post('/categories', ...adminOnly, validate(createCategorySchema), async (req, res, next) => {
  try {
    const category = await svc.createCategory(req.body, req.user.id)
    res.status(201).json({ success: true, data: { category } })
  } catch (err) { next(err) }
})

router.patch('/categories/:id', ...adminOnly, validate(updateCategorySchema), async (req, res, next) => {
  try {
    const category = await svc.updateCategory(req.params.id, req.body)
    res.json({ success: true, data: { category } })
  } catch (err) { next(err) }
})

router.delete('/categories/:id', ...adminOnly, async (req, res, next) => {
  try {
    await svc.deleteCategory(req.params.id)
    res.status(204).end()
  } catch (err) { next(err) }
})

// ─── Links ────────────────────────────────────────────────────────────────────
router.get('/', ...auth, async (req, res, next) => {
  try {
    const { categoryId, search, page = '1', limit = '20' } = req.query
    const result = await svc.listLinks({
      categoryId, search,
      page:  Math.max(1, parseInt(page, 10)  || 1),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

router.post('/', ...auth, validate(createLinkSchema), async (req, res, next) => {
  try {
    const link = await svc.createLink(req.body, req.user.id)
    res.status(201).json({ success: true, data: { link } })
  } catch (err) { next(err) }
})

router.patch('/:id', ...auth, validate(updateLinkSchema), async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const link = await svc.updateLink(req.params.id, req.body, req.user.id, isAdmin)
    res.json({ success: true, data: { link } })
  } catch (err) { next(err) }
})

router.delete('/:id', ...auth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin'
    await svc.deleteLink(req.params.id, req.user.id, isAdmin)
    res.status(204).end()
  } catch (err) { next(err) }
})

module.exports = router
