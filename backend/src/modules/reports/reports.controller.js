const svc = require('./reports.service')

function defaultDateRange() {
  const to   = new Date()
  const from = new Date()
  from.setMonth(from.getMonth() - 3)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

async function getStaffPerformance(req, res, next) {
  try {
    const { from, to, staffIds } = req.query
    const range = from && to ? { from, to } : defaultDateRange()
    const ids = staffIds ? (Array.isArray(staffIds) ? staffIds : [staffIds]) : null
    const data = await svc.staffPerformance({ ...range, staffIds: ids })
    res.json(data)
  } catch (err) { next(err) }
}

async function getCompanyStatus(req, res, next) {
  try {
    const { from, to, companyIds } = req.query
    const range = from && to ? { from, to } : defaultDateRange()
    const ids = companyIds ? (Array.isArray(companyIds) ? companyIds : [companyIds]) : null
    const data = await svc.companyStatus({ ...range, companyIds: ids })
    res.json(data)
  } catch (err) { next(err) }
}

async function getSlaCompliance(req, res, next) {
  try {
    const { from, to, groupBy = 'staff' } = req.query
    const range = from && to ? { from, to } : defaultDateRange()
    const data = await svc.slaCompliance({ ...range, groupBy })
    res.json(data)
  } catch (err) { next(err) }
}

async function getAging(req, res, next) {
  try {
    const { assignedTo, companyId } = req.query
    const data = await svc.aging({ assignedTo, companyId })
    res.json(data)
  } catch (err) { next(err) }
}

async function getVelocity(req, res, next) {
  try {
    const { from, to, period = 'week' } = req.query
    const range = from && to ? { from, to } : defaultDateRange()
    const data = await svc.velocity({ ...range, period })
    res.json(data)
  } catch (err) { next(err) }
}

async function getForecast(req, res, next) {
  try {
    const now = new Date()
    const month = req.query.month || now.getMonth() + 2  // next month default
    const year  = req.query.year  || now.getFullYear()
    const data = await svc.forecast({ month, year })
    res.json(data)
  } catch (err) { next(err) }
}

async function getOverview(req, res, next) {
  try {
    const { from, to, prevFrom, prevTo } = req.query
    const range = from && to ? { from, to } : defaultDateRange()
    const data = await svc.overviewReport({ ...range, prevFrom, prevTo })
    res.json(data)
  } catch (err) { next(err) }
}

async function exportReport(req, res, next) {
  try {
    const { type } = req.params
    const validTypes = ['staff', 'company', 'sla', 'aging', 'velocity', 'forecast']
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid report type' })
    }

    let data
    const now = new Date()
    const defaultRange = { from: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) }
    const q = req.query

    if      (type === 'staff')    data = await svc.staffPerformance({ ...defaultRange, ...q })
    else if (type === 'company')  data = await svc.companyStatus({ ...defaultRange, ...q })
    else if (type === 'sla')      data = await svc.slaCompliance({ ...defaultRange, groupBy: q.groupBy || 'staff' })
    else if (type === 'aging')    data = await svc.aging(q)
    else if (type === 'velocity') data = await svc.velocity({ ...defaultRange, period: q.period || 'week' })
    else if (type === 'forecast') data = await svc.forecast({ month: q.month || now.getMonth() + 2, year: q.year || now.getFullYear() })

    const buffer = await svc.exportToExcel(type, data)

    const names = { staff: 'hieu-suat-nhan-su', company: 'tinh-trang-khach-hang', sla: 'tuan-thu-sla', aging: 'ton-dong', velocity: 'hieu-suat', forecast: 'du-bao' }
    const filename = `${names[type]}-${now.toISOString().slice(0, 10)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (err) { next(err) }
}

module.exports = { getOverview, getStaffPerformance, getCompanyStatus, getSlaCompliance, getAging, getVelocity, getForecast, exportReport }
