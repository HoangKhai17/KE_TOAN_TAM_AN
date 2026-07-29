const svc = require('./documentTypes.service')

async function listDocumentTypes(req, res, next) {
  try {
    const documentTypes = await svc.listDocumentTypes(req.params.companyId, req.user)
    res.json({ success: true, data: { documentTypes } })
  } catch (err) { next(err) }
}

async function createDocumentType(req, res, next) {
  try {
    const documentType = await svc.createDocumentType(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { documentType } })
  } catch (err) { next(err) }
}

async function updateDocumentType(req, res, next) {
  try {
    const documentType = await svc.updateDocumentType(req.params.companyId, req.params.id, req.body, req.user)
    res.json({ success: true, data: { documentType } })
  } catch (err) { next(err) }
}

async function deleteDocumentType(req, res, next) {
  try {
    await svc.deleteDocumentType(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listDocumentTypes, createDocumentType, updateDocumentType, deleteDocumentType,
}
