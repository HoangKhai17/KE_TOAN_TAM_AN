const svc = require('./csc.service')

async function listContracts(req, res, next) {
  try {
    const contracts = await svc.listContracts(req.params.companyId, req.user)
    res.json({ data: { contracts } })
  } catch (err) { next(err) }
}

async function createContract(req, res, next) {
  try {
    const contract = await svc.createContract(req.params.companyId, req.body, req.user.id, req.user)
    res.status(201).json({ data: { contract } })
  } catch (err) { next(err) }
}

async function updateContract(req, res, next) {
  try {
    const contract = await svc.updateContract(
      req.params.companyId, req.params.id, req.body, req.user.id, req.user
    )
    res.json({ data: { contract } })
  } catch (err) { next(err) }
}

async function deleteContract(req, res, next) {
  try {
    await svc.deleteContract(req.params.companyId, req.params.id, req.user)
    res.json({ data: null })
  } catch (err) { next(err) }
}

async function exportExcel(req, res, next) {
  try {
    const wb = await svc.exportContracts(
      req.params.companyId, req.user, req.query.fields ?? ''
    )
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="hd_kh_ncc.xlsx"')
    await wb.xlsx.write(res)
    res.end()
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
    const column = await svc.createColumn(req.params.companyId, req.body, req.user)
    res.status(201).json({ data: { column } })
  } catch (err) { next(err) }
}

async function deleteColumn(req, res, next) {
  try {
    await svc.deleteColumn(req.params.companyId, req.params.colId, req.user)
    res.json({ data: null })
  } catch (err) { next(err) }
}

module.exports = {
  listContracts, createContract, updateContract, deleteContract, exportExcel,
  listColumns, createColumn, deleteColumn,
}
