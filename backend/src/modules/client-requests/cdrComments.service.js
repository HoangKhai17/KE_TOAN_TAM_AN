'use strict'
const { query } = require('../../config/db')
const { createAndEmit, emitData } = require('../../lib/notify')

function toDto(row) {
  return {
    id:        row.id,
    requestId: row.request_id,
    userId:    row.user_id,
    userName:  row.user_name ?? null,
    content:   row.content,
    isEdited:  row.is_edited,
    editedAt:  row.edited_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function assertRequest(requestId) {
  const { rows } = await query('SELECT id FROM client_document_requests WHERE id = $1', [requestId])
  if (!rows[0]) throw Object.assign(new Error('Client request not found'), { status: 404 })
}

async function listComments(requestId, { page = 1, limit = 50 } = {}) {
  await assertRequest(requestId)
  const offset = (page - 1) * limit
  const { rows } = await query(
    `SELECT c.*, u.name AS user_name
     FROM client_request_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.request_id = $1
     ORDER BY c.created_at ASC
     LIMIT $2 OFFSET $3`,
    [requestId, limit, offset],
  )
  return rows.map(toDto)
}

async function addComment(requestId, { content }, actorId) {
  await assertRequest(requestId)
  const { rows: [comment] } = await query(
    'INSERT INTO client_request_comments (request_id, user_id, content) VALUES ($1,$2,$3) RETURNING *',
    [requestId, actorId, content],
  )
  const { rows: [full] } = await query(
    'SELECT c.*, u.name AS user_name FROM client_request_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1',
    [comment.id],
  )

  // Báo cho người phụ trách + người hỗ trợ (trừ người vừa bình luận)
  const { rows: [info] } = await query(
    'SELECT document_name, requested_by FROM client_document_requests WHERE id = $1',
    [requestId],
  )
  if (info) {
    const preview = content.length > 80 ? content.slice(0, 80) + '…' : content
    const body = `${full.user_name}: "${preview}"`
    const notified = new Set([actorId])
    const notifyUser = (userId) => {
      if (userId && !notified.has(userId)) {
        notified.add(userId)
        // notification_type không có 'client_request' và task_id là FK→tasks, nên dùng type hợp lệ + task_id null
        createAndEmit(userId, 'task_status_changed', `Bình luận mới (Yêu cầu KH): "${info.document_name}"`, body, null).catch(() => {})
      }
    }
    notifyUser(info.requested_by)
    const { rows: collabs } = await query(
      'SELECT user_id FROM client_request_collaborators WHERE request_id = $1', [requestId],
    )
    for (const c of collabs) notifyUser(c.user_id)
    // Nhân viên bình luận → báo tất cả admin
    const { rows: [actor] } = await query('SELECT role FROM users WHERE id = $1', [actorId])
    if (actor?.role === 'staff') {
      const { rows: admins } = await query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'")
      for (const a of admins) notifyUser(a.id)
    }
  }

  emitData('data:cdr_comment', { requestId, actorId })
  return toDto(full)
}

async function updateComment(requestId, commentId, { content }, actorId, isAdmin) {
  const { rows: [comment] } = await query(
    'SELECT * FROM client_request_comments WHERE id = $1 AND request_id = $2',
    [commentId, requestId],
  )
  if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 })
  if (comment.user_id !== actorId && !isAdmin) throw Object.assign(new Error('Forbidden'), { status: 403 })

  const { rows: [updated] } = await query(
    `UPDATE client_request_comments
     SET content = $1, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [content, commentId],
  )
  const { rows: [full] } = await query(
    'SELECT c.*, u.name AS user_name FROM client_request_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1',
    [updated.id],
  )
  emitData('data:cdr_comment', { requestId, actorId })
  return toDto(full)
}

async function deleteComment(requestId, commentId, actorId, isAdmin) {
  const { rows: [comment] } = await query(
    'SELECT * FROM client_request_comments WHERE id = $1 AND request_id = $2',
    [commentId, requestId],
  )
  if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 })
  if (comment.user_id !== actorId && !isAdmin) throw Object.assign(new Error('Forbidden'), { status: 403 })
  await query('DELETE FROM client_request_comments WHERE id = $1', [commentId])
  emitData('data:cdr_comment', { requestId, actorId })
}

module.exports = { listComments, addComment, updateComment, deleteComment }
