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

async function addOption(req, res, next) {
  try {
    const { typeKey } = req.params
    const { optionKey, label } = req.body
    const option = await svc.addOption(typeKey, optionKey, label)
    if (!option) return res.status(404).json({ success: false, error: { message: 'Enum type not found' } })
    res.status(201).json({ success: true, data: { option } })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: { message: 'Mã này đã tồn tại trong danh mục' } })
    }
    next(err)
  }
}

async function toggleOption(req, res, next) {
  try {
    const { typeKey, optionKey } = req.params
    const option = await svc.toggleOption(typeKey, optionKey)
    if (!option) return res.status(404).json({ success: false, error: { message: 'Enum option not found' } })
    res.json({ success: true, data: { option } })
  } catch (err) { next(err) }
}

async function deleteOption(req, res, next) {
  try {
    const { typeKey, optionKey } = req.params
    const result = await svc.deleteOption(typeKey, optionKey)
    if (result?.notFound) return res.status(404).json({ success: false, error: { message: 'Enum option not found' } })
    res.json({ success: true })
  } catch (err) { next(err) }
}

module.exports = { listAllEnums, getEnumType, updateOptionLabel, addOption, toggleOption, deleteOption }
