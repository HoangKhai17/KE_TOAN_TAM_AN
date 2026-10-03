'use strict'
const svc = require('./kpi.service')

function bad(msg) { const e = new Error(msg); e.status = 400; return e }

// Có kỳ hợp lệ khi: đủ năm+tháng, HOẶC có khoảng ngày tùy chọn (from/to).
function hasPeriod(req) { return !!((req.query.year && req.query.month) || req.query.from || req.query.to) }

// Xây bộ lọc từ query (chỉ admin được lọc; staff LUÔN chỉ xem chính mình).
// ?role=staff|admin  ?userIds=id1,id2  (bỏ trống = tất cả theo role)
function buildFilter(req) {
  const sources = req.query.sources
    ? String(req.query.sources).split(',').map((s) => s.trim()).filter(Boolean)
    : null
  const from = req.query.from || null   // khoảng ngày tùy chọn (YYYY-MM-DD) — ưu tiên hơn year/month
  const to = req.query.to || null
  if (req.user.role === 'staff') return { userId: req.user.id, sources, from, to }
  const role = ['staff', 'admin'].includes(req.query.role) ? req.query.role : null
  const userIds = req.query.userIds
    ? String(req.query.userIds).split(',').map((s) => s.trim()).filter(Boolean)
    : null
  return { role, userIds, sources, from, to }
}

// GET /kpi?year=&month=  — admin: tất cả NV (lọc được); staff: chỉ mình
async function list(req, res, next) {
  try {
    const { year, month } = req.query
    if (!hasPeriod(req)) throw bad('Thiếu kỳ (year/month hoặc from/to)')
    const data = await svc.listMonthly(year, month, buildFilter(req))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// GET /kpi/:userId?year=&month=  — chi tiết breakdown; staff chỉ xem mình
async function detail(req, res, next) {
  try {
    const { year, month, from = null, to = null } = req.query
    if (!hasPeriod(req)) throw bad('Thiếu kỳ (year/month hoặc from/to)')
    if (req.user.role === 'staff' && req.params.userId !== req.user.id) {
      const e = new Error('Không có quyền xem KPI của người khác'); e.status = 403; throw e
    }
    const data = await svc.getDetail(year, month, req.params.userId, { from, to })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// GET /kpi/:userId/tasks?year=&month= — từng task của NV trong kỳ; staff chỉ xem mình
async function userTasks(req, res, next) {
  try {
    const { year, month, from = null, to = null } = req.query
    if (!hasPeriod(req)) throw bad('Thiếu kỳ (year/month hoặc from/to)')
    if (req.user.role === 'staff' && req.params.userId !== req.user.id) {
      const e = new Error('Không có quyền xem KPI của người khác'); e.status = 403; throw e
    }
    const tasks = await svc.getUserTasks(year, month, req.params.userId, { from, to })
    res.json({ success: true, data: { tasks } })
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

// GET /kpi/performance?year=&month= — hiệu suất tổng hợp (KPI + thưởng/phạt → xếp loại → tiền)
async function performance(req, res, next) {
  try {
    const { year, month } = req.query
    if (!hasPeriod(req)) throw bad('Thiếu kỳ (year/month hoặc from/to)')
    const data = await svc.getPerformance(year, month, buildFilter(req))
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

// ── Mốc quy đổi % đúng hạn → điểm (admin) ──
async function listTiers(req, res, next) {
  try { res.json({ success: true, data: { tiers: await svc.listTiers() } }) } catch (err) { next(err) }
}
async function createTier(req, res, next) {
  try { res.status(201).json({ success: true, data: { tier: await svc.createTier(req.body, req.user.id) } }) } catch (err) { next(err) }
}
async function updateTier(req, res, next) {
  try { res.json({ success: true, data: { tier: await svc.updateTier(req.params.id, req.body) } }) } catch (err) { next(err) }
}
async function deleteTier(req, res, next) {
  try { await svc.deleteTier(req.params.id); res.status(204).end() } catch (err) { next(err) }
}

module.exports = { list, detail, userTasks, close, reopen, performance, listTiers, createTier, updateTier, deleteTier }
