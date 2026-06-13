const svc = require('./labor-contracts.service')

// ── Contracts ─────────────────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const contracts = await svc.listContracts(req.params.companyId, req.user)
    res.json({ success: true, data: { contracts } })
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const contract = await svc.createContract(req.params.companyId, req.body, req.user.id, req.user)
    res.status(201).json({ success: true, data: { contract } })
  } catch (err) { next(err) }
}

async function update(req, res, next) {
  try {
    const contract = await svc.updateContract(
      req.params.companyId, req.params.id, req.body, req.user.id, req.user
    )
    res.json({ success: true, data: { contract } })
  } catch (err) { next(err) }
}

async function remove(req, res, next) {
  try {
    await svc.deleteContract(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function exportExcel(req, res, next) {
  try {
    const wb = await svc.exportContracts(req.params.companyId, req.user, req.query.fields ?? '')
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="hdld_${Date.now()}.xlsx"`)
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
    await svc.deleteColumn(req.params.companyId, req.params.columnId, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

async function batchImport(req, res, next) {
  try {
    const result = await svc.batchCreate(req.params.companyId, req.user, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove, exportExcel, batchImport, listColumns, createColumn, deleteColumn }
