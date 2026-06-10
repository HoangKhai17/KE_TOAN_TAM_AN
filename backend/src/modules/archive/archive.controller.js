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
    const docs = await svc.listDocs(
      req.params.companyId, req.params.yearId, req.user
    )
    res.json({ success: true, data: { docs } })
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

module.exports = {
  listYears, createYear, updateYear, deleteYear,
  listDocs, createDoc, updateDoc, deleteDoc, reorderDocs,
}
