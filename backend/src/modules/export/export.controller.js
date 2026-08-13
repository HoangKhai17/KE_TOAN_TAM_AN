const { buildWorkbook } = require('./excel-renderer')

// POST /api/export/xlsx — nhận dữ liệu đã tính từ client, trả file .xlsx theo style chuẩn.
// Endpoint chỉ FORMAT dữ liệu client gửi (client vốn đã được phép xem) → không đụng DB.
async function exportXlsx(req, res, next) {
  try {
    const { filename = 'export', sheets = [] } = req.body || {}
    if (!Array.isArray(sheets)) { const e = new Error('sheets phải là mảng'); e.status = 400; throw e }
    const wb = buildWorkbook({ sheets })
    const buffer = await wb.xlsx.writeBuffer()
    const safe = (String(filename).replace(/[^\w\-.]+/g, '_').slice(0, 120)) || 'export'
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (e) { next(e) }
}

module.exports = { exportXlsx }
