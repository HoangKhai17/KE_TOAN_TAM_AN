'use strict'
const svc = require('./companyProcesses.service')

async function listProcesses(req, res, next) {
  try {
    const processes = await svc.listProcesses(req.params.companyId)
    res.json({ success: true, data: { processes } })
  } catch (err) { next(err) }
}

async function createProcess(req, res, next) {
  try {
    const process = await svc.createProcess(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { process } })
  } catch (err) { next(err) }
}

async function getProcess(req, res, next) {
  try {
    const process = await svc.getProcess(req.params.companyId, req.params.processId)
    res.json({ success: true, data: { process } })
  } catch (err) { next(err) }
}

async function updateProcess(req, res, next) {
  try {
    const process = await svc.updateProcess(req.params.companyId, req.params.processId, req.body, req.user)
    res.json({ success: true, data: { process } })
  } catch (err) { next(err) }
}

async function deleteProcess(req, res, next) {
  try {
    await svc.deleteProcess(req.params.companyId, req.params.processId, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listProcesses, getProcess, createProcess, updateProcess, deleteProcess,
}
