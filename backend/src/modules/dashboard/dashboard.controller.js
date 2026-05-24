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

async function getSummary(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const data = await svc.getSummary(req.user.id, req.user.role, from, to)
    res.json(data)
  } catch (err) { next(err) }
}

async function getCharts(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const data = await svc.getCharts(req.user.id, req.user.role, from, to)
    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { getSummary, getCharts }
