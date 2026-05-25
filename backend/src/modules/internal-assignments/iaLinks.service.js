'use strict'
const { query } = require('../../config/db')

async function listLinks(assignmentId) {
  const { rows } = await query(
    `SELECT il.*, u.name AS creator_name
     FROM ia_links il
     JOIN users u ON u.id = il.created_by
     WHERE il.assignment_id = $1
     ORDER BY il.created_at ASC`,
    [assignmentId]
  )
  return rows.map((r) => ({
    id:          r.id,
    name:        r.name,
    url:         r.url,
    description: r.description ?? null,
    createdBy:   r.created_by,
    createdAt:   r.created_at,
  }))
}

async function addLink(assignmentId, { name, url, description }, actorId) {
  const { rows: [row] } = await query(
    `INSERT INTO ia_links (assignment_id, name, url, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [assignmentId, name, url, description ?? null, actorId]
  )
  const { rows: [full] } = await query(
    `SELECT il.*, u.name AS creator_name FROM ia_links il JOIN users u ON u.id = il.created_by WHERE il.id = $1`,
    [row.id]
  )
  return {
    id:          full.id,
    name:        full.name,
    url:         full.url,
    description: full.description ?? null,
    createdBy:   full.created_by,
    createdAt:   full.created_at,
  }
}

async function deleteLink(assignmentId, linkId, actorId, isAdmin) {
  const { rows: [row] } = await query(
    `SELECT * FROM ia_links WHERE id = $1 AND assignment_id = $2`,
    [linkId, assignmentId]
  )
  if (!row) throw Object.assign(new Error('Không tìm thấy link'), { status: 404 })
  if (!isAdmin && row.created_by !== actorId) {
    throw Object.assign(new Error('Không có quyền xóa link này'), { status: 403 })
  }
  await query(`DELETE FROM ia_links WHERE id = $1`, [linkId])
}

module.exports = { listLinks, addLink, deleteLink }
