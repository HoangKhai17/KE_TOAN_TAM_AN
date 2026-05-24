'use strict'
const svc = require('./internalAssignments.service')

async function listAssignments(req, res, next) {
  try {
    const { page = '1', limit = '20', sortBy = 'created_at', sortDir = 'desc', ...filters } = req.query
    const result = await svc.listAssignments(req.user.id, req.user.role, {
      ...filters,
      page:  Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      sortBy, sortDir,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getStats(req, res, next) {
  try {
    const stats = await svc.getStats(req.user.id, req.user.role)
    res.json({ success: true, data: stats })
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

module.exports = {
  listAssignments, getStats, getAssignment,
  createAssignment, updateAssignment, deleteAssignment,
  sendAssignment, cancelAssignment, closeAssignment,
  acceptAssignment, progressAssignment, completeAssignment, rejectAssignment,
  addComment, deleteComment,
}
