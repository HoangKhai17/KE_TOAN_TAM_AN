'use strict'
const svc = require('./kpi.service')

function bad(msg) { const e = new Error(msg); e.status = 400; return e }

// GET /kpi?year=&month=  — admin: tất cả NV; staff: chỉ mình
async function list(req, res, next) {
  try {
    const { year, month } = req.query
    if (!year || !month) throw bad('Thiếu year/month')
    const userId = req.user.role === 'staff' ? req.user.id : null
    const data = await svc.listMonthly(year, month, userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// GET /kpi/:userId?year=&month=  — chi tiết breakdown; staff chỉ xem mình
async function detail(req, res, next) {
  try {
    const { year, month } = req.query
    if (!year || !month) throw bad('Thiếu year/month')
    if (req.user.role === 'staff' && req.params.userId !== req.user.id) {
      const e = new Error('Không có quyền xem KPI của người khác'); e.status = 403; throw e
    }
    const data = await svc.getDetail(year, month, req.params.userId)
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function close(req, res, next) {
  try {
    const { year, month } = req.body
    if (!year || !month) throw bad('Thiếu year/month')
    const data = await svc.closeMonth(year, month, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function reopen(req, res, next) {
  try {
    const { year, month } = req.body
    if (!year || !month) throw bad('Thiếu year/month')
    const data = await svc.reopenMonth(year, month, req.user.id, req.ip, req.headers['user-agent'])
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

module.exports = { list, detail, close, reopen }
