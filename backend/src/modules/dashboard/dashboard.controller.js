const svc = require('./dashboard.service')

// YYYY-MM-DD theo GIỜ ĐỊA PHƯƠNG của tiến trình (TZ = Asia/Ho_Chi_Minh) — KHÔNG dùng
// toISOString (UTC) vì sẽ lệch ngày. Đây chỉ là fallback khi client không gửi from/to.
function ymdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function defaultDates(from, to) {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return {
    from: from || ymdLocal(firstOfMonth),
    to:   to   || ymdLocal(lastOfMonth),
  }
}

const VALID_TASK_TYPES = new Set(['traditional', 'cdr', 'ia'])

async function getSummary(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const taskType = VALID_TASK_TYPES.has(req.query.taskType) ? req.query.taskType : 'traditional'
    const data = await svc.getSummary(req.user.id, req.user.role, from, to, taskType)
    res.json(data)
  } catch (err) { next(err) }
}

async function getCharts(req, res, next) {
  try {
    const { from, to } = defaultDates(req.query.from, req.query.to)
    const taskType = VALID_TASK_TYPES.has(req.query.taskType) ? req.query.taskType : 'traditional'
    const data = await svc.getCharts(req.user.id, req.user.role, from, to, taskType)
    res.json(data)
  } catch (err) { next(err) }
}

module.exports = { getSummary, getCharts }
