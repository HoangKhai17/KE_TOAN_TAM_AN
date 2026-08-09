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
    level:     r.level ?? 0,
    position:  r.position,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

async function addItem(assignmentId, text, actorId, level = 0) {
  const { rows: [{ max_pos }] } = await query(
    `SELECT COALESCE(MAX(position), -1) AS max_pos FROM ia_checklist_items WHERE assignment_id = $1`,
    [assignmentId]
  )
  const lv = level === 1 ? 1 : 0
  const { rows: [row] } = await query(
    `INSERT INTO ia_checklist_items (assignment_id, text, level, position, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [assignmentId, text, lv, max_pos + 1, actorId]
  )
  return { id: row.id, text: row.text, isDone: row.is_done, level: row.level ?? 0, position: row.position, createdBy: row.created_by, createdAt: row.created_at }
}

async function updateItem(assignmentId, itemId, { text, isDone, level }) {
  const fields = []
  const params = []
  if (text !== undefined)   { params.push(text);   fields.push(`text = $${params.length}`) }
  if (isDone !== undefined) { params.push(isDone);  fields.push(`is_done = $${params.length}`) }
  if (level !== undefined)  { params.push(level === 1 ? 1 : 0); fields.push(`level = $${params.length}`) }
  if (fields.length === 0) return

  params.push(itemId, assignmentId)
  const { rows: [row] } = await query(
    `UPDATE ia_checklist_items SET ${fields.join(', ')}
     WHERE id = $${params.length - 1} AND assignment_id = $${params.length}
     RETURNING *`,
    params
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy mục checklist'), { status: 404 })
  return { id: row.id, text: row.text, isDone: row.is_done, level: row.level ?? 0, position: row.position, createdBy: row.created_by, createdAt: row.created_at }
}

async function deleteItem(assignmentId, itemId) {
  const { rowCount } = await query(
    `DELETE FROM ia_checklist_items WHERE id = $1 AND assignment_id = $2`,
    [itemId, assignmentId]
  )
  if (rowCount === 0) throw Object.assign(new Error('Không tìm thấy mục checklist'), { status: 404 })
}

// Sắp xếp lại thứ tự (kéo thả) — orderedIds theo thứ tự hiển thị mong muốn
async function reorderItems(assignmentId, orderedIds) {
  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      `UPDATE ia_checklist_items SET position = $1 WHERE id = $2 AND assignment_id = $3`,
      [i, orderedIds[i], assignmentId]
    )
  }
}

module.exports = { listItems, addItem, updateItem, deleteItem, reorderItems }
