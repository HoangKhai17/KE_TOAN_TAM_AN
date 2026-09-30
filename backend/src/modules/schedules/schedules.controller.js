const svc = require('./schedules.service')

async function listSchedules(req, res, next) {
  try {
    const companyId = req.params.companyId || req.params.id
    const schedules = await svc.listSchedules(companyId)
    res.json({ success: true, data: { schedules } })
  } catch (err) { next(err) }
}

async function getSchedule(req, res, next) {
  try {
    const schedule = await svc.getScheduleById(req.params.id)
    res.json({ success: true, data: { schedule } })
  } catch (err) { next(err) }
}

async function createSchedule(req, res, next) {
  try {
    const companyId = req.params.companyId || req.params.id
    const schedule = await svc.createSchedule(companyId, req.body, req.user, req.ip, req.headers['user-agent'])
    res.status(201).json({ success: true, data: { schedule } })
  } catch (err) { next(err) }
}

async function updateSchedule(req, res, next) {
  try {
    const schedule = await svc.updateSchedule(req.params.id, req.body, req.user, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { schedule } })
  } catch (err) { next(err) }
}

async function deleteSchedule(req, res, next) {
  try {
    await svc.deleteSchedule(req.params.id, req.user, req.ip, req.headers['user-agent'])
    res.status(204).end()
  } catch (err) { next(err) }
}

async function toggleSchedule(req, res, next) {
  try {
    const schedule = await svc.toggleSchedule(req.params.id, req.user, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { schedule } })
  } catch (err) { next(err) }
}

async function previewSchedule(req, res, next) {
  try {
    const dates = await svc.previewSchedule(req.params.id, 10)
    res.json({ success: true, data: { dates } })
  } catch (err) { next(err) }
}

// Console tập trung (admin)
async function getRecurringOverview(req, res, next) {
  try {
    const overview = await svc.getRecurringOverview()
    res.json({ success: true, data: { overview } })
  } catch (err) { next(err) }
}

async function setScheduleMaxDueDay(req, res, next) {
  try {
    const result = await svc.setScheduleMaxDueDay(req.params.scheduleId, req.body.maxDueDay)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// Sinh bù kỳ — bảng đối chiếu kỳ đáng-lẽ-có vs đã-có
async function getSchedulePeriods(req, res, next) {
  try {
    const result = await svc.getSchedulePeriods(req.params.scheduleId, { months: req.query.months })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// Sinh bù kỳ — tạo task cho các kỳ được chọn
async function backfillPeriods(req, res, next) {
  try {
    const { periods, force } = req.body
    const result = await svc.backfillPeriods(
      req.params.scheduleId, { periods, force }, req.user, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// ── Checklist RIÊNG của lịch (KPI v2) ─────────────────────────────────────────
async function listScheduleChecklist(req, res, next) {
  try { res.json({ success: true, data: { checklist: await svc.listScheduleChecklist(req.params.id) } }) }
  catch (err) { next(err) }
}
async function addScheduleChecklistItem(req, res, next) {
  try { res.status(201).json({ success: true, data: { item: await svc.addScheduleChecklistItem(req.params.id, req.body, req.user) } }) }
  catch (err) { next(err) }
}
async function updateScheduleChecklistItem(req, res, next) {
  try { res.json({ success: true, data: { item: await svc.updateScheduleChecklistItem(req.params.id, req.params.itemId, req.body, req.user) } }) }
  catch (err) { next(err) }
}
async function deleteScheduleChecklistItem(req, res, next) {
  try { await svc.deleteScheduleChecklistItem(req.params.id, req.params.itemId, req.user); res.status(204).end() }
  catch (err) { next(err) }
}
async function reorderScheduleChecklist(req, res, next) {
  try { res.json({ success: true, data: { checklist: await svc.reorderScheduleChecklist(req.params.id, req.body.items, req.user) } }) }
  catch (err) { next(err) }
}
async function resetScheduleChecklist(req, res, next) {
  try { res.json({ success: true, data: { checklist: await svc.resetScheduleChecklistFromTemplate(req.params.id, req.user) } }) }
  catch (err) { next(err) }
}
async function replaceScheduleChecklist(req, res, next) {
  try { res.json({ success: true, data: { checklist: await svc.replaceScheduleChecklist(req.params.id, req.body.items, req.user) } }) }
  catch (err) { next(err) }
}
// ── Việc con của lịch (KPI v2) ──
async function listScheduleSubtasks(req, res, next) {
  try { res.json({ success: true, data: { subtasks: await svc.listScheduleSubtasks(req.params.id) } }) }
  catch (err) { next(err) }
}
async function replaceScheduleSubtasks(req, res, next) {
  try { res.json({ success: true, data: { subtasks: await svc.replaceScheduleSubtasks(req.params.id, req.body.subtasks, req.user) } }) }
  catch (err) { next(err) }
}
async function resetScheduleSubtasks(req, res, next) {
  try { res.json({ success: true, data: { subtasks: await svc.resetScheduleSubtasksFromTemplate(req.params.id, req.user) } }) }
  catch (err) { next(err) }
}

module.exports = {
  listSchedules, getSchedule, createSchedule,
  updateSchedule, deleteSchedule, toggleSchedule, previewSchedule,
  getRecurringOverview, setScheduleMaxDueDay,
  getSchedulePeriods, backfillPeriods,
  listScheduleChecklist, addScheduleChecklistItem, updateScheduleChecklistItem,
  deleteScheduleChecklistItem, reorderScheduleChecklist, resetScheduleChecklist,
  replaceScheduleChecklist,
  listScheduleSubtasks, replaceScheduleSubtasks, resetScheduleSubtasks,
}
