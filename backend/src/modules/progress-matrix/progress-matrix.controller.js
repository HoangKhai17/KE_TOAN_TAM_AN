const svc = require('./progress-matrix.service')

function staffScope(req) {
  return req.user.role === 'staff' ? req.user.id : undefined
}

async function getTaskTypes(req, res, next) {
  try {
    const taskTypes = await svc.listTaskTypes()
    res.json({ success: true, data: { taskTypes } })
  } catch (err) { next(err) }
}

async function getYears(req, res, next) {
  try {
    const years = await svc.listYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

async function getSources(req, res, next) {
  try {
    const sources = await svc.listSources()
    res.json({ success: true, data: { sources } })
  } catch (err) { next(err) }
}

async function getMatrix(req, res, next) {
  try {
    const { taskTypeId, month, year, source } = req.query
    const data = await svc.getMatrix({ taskTypeId, month, year, source, forceAssignedTo: staffScope(req) })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function getByCompany(req, res, next) {
  try {
    const { companyId, month, year, source } = req.query
    const data = await svc.byCompany({ companyId, month, year, source, forceAssignedTo: staffScope(req) })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function getByStaff(req, res, next) {
  try {
    const { staffId, month, year, source } = req.query
    const data = await svc.byStaff({ staffId, month, year, source, forceAssignedTo: staffScope(req) })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function exportReport(req, res, next) {
  try {
    const { view, taskTypeId, companyId, staffId, month, year, source, columns } = req.body ?? {}
    const { buffer, nameBase, period } = await svc.exportReport({
      view, taskTypeId, companyId, staffId, month, year, source, columns,
      forceAssignedTo: staffScope(req),
    })
    const filename = `bc-tien-do-${nameBase}-T${period.month}-${period.year}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(Buffer.from(buffer))
  } catch (err) { next(err) }
}

module.exports = { getTaskTypes, getYears, getSources, getMatrix, getByCompany, getByStaff, exportReport }
