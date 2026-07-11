const svc = require('./company-tables.service')

// ── Defs (admin) ──────────────────────────────────────────────────────────────
async function listDefs(req, res, next) {
  try {
    const activeOnly = req.query.activeOnly === 'true' || req.user.role !== 'admin'
    res.json({ success: true, data: { defs: await svc.listDefs({ activeOnly }) } })
  } catch (e) { next(e) }
}
async function getDef(req, res, next) {
  try { res.json({ success: true, data: { def: await svc.getDef(req.params.id) } }) }
  catch (e) { next(e) }
}
async function createDef(req, res, next) {
  try { res.status(201).json({ success: true, data: { def: await svc.createDef(req.body, req.user.id) } }) }
  catch (e) { next(e) }
}
async function updateDef(req, res, next) {
  try { res.json({ success: true, data: { def: await svc.updateDef(req.params.id, req.body) } }) }
  catch (e) { next(e) }
}
async function deleteDef(req, res, next) {
  try { await svc.deleteDef(req.params.id); res.status(204).end() }
  catch (e) { next(e) }
}

// ── Columns (admin) ───────────────────────────────────────────────────────────
async function addColumn(req, res, next) {
  try { res.status(201).json({ success: true, data: { column: await svc.addColumn(req.params.id, req.body) } }) }
  catch (e) { next(e) }
}
async function updateColumn(req, res, next) {
  try { res.json({ success: true, data: { column: await svc.updateColumn(req.params.colId, req.body) } }) }
  catch (e) { next(e) }
}
async function deleteColumn(req, res, next) {
  try { await svc.deleteColumn(req.params.colId); res.status(204).end() }
  catch (e) { next(e) }
}
async function reorderDefs(req, res, next) {
  try { res.json({ success: true, data: { defs: await svc.reorderDefs(req.body.orderedIds || []) } }) }
  catch (e) { next(e) }
}

async function reorderColumns(req, res, next) {
  try { res.json({ success: true, data: { def: await svc.reorderColumns(req.params.id, req.body.orderedIds || []) } }) }
  catch (e) { next(e) }
}

// ── Rows (per-company, ownership) ─────────────────────────────────────────────
async function listRows(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.json({ success: true, data: { rows: await svc.listRows(defId, companyId, req.user) } })
  } catch (e) { next(e) }
}
async function createRow(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.status(201).json({ success: true, data: { row: await svc.createRow(defId, companyId, req.user, req.body.data || {}) } })
  } catch (e) { next(e) }
}
async function updateRow(req, res, next) {
  try {
    const { companyId, defId, rowId } = req.params
    res.json({ success: true, data: { row: await svc.updateRow(defId, companyId, rowId, req.user, req.body.data || {}) } })
  } catch (e) { next(e) }
}
async function deleteRow(req, res, next) {
  try {
    const { companyId, defId, rowId } = req.params
    await svc.deleteRow(defId, companyId, rowId, req.user); res.status(204).end()
  } catch (e) { next(e) }
}
async function reorderRows(req, res, next) {
  try {
    const { companyId, defId } = req.params
    await svc.reorderRows(defId, companyId, req.user, req.body.orderedIds || []); res.status(204).end()
  } catch (e) { next(e) }
}
async function batchRows(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.json({ success: true, data: await svc.batchCreateRows(defId, companyId, req.user, req.body.rows || []) })
  } catch (e) { next(e) }
}
async function upsertRows(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.json({ success: true, data: await svc.upsertRows(defId, companyId, req.user, req.body.matchKey || null, req.body.rows || []) })
  } catch (e) { next(e) }
}

// ── Per-company columns (ownership) ───────────────────────────────────────────
async function listCompanyColumns(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.json({ success: true, data: { columns: await svc.listCompanyColumns(defId, companyId) } })
  } catch (e) { next(e) }
}
async function addCompanyColumn(req, res, next) {
  try {
    const { companyId, defId } = req.params
    res.status(201).json({ success: true, data: { column: await svc.addCompanyColumn(defId, companyId, req.user, req.body) } })
  } catch (e) { next(e) }
}
async function deleteCompanyColumn(req, res, next) {
  try {
    const { companyId, defId, colId } = req.params
    await svc.deleteCompanyColumn(defId, companyId, colId, req.user); res.status(204).end()
  } catch (e) { next(e) }
}

module.exports = {
  listDefs, getDef, createDef, updateDef, deleteDef, reorderDefs,
  addColumn, updateColumn, deleteColumn, reorderColumns,
  listRows, createRow, updateRow, deleteRow, reorderRows, batchRows, upsertRows,
  listCompanyColumns, addCompanyColumn, deleteCompanyColumn,
}
