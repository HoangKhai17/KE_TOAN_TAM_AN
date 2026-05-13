'use strict'
const { query } = require('../../config/db')

async function listNotifications(userId, { page = 1, limit = 20, isRead, type } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['n.user_id = $1']
  const params = [userId]

  if (isRead !== undefined) {
    params.push(isRead)
    conditions.push(`n.is_read = $${params.length}`)
  }

  if (type) {
    params.push(type)
    conditions.push(`n.type = $${params.length}::notification_type`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT n.id, n.user_id, n.type, n.title, n.body, n.task_id, n.is_read, n.read_at, n.created_at,
              t.title AS task_title
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM notifications n ${where}`, params),
  ])

  return {
    notifications: rows,
    total: parseInt(countRows[0].count, 10),
    page,
    limit,
  }
}

async function getUnreadCount(userId) {
  const { rows: [row] } = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId]
  )
  return parseInt(row.count, 10)
}

async function markRead(id, userId) {
  const { rows: [notif] } = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING id, is_read, read_at`,
    [id, userId]
  )
  if (!notif) throw Object.assign(new Error('Notification not found'), { status: 404 })
  return notif
}

async function markAllRead(userId) {
  const { rowCount } = await query(
    `UPDATE notifications SET is_read = TRUE, read_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  )
  return rowCount
}

async function deleteOne(id, userId) {
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [id, userId]
  )
  if (!rowCount) throw Object.assign(new Error('Notification not found'), { status: 404 })
}

async function deleteMany(ids, userId) {
  if (!ids?.length) return 0
  const { rowCount } = await query(
    'DELETE FROM notifications WHERE id = ANY($1::uuid[]) AND user_id = $2',
    [ids, userId]
  )
  return rowCount
}

module.exports = { listNotifications, getUnreadCount, markRead, markAllRead, deleteOne, deleteMany }
