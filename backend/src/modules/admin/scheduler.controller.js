const scheduler = require('../../jobs')

async function getStatus(req, res, next) {
  try {
    const status = scheduler.getStatus()
    res.json({ success: true, data: { scheduler: status } })
  } catch (err) { next(err) }
}

async function runNow(req, res, next) {
  try {
    const result = await scheduler.triggerNow()
    res.json({ success: true, data: { result } })
  } catch (err) { next(err) }
}

module.exports = { getStatus, runNow }
