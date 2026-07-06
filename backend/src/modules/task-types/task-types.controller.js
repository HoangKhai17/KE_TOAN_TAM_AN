const svc = require('./task-types.service')

async function listTaskTypes(req, res, next) {
  try {
    const { groupName, isActive } = req.query
    const result = await svc.listTaskTypes({ groupName, isActive })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getTaskType(req, res, next) {
  try {
    const taskType = await svc.getTaskTypeById(req.params.id)
    res.json({ success: true, data: { taskType } })
  } catch (err) { next(err) }
}

async function createTaskType(req, res, next) {
  try {
    const taskType = await svc.createTaskType(req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.status(201).json({ success: true, data: { taskType } })
  } catch (err) { next(err) }
}

async function updateTaskType(req, res, next) {
  try {
    const taskType = await svc.updateTaskType(req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { taskType } })
  } catch (err) { next(err) }
}

async function toggleTaskType(req, res, next) {
  try {
    const taskType = await svc.toggleTaskType(req.params.id, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { taskType } })
  } catch (err) { next(err) }
}

async function deleteTaskType(req, res, next) {
  try {
    await svc.deleteTaskType(req.params.id, req.user.id, req.ip, req.headers['user-agent'])
    res.status(204).end()
  } catch (err) { next(err) }
}

// Checklist
async function getChecklist(req, res, next) {
  try {
    const steps = await svc.getChecklist(req.params.id)
    res.json({ success: true, data: { steps } })
  } catch (err) { next(err) }
}

async function addChecklistStep(req, res, next) {
  try {
    const step = await svc.addChecklistStep(req.params.id, req.body.stepText, req.body.level ?? 0)
    res.status(201).json({ success: true, data: { step } })
  } catch (err) { next(err) }
}

async function updateChecklistStep(req, res, next) {
  try {
    const step = await svc.updateChecklistStep(req.params.id, req.params.stepId, req.body)
    res.json({ success: true, data: { step } })
  } catch (err) { next(err) }
}

async function deleteChecklistStep(req, res, next) {
  try {
    await svc.deleteChecklistStep(req.params.id, req.params.stepId)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function reorderChecklist(req, res, next) {
  try {
    const steps = await svc.reorderChecklist(req.params.id, req.body.steps)
    res.json({ success: true, data: { steps } })
  } catch (err) { next(err) }
}

// Custom Fields
async function getCustomFields(req, res, next) {
  try {
    const fields = await svc.getCustomFields(req.params.id)
    res.json({ success: true, data: { fields } })
  } catch (err) { next(err) }
}

async function addCustomField(req, res, next) {
  try {
    const field = await svc.addCustomField(req.params.id, req.body)
    res.status(201).json({ success: true, data: { field } })
  } catch (err) { next(err) }
}

async function updateCustomField(req, res, next) {
  try {
    const field = await svc.updateCustomField(req.params.id, req.params.fieldId, req.body)
    res.json({ success: true, data: { field } })
  } catch (err) { next(err) }
}

async function deleteCustomField(req, res, next) {
  try {
    await svc.deleteCustomField(req.params.id, req.params.fieldId)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listTaskTypes, getTaskType, createTaskType, updateTaskType, toggleTaskType, deleteTaskType,
  getChecklist, addChecklistStep, updateChecklistStep, deleteChecklistStep, reorderChecklist,
  getCustomFields, addCustomField, updateCustomField, deleteCustomField,
}
