const svc = require('./progress-matrix.service')

function staffScope(req) {
  return req.user.role === 'staff' ? req.user.id : undefined
}

async function getTaskTypes(req, res, next) {
  try {
    const taskTypes = await svc.listTaskTypes()
    res.json({ success: true, data: { taskTypes } })
  } catch (err) { next(err) }
}

async function getYears(req, res, next) {
  try {
    const years = await svc.listYears()
    res.json({ success: true, data: { years } })
  } catch (err) { next(err) }
}

async function getMatrix(req, res, next) {
  try {
    const { taskTypeId, month, year } = req.query
    const data = await svc.getMatrix({ taskTypeId, month, year, forceAssignedTo: staffScope(req) })
    res.json({ success: true, data })
  } catch (err) { next(err) }
}

async function exportMatrix(req, res, next) {
  try {
    const { taskTypeId, month, year } = req.query
    const matrix = await svc.getMatrix({ taskTypeId, month, year, forceAssignedTo: staffScope(req) })
    const buffer = await svc.exportMatrix(matrix)

    const slug = String(matrix.taskType.name)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const filename = `bc-tien-do-${slug}-T${matrix.period.month}-${matrix.period.year}.xlsx`

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.send(Buffer.from(buffer))
  } catch (err) { next(err) }
}

module.exports = { getTaskTypes, getYears, getMatrix, exportMatrix }
