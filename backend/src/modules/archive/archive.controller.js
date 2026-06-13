const svc = require('./archive.service')

// ── Years ─────────────────────────────────────────────────────────────────────

async function listYears(req, res, next) {
  try {
    const years = await svc.listYears(req.params.companyId, req.user)
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

async function createYear(req, res, next) {
  try {
    const year = await svc.createYear(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { year } })
  } catch (err) { next(err) }
}

async function updateYear(req, res, next) {
  try {
    const year = await svc.updateYear(
      req.params.companyId, req.params.yearId, req.body, req.user
    )
    res.json({ success: true, data: { year } })
  } catch (err) { next(err) }
}

async function deleteYear(req, res, next) {
  try {
    await svc.deleteYear(req.params.companyId, req.params.yearId, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

// ── Docs ──────────────────────────────────────────────────────────────────────

async function listDocs(req, res, next) {
  try {
    const page     = Math.max(1, parseInt(req.query.page,     10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20))
    const result = await svc.listDocs(
      req.params.companyId, req.params.yearId, req.user, { page, pageSize }
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function createDoc(req, res, next) {
  try {
    const doc = await svc.createDoc(
      req.params.companyId, req.params.yearId, req.body, req.user
    )
    res.status(201).json({ success: true, data: { doc } })
  } catch (err) { next(err) }
}

async function updateDoc(req, res, next) {
  try {
    const doc = await svc.updateDoc(
      req.params.companyId, req.params.yearId, req.params.docId, req.body, req.user
    )
    res.json({ success: true, data: { doc } })
  } catch (err) { next(err) }
}

async function deleteDoc(req, res, next) {
  try {
    await svc.deleteDoc(
      req.params.companyId, req.params.yearId, req.params.docId, req.user
    )
    res.status(204).end()
  } catch (err) { next(err) }
}

async function reorderDocs(req, res, next) {
  try {
    await svc.reorderDocs(
      req.params.companyId, req.params.yearId, req.body, req.user
    )
    res.status(204).end()
  } catch (err) { next(err) }
}

// ── Export ────────────────────────────────────────────────────────────────────

async function exportExcel(req, res, next) {
  try {
    const { wb, companyName, yearValue } = await svc.exportDocs(
      req.params.companyId,
      req.params.yearId,
      req.user,
      req.query.fields ?? ''
    )
    const safeName = (companyName || req.params.companyId).replace(/[^\w\-]/g, '_')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="hs_luu_tru_${yearValue}_${safeName}.xlsx"`)
    await wb.xlsx.write(res)
    res.end()
  } catch (err) { next(err) }
}

// ── Columns ───────────────────────────────────────────────────────────────────

async function listColumns(req, res, next) {
  try {
    const columns = await svc.listColumns(req.params.companyId, req.user)
    res.json({ success: true, data: { columns } })
  } catch (err) { next(err) }
}

async function createColumn(req, res, next) {
  try {
    const column = await svc.createColumn(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { column } })
  } catch (err) { next(err) }
}

async function deleteColumn(req, res, next) {
  try {
    await svc.deleteColumn(req.params.companyId, req.params.colId, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listYears, createYear, updateYear, deleteYear,
  listDocs, createDoc, updateDoc, deleteDoc, reorderDocs,
  listColumns, createColumn, deleteColumn,
  exportExcel,
}
