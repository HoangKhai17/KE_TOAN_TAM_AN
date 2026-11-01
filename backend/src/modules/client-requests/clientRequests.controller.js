'use strict'
const svc = require('./clientRequests.service')
const commentsSvc = require('./cdrComments.service')
const checklistSvc = require('./cdrChecklist.service')

async function listClientRequests(req, res, next) {
  try {
    const { page = '1', limit = '20', status, ...rest } = req.query
    const result = await svc.listClientRequests({
      page:   Math.max(1, parseInt(page, 10)),
      limit:  Math.min(100, Math.max(1, parseInt(limit, 10))),
      status: status ? (Array.isArray(status) ? status : [status]) : undefined,
      ...rest,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// Danh sách giá trị theo cột cho header filter (server-side, có cache)
async function getColumnValues(req, res, next) {
  try {
    const { column, search, status, ...rest } = req.query
    const values = await svc.getCdrColumnValues({
      column, search,
      filters: { status: status ? (Array.isArray(status) ? status : [status]) : undefined, ...rest },
    })
    res.json({ success: true, data: { values } })
  } catch (err) { next(err) }
}

async function getClientRequest(req, res, next) {
  try {
    const item = await svc.getById(req.params.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function createClientRequest(req, res, next) {
  try {
    const item = await svc.createClientRequest(req.body, req.user.id)
    res.status(201).json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function updateClientRequest(req, res, next) {
  try {
    const item = await svc.updateClientRequest(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function deleteClientRequest(req, res, next) {
  try {
    await svc.deleteClientRequest(req.params.id, req.user.id, req.user.role === 'admin')
    res.status(204).end()
  } catch (err) { next(err) }
}

async function getStats(req, res, next) {
  try {
    const stats = await svc.getStats(req.query)
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

async function receiveClientRequest(req, res, next) {
  try {
    const item = await svc.receiveClientRequest(req.params.id, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function unreceiveClientRequest(req, res, next) {
  try {
    const item = await svc.unreceiveClientRequest(req.params.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function dismissClientRequest(req, res, next) {
  try {
    const item = await svc.dismissClientRequest(req.params.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function setPriority(req, res, next) {
  try {
    const item = await svc.setPriority(req.params.id, req.body?.priority)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function sendReminder(req, res, next) {
  try {
    const item = await svc.sendReminder(req.params.id, req.body)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function generateLink(req, res, next) {
  try {
    const result = await svc.generateLink(req.params.id, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function revokeLink(req, res, next) {
  try {
    await svc.revokeLink(req.params.id)
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function getAdminOverview(req, res, next) {
  try {
    const result = await svc.getAdminOverview(req.query)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getPublicForm(req, res, next) {
  try {
    const form = await svc.getPublicForm(req.params.token)
    res.json({ success: true, data: { form } })
  } catch (err) { next(err) }
}

async function submitPublicForm(req, res, next) {
  try {
    const result = await svc.submitPublicForm(req.params.token, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function manualSubmit(req, res, next) {
  try {
    const item = await svc.manualSubmit(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

// ── Bình luận ──────────────────────────────────────────────────────────────────
async function listComments(req, res, next) {
  try {
    const comments = await commentsSvc.listComments(req.params.id, {
      page:  Math.max(1, parseInt(req.query.page || '1', 10)),
      limit: Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10))),
    })
    res.json({ success: true, data: { comments } })
  } catch (err) { next(err) }
}

async function addComment(req, res, next) {
  try {
    const comment = await commentsSvc.addComment(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { comment } })
  } catch (err) { next(err) }
}

async function updateComment(req, res, next) {
  try {
    const comment = await commentsSvc.updateComment(req.params.id, req.params.commentId, req.body, req.user.id, req.user.role === 'admin')
    res.json({ success: true, data: { comment } })
  } catch (err) { next(err) }
}

async function deleteComment(req, res, next) {
  try {
    await commentsSvc.deleteComment(req.params.id, req.params.commentId, req.user.id, req.user.role === 'admin')
    res.status(204).end()
  } catch (err) { next(err) }
}

// ── Checklist ───────────────────────────────────────────────────────────────────
async function listChecklist(req, res, next) {
  try {
    const items = await checklistSvc.listItems(req.params.id)
    res.json({ success: true, data: { items } })
  } catch (err) { next(err) }
}

async function addChecklistItem(req, res, next) {
  try {
    const item = await checklistSvc.addItem(req.params.id, req.body)
    res.status(201).json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function updateChecklistItem(req, res, next) {
  try {
    const item = await checklistSvc.updateItem(req.params.id, req.params.itemId, req.body, req.user.id)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function deleteChecklistItem(req, res, next) {
  try {
    await checklistSvc.deleteItem(req.params.id, req.params.itemId)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function reorderChecklist(req, res, next) {
  try {
    const items = await checklistSvc.reorder(req.params.id, req.body.items)
    res.json({ success: true, data: { items } })
  } catch (err) { next(err) }
}

async function getAvailableYears(req, res, next) {
  try {
    const years = await svc.getAvailableYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

module.exports = {
  listClientRequests,
  getColumnValues,
  getClientRequest,
  createClientRequest,
  updateClientRequest,
  deleteClientRequest,
  receiveClientRequest,
  unreceiveClientRequest,
  dismissClientRequest,
  setPriority,
  sendReminder,
  generateLink,
  revokeLink,
  manualSubmit,
  listComments,
  addComment,
  updateComment,
  deleteComment,
  listChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklist,
  getAdminOverview,
  getStats,
  getPublicForm,
  submitPublicForm,
  getAvailableYears,
}
