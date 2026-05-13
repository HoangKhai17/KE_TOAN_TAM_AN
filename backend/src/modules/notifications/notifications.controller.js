'use strict'
const svc = require('./notifications.service')

async function list(req, res, next) {
  try {
    const userId = req.user.id
    const page   = Math.max(1, parseInt(req.query.page  || '1', 10))
    const limit  = Math.min(50, parseInt(req.query.limit || '20', 10))
    const isRead = req.query.is_read !== undefined ? req.query.is_read === 'true' : undefined
    const result = await svc.listNotifications(userId, { page, limit, isRead })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

async function unreadCount(req, res, next) {
  try {
    const count = await svc.getUnreadCount(req.user.id)
    res.json({ success: true, data: { count } })
  } catch (err) { next(err) }
}

async function markOne(req, res, next) {
  try {
    const notif = await svc.markRead(req.params.id, req.user.id)
    res.json({ success: true, data: { notification: notif } })
  } catch (err) { next(err) }
}

async function markAll(req, res, next) {
  try {
    const updated = await svc.markAllRead(req.user.id)
    res.json({ success: true, data: { updated } })
  } catch (err) { next(err) }
}

module.exports = { list, unreadCount, markOne, markAll }
