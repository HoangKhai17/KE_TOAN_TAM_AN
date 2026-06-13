const svc = require('./nsnn.service')

async function listDebts(req, res, next) {
  try {
    const debts = await svc.listDebts(req.params.companyId, req.user)
    res.json({ data: { debts } })
  } catch (err) { next(err) }
}

async function createDebt(req, res, next) {
  try {
    const debt = await svc.createDebt(req.params.companyId, req.user, req.body)
    res.status(201).json({ data: { debt } })
  } catch (err) { next(err) }
}

async function updateDebt(req, res, next) {
  try {
    const debt = await svc.updateDebt(req.params.companyId, req.params.id, req.user, req.body)
    res.json({ data: { debt } })
  } catch (err) { next(err) }
}

async function deleteDebt(req, res, next) {
  try {
    await svc.deleteDebt(req.params.companyId, req.params.id, req.user)
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
}

async function listColumns(req, res, next) {
  try {
    const columns = await svc.listColumns(req.params.companyId, req.user)
    res.json({ data: { columns } })
  } catch (err) { next(err) }
}

async function createColumn(req, res, next) {
  try {
    const column = await svc.createColumn(req.params.companyId, req.user, req.body)
    res.status(201).json({ data: { column } })
  } catch (err) { next(err) }
}

async function deleteColumn(req, res, next) {
  try {
    await svc.deleteColumn(req.params.companyId, req.params.colId, req.user)
    res.json({ data: { deleted: true } })
  } catch (err) { next(err) }
}

async function exportExcel(req, res, next) {
  try {
    const buffer = await svc.exportDebts(req.params.companyId, req.user, req.query.fields)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="no_nsnn_${req.params.companyId}.xlsx"`)
    res.send(buffer)
  } catch (err) { next(err) }
}

async function batchImport(req, res, next) {
  try {
    const result = await svc.batchCreate(req.params.companyId, req.user, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

module.exports = { listDebts, createDebt, updateDebt, deleteDebt, batchImport, listColumns, createColumn, deleteColumn, exportExcel }
