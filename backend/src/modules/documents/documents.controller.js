const svc = require('./documents.service')

async function listDocuments(req, res, next) {
  try {
    const { taskId, category, page = '1', limit = '30' } = req.query
    const result = await svc.listDocuments(req.params.companyId, {
      taskId:   taskId,
      category: category,
      page:     Math.max(1, parseInt(page, 10)),
      limit:    Math.min(100, Math.max(1, parseInt(limit, 10))),
    })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'No file uploaded' })
    }
    const { category, taskId } = req.body
    const document = await svc.uploadDocument(
      req.params.companyId,
      req.file,
      { category, taskId: taskId || null },
      req.user.id, req.ip, req.headers['user-agent']
    )
    res.status(201).json({ success: true, data: { document } })
  } catch (err) { next(err) }
}

async function getLinkUrl(req, res, next) {
  try {
    const url = await svc.getLinkUrl(req.params.companyId, req.params.id)
    res.json({ success: true, data: { url } })
  } catch (err) { next(err) }
}

async function attachToTask(req, res, next) {
  try {
    const document = await svc.attachToTask(
      req.params.companyId, req.params.id, req.body, req.user.id
    )
    res.json({ success: true, data: { document } })
  } catch (err) { next(err) }
}

async function deleteDocument(req, res, next) {
  try {
    await svc.deleteDocument(
      req.params.companyId, req.params.id,
      req.user.id, req.ip, req.headers['user-agent']
    )
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = { listDocuments, uploadDocument, getLinkUrl, attachToTask, deleteDocument }
