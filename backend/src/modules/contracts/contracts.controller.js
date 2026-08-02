const svc = require('./contracts.service')

async function listContracts(req, res, next) {
  try {
    const contracts = await svc.listContracts(req.params.companyId, req.user)
    res.json({ success: true, data: { contracts } })
  } catch (err) { next(err) }
}

async function getContract(req, res, next) {
  try {
    const contract = await svc.getContract(req.params.companyId, req.params.id, req.user)
    res.json({ success: true, data: { contract } })
  } catch (err) { next(err) }
}

async function createContract(req, res, next) {
  try {
    const contract = await svc.createContract(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { contract } })
  } catch (err) { next(err) }
}

async function updateContract(req, res, next) {
  try {
    const contract = await svc.updateContract(req.params.companyId, req.params.id, req.body, req.user)
    res.json({ success: true, data: { contract } })
  } catch (err) { next(err) }
}

async function deleteContract(req, res, next) {
  try {
    await svc.deleteContract(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = { listContracts, getContract, createContract, updateContract, deleteContract }
