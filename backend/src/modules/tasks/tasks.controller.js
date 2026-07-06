const svc         = require('./tasks.service')
const checklistSvc = require('./checklist.service')
const depsSvc      = require('./dependencies.service')
const commentsSvc  = require('./comments.service')
const timeLogsSvc  = require('./timeLogs.service')
const cfSvc        = require('./customFields.service')
const linksSvc     = require('./taskLinks.service')

async function listTasks(req, res, next) {
  try {
    const { page = '1', limit = '20', status, priority, ...rest } = req.query
    const result = await svc.listTasks({
      page:             Math.max(1, parseInt(page, 10)),
      limit:            Math.min(1000, Math.max(1, parseInt(limit, 10))),
      status:           status   ? (Array.isArray(status)   ? status   : [status])   : undefined,
      priority:         priority ? (Array.isArray(priority) ? priority : [priority]) : undefined,
      forceAssignedTo:  req.user.role === 'staff' ? req.user.id : undefined,
      ...rest,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getTask(req, res, next) {
  try {
    const task = await svc.getTaskById(req.params.id, req.user)
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
    const task = await svc.updateTask(req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent'], req.user)
    res.json({ success: true, data: { task } })
  } catch (err) { next(err) }
}

async function deleteTask(req, res, next) {
  try {
    await svc.deleteTask(req.params.id, req.user, req.ip, req.headers['user-agent'])
    res.status(204).end()
  } catch (err) { next(err) }
}

async function changeTaskStatus(req, res, next) {
  try {
    const { status, onHoldReason, force } = req.body
    const task = await svc.changeTaskStatus(
      req.params.id, status, { onHoldReason, force },
      req.user.id, req.ip, req.headers['user-agent'], req.user
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

// --- Checklist ---
async function listChecklist(req, res, next) {
  try {
    const items = await checklistSvc.listChecklist(req.params.id)
    res.json({ success: true, data: { items } })
  } catch (err) { next(err) }
}

async function addChecklistItem(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const item = await checklistSvc.addItem(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { item } })
  } catch (err) { next(err) }
}

async function updateChecklistItem(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const item = await checklistSvc.updateItem(req.params.id, req.params.itemId, req.body, req.user.id)

    // Yêu cầu 3: khi tích đủ checklist → tự chuyển task sang "Hoàn thành"
    // (trạng thái hoàn thành trước/trễ hạn là dẫn xuất từ completed_at vs due_date)
    let autoCompleted = false
    if (req.body.isCompleted === true) {
      const remaining = await checklistSvc.countUncheckedLeaves(req.params.id)
      if (remaining === 0) {
        try {
          await svc.changeTaskStatus(req.params.id, 'completed', {}, req.user.id, req.ip, req.headers['user-agent'], req.user)
          autoCompleted = true
        } catch { /* không tự hoàn thành được (vd còn yêu cầu KH chờ / transition không hợp lệ) → giữ nguyên */ }
      }
    }
    res.json({ success: true, data: { item, autoCompleted } })
  } catch (err) { next(err) }
}

async function deleteChecklistItem(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    await checklistSvc.deleteItem(req.params.id, req.params.itemId)
    res.status(204).end()
  } catch (err) { next(err) }
}

// --- Dependencies ---
async function listDependencies(req, res, next) {
  try {
    const dependencies = await depsSvc.listDependencies(req.params.id)
    res.json({ success: true, data: { dependencies } })
  } catch (err) { next(err) }
}

async function addDependency(req, res, next) {
  try {
    const dependency = await depsSvc.addDependency(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { dependency } })
  } catch (err) { next(err) }
}

async function removeDependency(req, res, next) {
  try {
    await depsSvc.removeDependency(req.params.id, req.params.depId)
    res.status(204).end()
  } catch (err) { next(err) }
}

// --- Comments ---
async function listComments(req, res, next) {
  try {
    const { page = '1', limit = '50' } = req.query
    const comments = await commentsSvc.listComments(req.params.id, {
      page:  Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
    })
    res.json({ success: true, data: { comments } })
  } catch (err) { next(err) }
}

async function addComment(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const comment = await commentsSvc.addComment(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { comment } })
  } catch (err) { next(err) }
}

async function updateComment(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const isAdmin = req.user.role === 'admin'
    const comment = await commentsSvc.updateComment(
      req.params.id, req.params.commentId, req.body, req.user.id, isAdmin
    )
    res.json({ success: true, data: { comment } })
  } catch (err) { next(err) }
}

async function deleteComment(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const isAdmin = req.user.role === 'admin'
    await commentsSvc.deleteComment(req.params.id, req.params.commentId, req.user.id, isAdmin)
    res.status(204).end()
  } catch (err) { next(err) }
}

// --- Time Logs ---
async function listTimeLogs(req, res, next) {
  try {
    const timeLogs = await timeLogsSvc.listTimeLogs(req.params.id)
    res.json({ success: true, data: { timeLogs } })
  } catch (err) { next(err) }
}

async function addTimeLog(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const timeLog = await timeLogsSvc.addTimeLog(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { timeLog } })
  } catch (err) { next(err) }
}

async function deleteTimeLog(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const isAdmin = req.user.role === 'admin'
    await timeLogsSvc.deleteTimeLog(req.params.id, req.params.logId, req.user.id, isAdmin)
    res.status(204).end()
  } catch (err) { next(err) }
}

// --- Custom Fields ---
async function getCustomFields(req, res, next) {
  try {
    const fields = await cfSvc.getCustomFields(req.params.id)
    res.json({ success: true, data: { fields } })
  } catch (err) { next(err) }
}

async function upsertCustomFields(req, res, next) {
  try {
    const fields = await cfSvc.upsertCustomFields(req.params.id, req.body.fields)
    res.json({ success: true, data: { fields } })
  } catch (err) { next(err) }
}

async function getAvailableYears(req, res, next) {
  try {
    const years = await svc.getAvailableYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

// --- Task Links ---
async function listLinks(req, res, next) {
  try {
    const links = await linksSvc.listLinks(req.params.id)
    res.json({ success: true, data: { links } })
  } catch (err) { next(err) }
}

async function addLink(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const link = await linksSvc.addLink(req.params.id, req.body, req.user.id)
    res.status(201).json({ success: true, data: { link } })
  } catch (err) { next(err) }
}

async function deleteLink(req, res, next) {
  try {
    await svc.assertTaskAccess(req.params.id, req.user)
    const isAdmin = req.user.role === 'admin'
    await linksSvc.deleteLink(req.params.id, req.params.linkId, req.user.id, isAdmin)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listTasks, getTask, createTask, updateTask, deleteTask, changeTaskStatus, getActivityLog,
  getAvailableYears,
  listChecklist, addChecklistItem, updateChecklistItem, deleteChecklistItem,
  listDependencies, addDependency, removeDependency,
  listComments, addComment, updateComment, deleteComment,
  listTimeLogs, addTimeLog, deleteTimeLog,
  getCustomFields, upsertCustomFields,
  listLinks, addLink, deleteLink,
}
