'use strict'
const { query } = require('../config/db')
const { getIo } = require('../config/socket')
const logger = require('../config/logger')

async function createAndEmit(userId, type, title, body, taskId = null) {
  if (!userId) return null
  try {
    const { rows: [notif] } = await query(
      `INSERT INTO notifications (user_id, type, title, body, task_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, type, title, body, task_id, is_read, created_at`,
      [userId, type, title, body, taskId]
    )

    const io = getIo()
    if (io && notif) {
      io.to(`user:${userId}`).emit('notification', notif)
    }

    return notif
  } catch (err) {
    logger.error('[Notify] Failed to create notification', { error: err.message, userId, type })
    return null
  }
}

/**
 * Broadcast a data-sync event to ALL connected clients.
 * Clients use this to know when to re-fetch specific entities.
 * Non-blocking — errors are logged and swallowed.
 *
 * @param {'data:task'|'data:company'|'data:comment'} event
 * @param {{ action?: string, id?: string, companyId?: string, taskId?: string, actorId?: string }} payload
 */
function emitData(event, payload) {
  try {
    const io = getIo()
    if (io) io.emit(event, payload)
  } catch (err) {
    logger.warn('[Notify] emitData failed', { event, error: err.message })
  }
}

module.exports = { createAndEmit, emitData }
