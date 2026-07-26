const svc = require('./locations.service')

async function listLocations(req, res, next) {
  try {
    const { status } = req.query
    const locations = await svc.listLocations(req.params.companyId, { status }, req.user)
    res.json({ success: true, data: { locations } })
  } catch (err) { next(err) }
}

async function getLocation(req, res, next) {
  try {
    const location = await svc.getLocation(req.params.companyId, req.params.id, req.user)
    res.json({ success: true, data: { location } })
  } catch (err) { next(err) }
}

async function createLocation(req, res, next) {
  try {
    const location = await svc.createLocation(req.params.companyId, req.body, req.user)
    res.status(201).json({ success: true, data: { location } })
  } catch (err) { next(err) }
}

async function updateLocation(req, res, next) {
  try {
    const location = await svc.updateLocation(req.params.companyId, req.params.id, req.body, req.user)
    res.json({ success: true, data: { location } })
  } catch (err) { next(err) }
}

async function deleteLocation(req, res, next) {
  try {
    await svc.deleteLocation(req.params.companyId, req.params.id, req.user)
    res.status(204).end()
  } catch (err) { next(err) }
}

module.exports = {
  listLocations, getLocation, createLocation, updateLocation, deleteLocation,
}
