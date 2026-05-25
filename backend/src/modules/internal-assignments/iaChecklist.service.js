'use strict'
const { query } = require('../../config/db')

async function listItems(assignmentId) {
  const { rows } = await query(
    `SELECT ic.*, u.name AS creator_name
     FROM ia_checklist_items ic
     JOIN users u ON u.id = ic.created_by
     WHERE ic.assignment_id = $1
     ORDER BY ic.position ASC, ic.created_at ASC`,
    [assignmentId]
  )
  return rows.map((r) => ({
    id:        r.id,
    text:      r.text,
    isDone:    r.is_done,
    position:  r.position,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

async function addItem(assignmentId, text, actorId) {
  const { rows: [{ max_pos }] } = await query(
    `SELECT COALESCE(MAX(position), -1) AS max_pos FROM ia_checklist_items WHERE assignment_id = $1`,
    [assignmentId]
  )
  const { rows: [row] } = await query(
    `INSERT INTO ia_checklist_items (assignment_id, text, position, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [assignmentId, text, max_pos + 1, actorId]
  )
  return { id: row.id, text: row.text, isDone: row.is_done, position: row.position, createdBy: row.created_by, createdAt: row.created_at }
}

async function updateItem(assignmentId, itemId, { text, isDone }) {
  const fields = []
  const params = []
  if (text !== undefined)   { params.push(text);   fields.push(`text = $${params.length}`) }
  if (isDone !== undefined) { params.push(isDone);  fields.push(`is_done = $${params.length}`) }
  if (fields.length === 0) return

  params.push(itemId, assignmentId)
  const { rows: [row] } = await query(
    `UPDATE ia_checklist_items SET ${fields.join(', ')}
     WHERE id = $${params.length - 1} AND assignment_id = $${params.length}
     RETURNING *`,
    params
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy mục checklist'), { status: 404 })
  return { id: row.id, text: row.text, isDone: row.is_done, position: row.position, createdBy: row.created_by, createdAt: row.created_at }
}

async function deleteItem(assignmentId, itemId) {
  const { rowCount } = await query(
    `DELETE FROM ia_checklist_items WHERE id = $1 AND assignment_id = $2`,
    [itemId, assignmentId]
  )
  if (rowCount === 0) throw Object.assign(new Error('Không tìm thấy mục checklist'), { status: 404 })
}

module.exports = { listItems, addItem, updateItem, deleteItem }
