const svc = require('./originalDocuments.service')

async function listOriginalDocuments(req, res, next) {
  try {
    const originalDocuments = await svc.listOriginalDocuments(req.params.companyId, req.user)
    res.json({ success: true, data: { originalDocuments } })
  } catch (err) { next(err) }
}

async function createOriginalDocument(req, res, next) {
  try {
    const originalDocument = await svc.createOriginalDocument(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { originalDocument } })
  } catch (err) { next(err) }
}

async function updateOriginalDocument(req, res, next) {
  try {
    const originalDocument = await svc.updateOriginalDocument(req.params.companyId, req.params.id, req.body, req.user)
    res.json({ success: true, data: { originalDocument } })
  } catch (err) { next(err) }
}

async function deleteOriginalDocument(req, res, next) {
  try {
    await svc.deleteOriginalDocument(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listOriginalDocuments, createOriginalDocument, updateOriginalDocument, deleteOriginalDocument,
}
