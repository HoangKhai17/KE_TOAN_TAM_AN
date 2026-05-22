const svc = require('./payroll.service')

// --- Periods ---
async function listPeriods(req, res, next) {
  try {
    const { page = '1', limit = '24', year } = req.query
    const result = await svc.listPeriods({
      page:  Math.max(1, parseInt(page, 10)),
      limit: Math.min(60, Math.max(1, parseInt(limit, 10))),
      year:  year ? parseInt(year, 10) : null,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function listDistinctYears(req, res, next) {
  try {
    const years = await svc.listDistinctYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

async function getPeriod(req, res, next) {
  try {
    const period = await svc.getPeriod(req.params.id)
    res.json({ success: true, data: { period } })
  } catch (err) { next(err) }
}

async function createPeriod(req, res, next) {
  try {
    const period = await svc.createPeriod(req.body, req.user.id)
    res.status(201).json({ success: true, data: { period } })
  } catch (err) { next(err) }
}

async function updatePeriod(req, res, next) {
  try {
    const period = await svc.updatePeriod(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: { period } })
  } catch (err) { next(err) }
}

async function confirmPeriod(req, res, next) {
  try {
    const period = await svc.confirmPeriod(
      req.params.id, req.user.id, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: { period } })
  } catch (err) { next(err) }
}

async function markPaid(req, res, next) {
  try {
    const period = await svc.markPaid(
      req.params.id, req.user.id, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: { period } })
  } catch (err) { next(err) }
}

// --- Records ---
async function listRecords(req, res, next) {
  try {
    const records = await svc.listRecords(req.params.id)
    res.json({ success: true, data: { records } })
  } catch (err) { next(err) }
}

async function upsertRecord(req, res, next) {
  try {
    const record = await svc.upsertRecord(req.params.id, req.body, req.user.id)
    res.json({ success: true, data: { record } })
  } catch (err) { next(err) }
}

async function deleteRecord(req, res, next) {
  try {
    await svc.deleteRecord(req.params.id, req.params.recordId, req.user.id)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function exportExcel(req, res, next) {
  try {
    await svc.exportExcel(req.params.id, res)
  } catch (err) { next(err) }
}

async function sendPayrollEmails(req, res, next) {
  try {
    const result = await svc.sendPayrollEmails(req.params.id)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

module.exports = {
  listPeriods, listDistinctYears, getPeriod, createPeriod, updatePeriod, confirmPeriod, markPaid,
  listRecords, upsertRecord, deleteRecord, exportExcel, sendPayrollEmails,
}
