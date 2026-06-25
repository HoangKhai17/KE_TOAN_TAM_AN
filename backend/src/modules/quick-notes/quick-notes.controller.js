'use strict'
const svc = require('./quick-notes.service')

const MAX_LEN = 5000

function cleanContent(raw) {
  if (typeof raw !== 'string') return ''
  return raw.trim().slice(0, MAX_LEN)
}

async function list(req, res, next) {
  try {
    const notes = await svc.listMine(req.user.id)
    res.json({ success: true, data: { notes } })
  } catch (err) { next(err) }
}

async function create(req, res, next) {
  try {
    const content = cleanContent(req.body.content)
    if (!content) {
      return res.status(422).json({ success: false, error: { message: 'Nội dung ghi chú không được để trống' } })
    }
    const note = await svc.create(req.user.id, content)
    res.status(201).json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function update(req, res, next) {
  try {
    const content = cleanContent(req.body.content)
    if (!content) {
      return res.status(422).json({ success: false, error: { message: 'Nội dung ghi chú không được để trống' } })
    }
    const note = await svc.update(req.params.id, req.user.id, content)
    if (!note) {
      return res.status(404).json({ success: false, error: { message: 'Không tìm thấy ghi chú' } })
    }
    res.json({ success: true, data: { note } })
  } catch (err) { next(err) }
}

async function remove(req, res, next) {
  try {
    const ok = await svc.remove(req.params.id, req.user.id)
    if (!ok) {
      return res.status(404).json({ success: false, error: { message: 'Không tìm thấy ghi chú' } })
    }
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = { list, create, update, remove }
