const svc = require('./system-configs.service')

async function listConfigs(req, res, next) {
  try {
    const configs = await svc.listConfigs()
    res.json({ success: true, data: { configs } })
  } catch (err) { next(err) }
}

async function updateConfig(req, res, next) {
  try {
    const config = await svc.updateConfig(req.params.key, req.body.value, req.user.id)
    res.json({ success: true, data: { config } })
  } catch (err) { next(err) }
}

module.exports = { listConfigs, updateConfig }
