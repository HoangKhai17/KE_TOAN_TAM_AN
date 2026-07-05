const svc = require('./companies.service')
const exportSvc = require('./company-export.service')

async function listCompanies(req, res, next) {
  try {
    const { page = '1', limit = '20', status, businessType, assignedStaffId, search } = req.query
    const parseMulti = (v) => v ? (Array.isArray(v) ? v.filter(Boolean) : v.split(',').filter(Boolean)) : []
    const result = await svc.listCompanies({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(1000, Math.max(1, parseInt(limit, 10))),
      status: parseMulti(status),
      businessType: parseMulti(businessType),
      assignedStaffId: parseMulti(assignedStaffId),
      search,
      forceStaffId: req.user.role === 'staff' ? req.user.id : undefined,
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function getCompany(req, res, next) {
  try {
    const company = await svc.getCompanyById(req.params.id, req.user)
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
    const company = await svc.updateCompany(req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent'], req.user)
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
    const assignments = await svc.getAssignments(req.params.id, req.user)
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
    const { activities, total } = await svc.getActivityLog(req.params.id, { page, limit }, req.user)
    res.json({ success: true, data: { activities, total } })
  } catch (err) { next(err) }
}

async function listNotes(req, res, next) {
  try {
    const notes = await svc.listNotes(req.params.id, req.user)
    res.json({ success: true, data: { notes } })
  } catch (err) { next(err) }
}

async function createNote(req, res, next) {
  try {
    const { content, isPinned } = req.body
    if (!content?.trim()) return res.status(400).json({ success: false, error: { message: 'Nội dung không được trống' } })
    const note = await svc.createNote(req.params.id, { content, isPinned }, req.user)
    res.status(201).json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function updateNote(req, res, next) {
  try {
    const note = await svc.updateNote(req.params.id, req.params.noteId, req.body, req.user)
    res.json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function deleteNote(req, res, next) {
  try {
    await svc.deleteNote(req.params.id, req.params.noteId, req.user)
    res.json({ success: true })
  } catch (err) { next(err) }
}

async function exportCompanies(req, res, next) {
  try {
    const {
      companyIds, sections = [], defIds = [],
      includeCredentials = false, layout = 'aggregate',
    } = req.body ?? {}

    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'Chưa chọn công ty để xuất' } })
    }
    if (companyIds.length > 500) {
      return res.status(400).json({ success: false, error: { message: 'Tối đa 500 công ty mỗi lần xuất' } })
    }
    if (!Array.isArray(sections) || (sections.length === 0 && defIds.length === 0)) {
      return res.status(400).json({ success: false, error: { message: 'Chưa chọn nội dung để xuất' } })
    }

    const { buffer, filename, contentType } = await exportSvc.exportCompanies({
      companyIds,
      sections,
      defIds: Array.isArray(defIds) ? defIds : [],
      includeCredentials: Boolean(includeCredentials),
      layout: layout === 'per_company' ? 'per_company' : 'aggregate',
      user: req.user,
    })

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) { next(err) }
}

module.exports = { listCompanies, getCompany, createCompany, updateCompany, terminateCompany, deleteCompany, getAssignments, assignStaff, getActivityLog, listNotes, createNote, updateNote, deleteNote, exportCompanies }
