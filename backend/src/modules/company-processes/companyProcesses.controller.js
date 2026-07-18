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

async function getGraph(req, res, next) {
  try {
    const graph = await svc.getGraph(req.params.companyId, req.params.processId)
    res.json({ success: true, data: graph })
  } catch (err) { next(err) }
}

async function saveGraph(req, res, next) {
  try {
    const graph = await svc.saveGraph(req.params.companyId, req.params.processId, req.body, req.user)
    res.json({ success: true, data: graph })
  } catch (err) { next(err) }
}

module.exports = {
  listProcesses, createProcess, updateProcess, deleteProcess, getGraph, saveGraph,
}
