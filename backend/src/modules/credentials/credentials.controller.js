const svc = require('./credentials.service')

async function listCredentials(req, res, next) {
  try {
    const { isActive } = req.query
    const credentials = await svc.listCredentials(req.params.companyId, { isActive }, req.user)
    res.json({ success: true, data: { credentials } })
  } catch (err) { next(err) }
}

async function getCredential(req, res, next) {
  try {
    const credential = await svc.getCredential(req.params.companyId, req.params.id, req.user)
    res.json({ success: true, data: { credential } })
  } catch (err) { next(err) }
}

async function createCredential(req, res, next) {
  try {
    const credential = await svc.createCredential(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { credential } })
  } catch (err) { next(err) }
}

async function updateCredential(req, res, next) {
  try {
    const credential = await svc.updateCredential(
      req.params.companyId, req.params.id, req.body, req.user
    )
    res.json({ success: true, data: { credential } })
  } catch (err) { next(err) }
}

async function deleteCredential(req, res, next) {
  try {
    await svc.deleteCredential(
      req.params.companyId, req.params.id,
      req.user, req.ip, req.headers['user-agent']
    )
    res.status(204).end()
  } catch (err) { next(err) }
}

async function revealCredential(req, res, next) {
  try {
    const result = await svc.revealCredential(
      req.params.companyId, req.params.id,
      req.user, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

module.exports = {
  listCredentials, getCredential, createCredential,
  updateCredential, deleteCredential, revealCredential,
}
