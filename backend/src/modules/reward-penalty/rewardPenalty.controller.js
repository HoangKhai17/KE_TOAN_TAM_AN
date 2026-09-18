'use strict'
const svc = require('./rewardPenalty.service')

// ── Quy tắc (admin) ──
async function listRules(req, res, next) {
  try { res.json({ success: true, data: { rules: await svc.listRules({ activeOnly: req.query.activeOnly === 'true' }) } }) }
  catch (e) { next(e) }
}
async function createRule(req, res, next) {
  try { res.status(201).json({ success: true, data: { rule: await svc.createRule(req.body, req.user.id) } }) }
  catch (e) { next(e) }
}
async function updateRule(req, res, next) {
  try { res.json({ success: true, data: { rule: await svc.updateRule(req.params.id, req.body) } }) }
  catch (e) { next(e) }
}
async function deleteRule(req, res, next) {
  try { await svc.deleteRule(req.params.id); res.status(204).end() }
  catch (e) { next(e) }
}

// ── Sổ ghi ──
async function listEntries(req, res, next) {
  try {
    const { year, month, userId, kind, status } = req.query
    // Staff chỉ xem của MÌNH; admin xem tất cả (lọc tùy chọn).
    const scopeUserId = req.user.role === 'admin' ? undefined : req.user.id
    res.json({ success: true, data: { entries: await svc.listEntries({
      year: year ? Number(year) : undefined, month: month ? Number(month) : undefined,
      userId, kind, status, scopeUserId,
    }) } })
  } catch (e) { next(e) }
}
async function createEntry(req, res, next) {
  try { res.status(201).json({ success: true, data: { entry: await svc.createEntry(req.body, req.user.id) } }) }
  catch (e) { next(e) }
}
async function updateEntry(req, res, next) {
  try { res.json({ success: true, data: { entry: await svc.updateEntry(req.params.id, req.body) } }) }
  catch (e) { next(e) }
}
async function approveEntry(req, res, next) {
  try { res.json({ success: true, data: { entry: await svc.approveEntry(req.params.id, req.user.id) } }) }
  catch (e) { next(e) }
}
async function deleteEntry(req, res, next) {
  try { await svc.deleteEntry(req.params.id); res.status(204).end() }
  catch (e) { next(e) }
}
async function listYears(req, res, next) {
  try {
    const scopeUserId = req.user.role === 'admin' ? undefined : req.user.id
    res.json({ success: true, data: { years: await svc.listYears({ scopeUserId }) } })
  } catch (e) { next(e) }
}
async function getSummary(req, res, next) {
  try {
    const year = Number(req.query.year); const month = Number(req.query.month)
    if (!year || !month) { const e = new Error('Thiếu year/month'); e.status = 400; throw e }
    res.json({ success: true, data: { summary: await svc.getSummary({ year, month }) } })
  } catch (e) { next(e) }
}

async function explainEntry(req, res, next) {
  try {
    const explanation = String(req.body.explanation ?? '').trim()
    if (!explanation) { const e = new Error('Nhập nội dung giải trình'); e.status = 400; throw e }
    res.json({ success: true, data: { entry: await svc.explainEntry(req.params.id, req.user.id, explanation) } })
  } catch (e) { next(e) }
}

// ── Quy đổi xếp loại (grades) ──
async function listGrades(req, res, next) {
  try { res.json({ success: true, data: { grades: await svc.listGrades({ activeOnly: req.query.activeOnly === 'true' }) } }) }
  catch (e) { next(e) }
}
async function createGrade(req, res, next) {
  try { res.status(201).json({ success: true, data: { grade: await svc.createGrade(req.body, req.user.id) } }) }
  catch (e) { next(e) }
}
async function updateGrade(req, res, next) {
  try { res.json({ success: true, data: { grade: await svc.updateGrade(req.params.id, req.body) } }) }
  catch (e) { next(e) }
}
async function deleteGrade(req, res, next) {
  try { await svc.deleteGrade(req.params.id); res.status(204).end() }
  catch (e) { next(e) }
}

module.exports = {
  listRules, createRule, updateRule, deleteRule,
  listEntries, createEntry, updateEntry, approveEntry, deleteEntry, explainEntry, getSummary, listYears,
  listGrades, createGrade, updateGrade, deleteGrade,
}
