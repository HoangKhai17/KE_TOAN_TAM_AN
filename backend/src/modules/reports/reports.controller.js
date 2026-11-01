const svc = require('./reports.service')

// YYYY-MM-DD theo GIỜ ĐỊA PHƯƠNG (TZ tiến trình = Asia/Ho_Chi_Minh) — KHÔNG dùng
// toISOString (UTC) vì sẽ lệch ngày lúc nửa đêm.
function ymdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Mặc định dự báo = THÁNG SAU, tự cuộn năm đúng (tránh lỗi tháng 13 vào tháng 12).
function defaultForecastPeriod() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

async function getForecast(req, res, next) {
  try {
    const def = defaultForecastPeriod()
    const month = req.query.month || def.month
    const year  = req.query.year  || def.year
    const data = await svc.forecast({ month, year, user: req.user })
    res.json(data)
  } catch (err) { next(err) }
}

async function exportReport(req, res, next) {
  try {
    const { type } = req.params
    if (type !== 'forecast') {
      return res.status(400).json({ error: 'Invalid report type' })
    }

    const now = new Date()
    const q = req.query
    const def = defaultForecastPeriod()
    const data = await svc.forecast({ month: q.month || def.month, year: q.year || def.year })
    const buffer = await svc.exportToExcel(type, data)
    const filename = `du-bao-${ymdLocal(now)}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buffer)
  } catch (err) { next(err) }
}

module.exports = { getForecast, exportReport }
