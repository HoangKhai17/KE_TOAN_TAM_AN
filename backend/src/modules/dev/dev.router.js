const router = require('express').Router()
const svc    = require('./simulate.service')

// POST /api/dev/simulate/day — simulate one day for one user
router.post('/simulate/day', async (req, res, next) => {
  try {
    const { userId, date, checkInTime, checkOutTime } = req.body
    if (!userId || !date) {
      return res.status(400).json({ success: false, error: { message: 'userId and date are required' } })
    }
    const record = await svc.simulateDay({ userId, date, checkInTime: checkInTime ?? null, checkOutTime: checkOutTime ?? null })
    res.json({ success: true, data: { record } })
  } catch (err) { next(err) }
})

// POST /api/dev/simulate/month — simulate a full month for one user
router.post('/simulate/month', async (req, res, next) => {
  try {
    const { userId, month, year, scenario = 'normal' } = req.body
    if (!userId || !month || !year) {
      return res.status(400).json({ success: false, error: { message: 'userId, month, and year are required' } })
    }
    const result = await svc.simulateMonth({ userId, month, year, scenario })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// POST /api/dev/simulate/team-month — simulate a full month for all active staff
router.post('/simulate/team-month', async (req, res, next) => {
  try {
    const { month, year, scenario = 'normal' } = req.body
    if (!month || !year) {
      return res.status(400).json({ success: false, error: { message: 'month and year are required' } })
    }
    const result = await svc.simulateTeamMonth({ month, year, scenario })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// DELETE /api/dev/simulate/clear — remove simulation data for a month
router.delete('/simulate/clear', async (req, res, next) => {
  try {
    const { userId, month, year } = req.body
    if (!month || !year) {
      return res.status(400).json({ success: false, error: { message: 'month and year are required' } })
    }
    const result = await svc.clearSimulation({ userId: userId ?? null, month, year })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// GET /api/dev/simulate/status — snapshot of simulation data for a month
router.get('/simulate/status', async (req, res, next) => {
  try {
    const { month, year } = req.query
    if (!month || !year) {
      return res.status(400).json({ success: false, error: { message: 'month and year query params are required' } })
    }
    const result = await svc.getSimulationStatus({ month, year })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

module.exports = router
