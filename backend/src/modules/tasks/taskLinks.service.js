const { query } = require('../../config/db')

function toDto(row) {
  return {
    id:            row.id,
    taskId:        row.task_id,
    name:          row.name,
    url:           row.url,
    description:   row.description ?? null,
    createdBy:     row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt:     row.created_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
}

async function listLinks(taskId) {
  await assertTask(taskId)
  const { rows } = await query(
    `SELECT tl.*, u.name AS created_by_name
     FROM task_links tl
     JOIN users u ON u.id = tl.created_by
     WHERE tl.task_id = $1
     ORDER BY tl.created_at ASC`,
    [taskId]
  )
  return rows.map(toDto)
}

async function addLink(taskId, { name, url, description }, actorId) {
  await assertTask(taskId)
  const { rows: [link] } = await query(
    `INSERT INTO task_links (task_id, name, url, description, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [taskId, name.trim(), url.trim(), description?.trim() || null, actorId]
  )
  const { rows: [full] } = await query(
    `SELECT tl.*, u.name AS created_by_name
     FROM task_links tl JOIN users u ON u.id = tl.created_by
     WHERE tl.id = $1`,
    [link.id]
  )
  return toDto(full)
}

async function deleteLink(taskId, linkId, actorId, isAdmin) {
  const { rows: [link] } = await query(
    'SELECT * FROM task_links WHERE id = $1 AND task_id = $2',
    [linkId, taskId]
  )
  if (!link) throw Object.assign(new Error('Link not found'), { status: 404 })
  if (link.created_by !== actorId && !isAdmin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  await query('DELETE FROM task_links WHERE id = $1', [linkId])
}

module.exports = { listLinks, addLink, deleteLink }
