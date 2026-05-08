const svc = require('./tasks.service')

async function listTasks(req, res, next) {
  try {
    const { page = '1', limit = '20', status, priority, ...rest } = req.query
    const result = await svc.listTasks({
      page:     Math.max(1, parseInt(page, 10)),
      limit:    Math.min(100, Math.max(1, parseInt(limit, 10))),
      status:   status   ? (Array.isArray(status)   ? status   : [status])   : undefined,
      priority: priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
      ...rest,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getTask(req, res, next) {
  try {
    const task = await svc.getTaskById(req.params.id)
    res.json({ success: true, data: { task } })
  } catch (err) { next(err) }
}

async function createTask(req, res, next) {
  try {
    const task = await svc.createTask(req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.status(201).json({ success: true, data: { task } })
  } catch (err) { next(err) }
}

async function updateTask(req, res, next) {
  try {
    const task = await svc.updateTask(req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { task } })
  } catch (err) { next(err) }
}

async function deleteTask(req, res, next) {
  try {
    await svc.deleteTask(req.params.id, req.user.id, req.ip, req.headers['user-agent'])
    res.status(204).end()
  } catch (err) { next(err) }
}

async function changeTaskStatus(req, res, next) {
  try {
    const { status, onHoldReason, force } = req.body
    const task = await svc.changeTaskStatus(
      req.params.id, status, { onHoldReason, force },
      req.user.id, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: { task } })
  } catch (err) { next(err) }
}

async function getActivityLog(req, res, next) {
  try {
    const { page = '1', limit = '50' } = req.query
    const logs = await svc.getActivityLog(req.params.id, {
      page:  Math.max(1, parseInt(page, 10)),
      limit: Math.min(200, Math.max(1, parseInt(limit, 10))),
    })
    res.json({ success: true, data: { logs } })
  } catch (err) { next(err) }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, changeTaskStatus, getActivityLog }
