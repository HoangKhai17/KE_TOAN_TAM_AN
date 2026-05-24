'use strict'
const svc = require('./clientRequests.service')

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
    const item = await svc.updateClientRequest(req.params.id, req.body)
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function deleteClientRequest(req, res, next) {
  try {
    await svc.deleteClientRequest(req.params.id)
    res.status(204).end()
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

module.exports = {
  listClientRequests,
  getClientRequest,
  createClientRequest,
  updateClientRequest,
  deleteClientRequest,
  receiveClientRequest,
  unreceiveClientRequest,
  dismissClientRequest,
  sendReminder,
  generateLink,
  revokeLink,
  manualSubmit,
  getAdminOverview,
  getPublicForm,
  submitPublicForm,
}
