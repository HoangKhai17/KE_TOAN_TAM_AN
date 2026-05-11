const svc = require('./enums.service')

async function listAllEnums(req, res, next) {
  try {
    const enums = await svc.listAllEnums()
    res.json({ success: true, data: { enums } })
  } catch (err) { next(err) }
}

async function getEnumType(req, res, next) {
  try {
    const result = await svc.listEnumType(req.params.typeKey)
    if (!result) return res.status(404).json({ success: false, error: { message: 'Enum type not found' } })
    res.json({ success: true, data: { enumType: result } })
  } catch (err) { next(err) }
}

async function updateOptionLabel(req, res, next) {
  try {
    const { typeKey, optionKey } = req.params
    const { label } = req.body
    const option = await svc.updateOptionLabel(typeKey, optionKey, label)
    if (!option) return res.status(404).json({ success: false, error: { message: 'Enum option not found' } })
    res.json({ success: true, data: { option } })
  } catch (err) { next(err) }
}

module.exports = { listAllEnums, getEnumType, updateOptionLabel }
