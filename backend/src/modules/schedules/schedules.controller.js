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

module.exports = {
  listSchedules, getSchedule, createSchedule,
  updateSchedule, deleteSchedule, toggleSchedule, previewSchedule,
}
