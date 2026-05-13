const { query } = require('../../config/db')
const activity = require('../../lib/activity')
const { createAndEmit, emitData } = require('../../lib/notify')

function toDto(row) {
  return {
    id:        row.id,
    taskId:    row.task_id,
    userId:    row.user_id,
    userName:  row.user_name ?? null,
    content:   row.content,
    isEdited:  row.is_edited,
    editedAt:  row.edited_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function assertTask(taskId) {
  const { rows } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
  if (!rows[0]) throw Object.assign(new Error('Task not found'), { status: 404 })
}

async function listComments(taskId, { page = 1, limit = 50 } = {}) {
  await assertTask(taskId)
  const offset = (page - 1) * limit
  const { rows } = await query(
    `SELECT c.*, u.name AS user_name
     FROM task_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC
     LIMIT $2 OFFSET $3`,
    [taskId, limit, offset]
  )
  return rows.map(toDto)
}

async function addComment(taskId, { content }, actorId) {
  await assertTask(taskId)
  const { rows: [comment] } = await query(
    'INSERT INTO task_comments (task_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
    [taskId, actorId, content]
  )
  activity.logActivity(taskId, actorId, 'comment_added', null, content.slice(0, 30), null)

  const { rows: [full] } = await query(
    'SELECT c.*, u.name AS user_name FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1',
    [comment.id]
  )

  // Notify task stakeholders (assignee + creator) — skip if they are the commenter
  const { rows: [taskInfo] } = await query(
    `SELECT t.title, t.assigned_to, t.created_by, c.name AS company_name
     FROM tasks t LEFT JOIN companies c ON c.id = t.company_id WHERE t.id = $1`,
    [taskId]
  )
  if (taskInfo) {
    const preview = content.length > 80 ? content.slice(0, 80) + '…' : content
    const commentBody = `${full.user_name}: "${preview}"`
    const notified = new Set([actorId])

    const notifyUser = (userId) => {
      if (userId && !notified.has(userId)) {
        notified.add(userId)
        createAndEmit(
          userId, 'task_status_changed',
          `Bình luận mới: "${taskInfo.title}"`,
          commentBody,
          taskId,
        ).catch(() => {})
      }
    }

    notifyUser(taskInfo.assigned_to)
    notifyUser(taskInfo.created_by)
  }

  emitData('data:comment', { taskId, actorId })
  return toDto(full)
}

async function updateComment(taskId, commentId, { content }, actorId, isAdmin) {
  const { rows: [comment] } = await query(
    'SELECT * FROM task_comments WHERE id = $1 AND task_id = $2',
    [commentId, taskId]
  )
  if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 })
  if (comment.user_id !== actorId && !isAdmin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }

  const { rows: [updated] } = await query(
    `UPDATE task_comments
     SET content = $1, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [content, commentId]
  )
  const { rows: [full] } = await query(
    'SELECT c.*, u.name AS user_name FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1',
    [updated.id]
  )
  return toDto(full)
}

async function deleteComment(taskId, commentId, actorId, isAdmin) {
  const { rows: [comment] } = await query(
    'SELECT * FROM task_comments WHERE id = $1 AND task_id = $2',
    [commentId, taskId]
  )
  if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 })
  if (comment.user_id !== actorId && !isAdmin) {
    throw Object.assign(new Error('Forbidden'), { status: 403 })
  }
  await query('DELETE FROM task_comments WHERE id = $1', [commentId])
}

module.exports = { listComments, addComment, updateComment, deleteComment }
