const svc = require('./companies.service')

async function listCompanies(req, res, next) {
  try {
    const { page = '1', limit = '20', status, businessType, assignedStaffId, search } = req.query
    const result = await svc.listCompanies({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      status, businessType, assignedStaffId, search,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getCompany(req, res, next) {
  try {
    const company = await svc.getCompanyById(req.params.id)
    res.json({ success: true, data: { company } })
  } catch (err) { next(err) }
}

async function createCompany(req, res, next) {
  try {
    const company = await svc.createCompany(req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.status(201).json({ success: true, data: { company } })
  } catch (err) { next(err) }
}

async function updateCompany(req, res, next) {
  try {
    const company = await svc.updateCompany(req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data: { company } })
  } catch (err) { next(err) }
}

async function terminateCompany(req, res, next) {
  try {
    await svc.terminateCompany(req.params.id, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, message: 'Company terminated' })
  } catch (err) { next(err) }
}

async function deleteCompany(req, res, next) {
  try {
    await svc.deleteCompany(req.params.id, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, message: 'Company deleted' })
  } catch (err) { next(err) }
}

async function getAssignments(req, res, next) {
  try {
    const assignments = await svc.getAssignments(req.params.id)
    res.json({ success: true, data: { assignments } })
  } catch (err) { next(err) }
}

async function assignStaff(req, res, next) {
  try {
    const { staffId, startDate, notes } = req.body
    const result = await svc.assignStaff(
      req.params.id, staffId, req.user.id, startDate, notes, req.ip, req.headers['user-agent']
    )
    res.status(201).json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getActivityLog(req, res, next) {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '10', 10)))
    const page  = Math.max(1, parseInt(req.query.page  ?? '1',  10))
    const { activities, total } = await svc.getActivityLog(req.params.id, { page, limit })
    res.json({ success: true, data: { activities, total } })
  } catch (err) { next(err) }
}

module.exports = { listCompanies, getCompany, createCompany, updateCompany, terminateCompany, deleteCompany, getAssignments, assignStaff, getActivityLog }
