'use strict'
const { query } = require('../../config/db')

// Tất cả truy vấn đều scope theo user_id → ghi chú riêng tư từng người.

async function listMine(userId) {
  const { rows } = await query(
    `SELECT id, content, created_at, updated_at
       FROM quick_notes
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  )
  return rows
}

async function create(userId, content) {
  const { rows } = await query(
    `INSERT INTO quick_notes (user_id, content)
     VALUES ($1, $2)
     RETURNING id, content, created_at, updated_at`,
    [userId, content]
  )
  return rows[0]
}

async function update(id, userId, content) {
  const { rows } = await query(
    `UPDATE quick_notes
        SET content = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, content, created_at, updated_at`,
    [content, id, userId]
  )
  return rows[0] || null
}

async function remove(id, userId) {
  const { rowCount } = await query(
    `DELETE FROM quick_notes WHERE id = $1 AND user_id = $2`,
    [id, userId]
  )
  return rowCount > 0
}

module.exports = { listMine, create, update, remove }
