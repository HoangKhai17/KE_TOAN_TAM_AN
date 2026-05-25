'use strict'
const svc         = require('./internalAssignments.service')
const checklistSvc = require('./iaChecklist.service')
const linksSvc    = require('./iaLinks.service')

async function listAssignments(req, res, next) {
  try {
    const { page = '1', limit = '20', sortBy = 'created_at', sortDir = 'desc', ...filters } = req.query
    const result = await svc.listAssignments(req.user.id, req.user.role, {
      ...filters,
      page:  Math.max(1, parseInt(page, 10)),
      limit: Math.min(500, Math.max(1, parseInt(limit, 10))),
      sortBy, sortDir,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getStats(req, res, next) {
  try {
    const { deadlineFrom, deadlineTo } = req.query
    const stats = await svc.getStats(req.user.id, req.user.role, { deadlineFrom, deadlineTo })
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

async function getYears(req, res, next) {
  try {
    const years = await svc.getYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

async function getAssignment(req, res, next) {
  try {
    const item = await svc.getById(req.params.id, req.user.id, req.user.role)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function createAssignment(req, res, next) {
  try {
    const item = await svc.createAssignment(req.body, req.user.id)
    res.status(201).json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function updateAssignment(req, res, next) {
  try {
    const item = await svc.updateAssignment(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function deleteAssignment(req, res, next) {
  try {
    await svc.deleteAssignment(req.params.id, req.user.id)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function sendAssignment(req, res, next) {
  try {
    const item = await svc.sendAssignment(req.params.id, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function cancelAssignment(req, res, next) {
  try {
    await svc.cancelAssignment(req.params.id, req.user.id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function closeAssignment(req, res, next) {
  try {
    await svc.closeAssignment(req.params.id, req.user.id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function acceptAssignment(req, res, next) {
  try {
    const item = await svc.acceptAssignment(req.params.id, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function progressAssignment(req, res, next) {
  try {
    const item = await svc.progressAssignment(req.params.id, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function completeAssignment(req, res, next) {
  try {
    const item = await svc.completeAssignment(req.params.id, req.user.id, req.body.note)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function rejectAssignment(req, res, next) {
  try {
    const item = await svc.rejectAssignment(req.params.id, req.user.id, req.body.note)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function addComment(req, res, next) {
  try {
    const comment = await svc.addComment(req.params.id, req.user.id, req.user.role, req.body.content)
    res.status(201).json({ success: true, data: { comment } })
  } catch (err) { next(err) }
}

async function deleteComment(req, res, next) {
  try {
    await svc.deleteComment(req.params.id, req.params.cid, req.user.id, req.user.role)
    res.status(204).end()
  } catch (err) { next(err) }
}

// ── Checklist ─────────────────────────────────────────────────────────────────

async function listChecklist(req, res, next) {
  try {
    const items = await checklistSvc.listItems(req.params.id)
    res.json({ success: true, data: { items } })
  } catch (err) { next(err) }
}

async function addChecklistItem(req, res, next) {
  try {
    const item = await checklistSvc.addItem(req.params.id, req.body.text, req.user.id)
    res.status(201).json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function updateChecklistItem(req, res, next) {
  try {
    const item = await checklistSvc.updateItem(req.params.id, req.params.itemId, req.body)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function deleteChecklistItem(req, res, next) {
  try {
    await checklistSvc.deleteItem(req.params.id, req.params.itemId)
    res.status(204).end()
  } catch (err) { next(err) }
}

// ── Links ─────────────────────────────────────────────────────────────────────

async function listLinks(req, res, next) {
  try {
    const links = await linksSvc.listLinks(req.params.id)
    res.json({ success: true, data: { links } })
  } catch (err) { next(err) }
}

async function addLink(req, res, next) {
  try {
    const link = await linksSvc.addLink(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { link } })
  } catch (err) { next(err) }
}

async function deleteLink(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin'
    await linksSvc.deleteLink(req.params.id, req.params.linkId, req.user.id, isAdmin)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listAssignments, getStats, getYears, getAssignment,
  createAssignment, updateAssignment, deleteAssignment,
  sendAssignment, cancelAssignment, closeAssignment,
  acceptAssignment, progressAssignment, completeAssignment, rejectAssignment,
  addComment, deleteComment,
  listChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem,
  listLinks, addLink, deleteLink,
}
