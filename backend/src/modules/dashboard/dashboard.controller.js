const svc = require('./dashboard.service')

function defaultDates(from, to) {
  const today = new Date()
  const defTo  = today.toISOString().slice(0, 10)
  const defFrom = new Date(today)
  defFrom.setDate(defFrom.getDate() - 27)
  return {
    from: from || defFrom.toISOString().slice(0, 10),
    to:   to   || defTo,
  }
}

const VALID_TASK_TYPES = new Set(['traditional', 'cdr', 'ia'])

async function getSummary(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const taskType = VALID_TASK_TYPES.has(req.query.taskType) ? req.query.taskType : 'traditional'
    const data = await svc.getSummary(req.user.id, req.user.role, from, to, taskType)
    res.json(data)
  } catch (err) { next(err) }
}

async function getCharts(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const taskType = VALID_TASK_TYPES.has(req.query.taskType) ? req.query.taskType : 'traditional'
    const data = await svc.getCharts(req.user.id, req.user.role, from, to, taskType)
    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { getSummary, getCharts }
