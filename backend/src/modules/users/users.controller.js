const usersService = require('./users.service')

async function listUsers(req, res, next) {
  try {
    const { page = '1', limit = '20', role, status, search } = req.query
    const result = await usersService.listUsers({
      page: Math.max(1, parseInt(page, 10)),
      limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
      role,
      status,
      search,
    })
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

async function getUser(req, res, next) {
  try {
    const user = await usersService.getUserById(req.params.id)
    res.json({ success: true, data: { user } })
  } catch (err) {
    next(err)
  }
}

async function createUser(req, res, next) {
  try {
    const user = await usersService.createUser(
      req.body, req.user.id, req.ip, req.headers['user-agent']
    )
    res.status(201).json({ success: true, data: { user } })
  } catch (err) {
    next(err)
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await usersService.updateUser(
      req.params.id, req.body, req.user.id, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: { user } })
  } catch (err) {
    next(err)
  }
}

async function updateStatus(req, res, next) {
  try {
    const user = await usersService.updateStatus(
      req.params.id, req.body.status, req.user.id, req.ip, req.headers['user-agent']
    )
    res.json({ success: true, data: { user } })
  } catch (err) {
    next(err)
  }
}

async function deleteUser(req, res, next) {
  try {
    await usersService.deleteUser(
      req.params.id, req.user.id, req.ip, req.headers['user-agent']
    )
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

module.exports = { listUsers, getUser, createUser, updateUser, updateStatus, deleteUser }
