const svc = require('./companyNotes.service')

async function listNotes(req, res, next) {
  try {
    const notes = await svc.listNotes(req.params.companyId, req.user)
    res.json({ success: true, data: { notes } })
  } catch (err) { next(err) }
}

async function createNote(req, res, next) {
  try {
    const note = await svc.createNote(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function updateNote(req, res, next) {
  try {
    const note = await svc.updateNote(req.params.companyId, req.params.id, req.body, req.user)
    res.json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function deleteNote(req, res, next) {
  try {
    await svc.deleteNote(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = { listNotes, createNote, updateNote, deleteNote }
