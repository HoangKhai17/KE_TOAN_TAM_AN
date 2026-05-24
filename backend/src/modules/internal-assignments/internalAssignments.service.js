'use strict'
const { query }        = require('../../config/db')
const audit            = require('../../lib/audit')
const { createAndEmit } = require('../../lib/notify')

// ─── DTOs ─────────────────────────────────────────────────────────────────────

function toAssignmentDto(row) {
  return {
    id:           row.id,
    title:        row.title,
    description:  row.description ?? null,
    company:      row.company_id ? { id: row.company_id, name: row.company_name ?? null } : null,
    priority:     row.priority,
    deadlineDate: row.deadline_date ? row.deadline_date.toISOString().slice(0, 10) : null,
    status:       row.status,
    createdBy:    { id: row.created_by, name: row.creator_name ?? null },
    sentAt:       row.sent_at ?? null,
    closedAt:     row.closed_at ?? null,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

function toAssigneeDto(row) {
  return {
    userId:      row.user_id,
    name:        row.user_name ?? null,
    status:      row.status,
    acceptedAt:  row.accepted_at  ?? null,
    completedAt: row.completed_at ?? null,
    rejectedAt:  row.rejected_at  ?? null,
    note:        row.note         ?? null,
  }
}

function toCommentDto(row) {
  return {
    id:        row.id,
    user:      { id: row.user_id, name: row.user_name ?? null },
    content:   row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function assertExists(id) {
  const { rows: [row] } = await query('SELECT * FROM internal_assignments WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Phiếu giao việc không tồn tại'), { status: 404 })
  return row
}

async function assertAssignee(assignmentId, userId) {
  const { rows: [row] } = await query(
    'SELECT * FROM internal_assignment_assignees WHERE assignment_id = $1 AND user_id = $2',
    [assignmentId, userId]
  )
  if (!row) throw Object.assign(new Error('Bạn không phải nhân sự thực hiện phiếu này'), { status: 403 })
  return row
}

async function getAssignees(assignmentId) {
  const { rows } = await query(
    `SELECT iaa.*, u.name AS user_name
     FROM internal_assignment_assignees iaa
     JOIN users u ON u.id = iaa.user_id
     WHERE iaa.assignment_id = $1
     ORDER BY iaa.status, u.name`,
    [assignmentId]
  )
  return rows.map(toAssigneeDto)
}

async function getComments(assignmentId) {
  const { rows } = await query(
    `SELECT iac.*, u.name AS user_name
     FROM internal_assignment_comments iac
     JOIN users u ON u.id = iac.user_id
     WHERE iac.assignment_id = $1
     ORDER BY iac.created_at ASC`,
    [assignmentId]
  )
  return rows.map(toCommentDto)
}

function buildAssigneeStats(assignees) {
  const stats = { total: assignees.length, pending: 0, accepted: 0, inProgress: 0, done: 0, rejected: 0 }
  for (const a of assignees) {
    if (a.status === 'pending')     stats.pending++
    else if (a.status === 'accepted')    stats.accepted++
    else if (a.status === 'in_progress') stats.inProgress++
    else if (a.status === 'done')        stats.done++
    else if (a.status === 'rejected')    stats.rejected++
  }
  return stats
}

// ─── List ─────────────────────────────────────────────────────────────────────

async function listAssignments(actorId, actorRole, {
  status, priority, companyId, assigneeId, myStatus,
  search, deadlineFrom, deadlineTo,
  page = 1, limit = 20, sortBy = 'created_at', sortDir = 'desc',
} = {}) {
  const isAdmin = actorRole === 'admin'
  const params  = []
  const conds   = []

  if (isAdmin) {
    if (assigneeId) {
      params.push(assigneeId)
      conds.push(`EXISTS (
        SELECT 1 FROM internal_assignment_assignees iaa2
        WHERE iaa2.assignment_id = ia.id AND iaa2.user_id = $${params.length}
      )`)
    }
  } else {
    // Staff: must be an assignee
    params.push(actorId)
    conds.push(`EXISTS (
      SELECT 1 FROM internal_assignment_assignees iaa2
      WHERE iaa2.assignment_id = ia.id AND iaa2.user_id = $${params.length}
    )`)
    if (myStatus) {
      params.push(myStatus)
      conds.push(`(
        SELECT iaa3.status FROM internal_assignment_assignees iaa3
        WHERE iaa3.assignment_id = ia.id AND iaa3.user_id = $${params.length - 1}
        LIMIT 1
      ) = $${params.length}`)
    }
  }

  if (status) {
    params.push(status)
    conds.push(`ia.status = $${params.length}`)
  }
  if (priority) {
    params.push(priority)
    conds.push(`ia.priority = $${params.length}`)
  }
  if (companyId) {
    params.push(companyId)
    conds.push(`ia.company_id = $${params.length}`)
  }
  if (search) {
    params.push(`%${search}%`)
    conds.push(`ia.title ILIKE $${params.length}`)
  }
  if (deadlineFrom) {
    params.push(deadlineFrom)
    conds.push(`ia.deadline_date >= $${params.length}`)
  }
  if (deadlineTo) {
    params.push(deadlineTo)
    conds.push(`ia.deadline_date <= $${params.length}`)
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const order = `ORDER BY ia.${sortBy} ${sortDir.toUpperCase()}`
  const offset = (page - 1) * limit

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM internal_assignments ia ${where}`, params
  )

  const { rows } = await query(
    `SELECT ia.*,
            u.name  AS creator_name,
            c.name  AS company_name,
            (SELECT json_agg(json_build_object(
               'userId', iaa.user_id, 'name', us.name,
               'status', iaa.status, 'acceptedAt', iaa.accepted_at,
               'completedAt', iaa.completed_at, 'rejectedAt', iaa.rejected_at, 'note', iaa.note
             ) ORDER BY iaa.status, us.name)
             FROM internal_assignment_assignees iaa
             JOIN users us ON us.id = iaa.user_id
             WHERE iaa.assignment_id = ia.id
            ) AS assignees_json
     FROM internal_assignments ia
     JOIN users u ON u.id = ia.created_by
     LEFT JOIN companies c ON c.id = ia.company_id
     ${where}
     ${order}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  const items = rows.map((row) => {
    const assignees = (row.assignees_json ?? []).map((a) => ({
      userId: a.userId, name: a.name, status: a.status,
      acceptedAt: a.acceptedAt ?? null, completedAt: a.completedAt ?? null,
      rejectedAt: a.rejectedAt ?? null, note: a.note ?? null,
    }))
    return { ...toAssignmentDto(row), assignees, assigneeStats: buildAssigneeStats(assignees) }
  })

  return {
    items,
    pagination: { page, limit, total: parseInt(count, 10), totalPages: Math.ceil(count / limit) },
  }
}

// ─── Stats (for dashboard / sidebar badge) ────────────────────────────────────

async function getStats(actorId, actorRole) {
  const isAdmin = actorRole === 'admin'

  if (isAdmin) {
    const { rows } = await query(`
      SELECT status, COUNT(*) AS cnt FROM internal_assignments GROUP BY status
    `)
    const m = Object.fromEntries(rows.map((r) => [r.status, parseInt(r.cnt, 10)]))
    // Count assignments where ALL assignees are rejected
    const { rows: [{ all_rejected }] } = await query(`
      SELECT COUNT(*) AS all_rejected
      FROM internal_assignments ia
      WHERE ia.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM internal_assignment_assignees iaa
          WHERE iaa.assignment_id = ia.id AND iaa.status != 'rejected'
        )
        AND EXISTS (
          SELECT 1 FROM internal_assignment_assignees iaa2
          WHERE iaa2.assignment_id = ia.id
        )
    `)
    return {
      draft: m.draft ?? 0,
      active: m.active ?? 0,
      done: m.done ?? 0,
      cancelled: m.cancelled ?? 0,
      allRejected: parseInt(all_rejected, 10),
    }
  } else {
    const { rows } = await query(`
      SELECT iaa.status, COUNT(*) AS cnt
      FROM internal_assignment_assignees iaa
      JOIN internal_assignments ia ON ia.id = iaa.assignment_id
      WHERE iaa.user_id = $1 AND ia.status = 'active'
      GROUP BY iaa.status
    `, [actorId])
    const m = Object.fromEntries(rows.map((r) => [r.status, parseInt(r.cnt, 10)]))
    return {
      pending:    m.pending    ?? 0,
      accepted:   m.accepted   ?? 0,
      inProgress: m.in_progress ?? 0,
      done:       m.done       ?? 0,
      rejected:   m.rejected   ?? 0,
    }
  }
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

async function getById(id, actorId, actorRole) {
  const row = await assertExists(id)

  if (actorRole !== 'admin') {
    await assertAssignee(id, actorId)
  }

  const { rows: [full] } = await query(
    `SELECT ia.*, u.name AS creator_name, c.name AS company_name
     FROM internal_assignments ia
     JOIN users u ON u.id = ia.created_by
     LEFT JOIN companies c ON c.id = ia.company_id
     WHERE ia.id = $1`,
    [id]
  )

  const [assignees, comments] = await Promise.all([
    getAssignees(id),
    getComments(id),
  ])

  return {
    ...toAssignmentDto(full),
    assignees,
    assigneeStats: buildAssigneeStats(assignees),
    comments,
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

async function createAssignment(data, actorId) {
  const { title, description, companyId, priority, deadlineDate, assigneeIds = [] } = data

  const { rows: [row] } = await query(
    `INSERT INTO internal_assignments
       (title, description, company_id, priority, deadline_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title, description ?? null, companyId ?? null, priority, deadlineDate ?? null, actorId]
  )

  // Pre-populate assignees as pending if provided (still draft — will be activated on send)
  if (assigneeIds.length > 0) {
    await _upsertAssignees(row.id, assigneeIds)
  }

  await audit.log({
    userId: actorId, action: 'internal_assignment.created',
    targetType: 'internal_assignments', targetId: row.id,
    meta: { title },
  })

  return getById(row.id, actorId, 'admin')
}

// ─── Update ───────────────────────────────────────────────────────────────────

async function updateAssignment(id, data, actorId) {
  const row = await assertExists(id)

  if (!['draft', 'active'].includes(row.status)) {
    throw Object.assign(new Error('Chỉ được sửa phiếu ở trạng thái nháp hoặc đang thực hiện'), { status: 422 })
  }

  const fields = []
  const params = []

  const allowed = ['title', 'description', 'priority']
  for (const key of allowed) {
    if (data[key] !== undefined) {
      params.push(data[key])
      fields.push(`${key} = $${params.length}`)
    }
  }
  if (data.companyId !== undefined) {
    params.push(data.companyId ?? null)
    fields.push(`company_id = $${params.length}`)
  }
  if (data.deadlineDate !== undefined) {
    params.push(data.deadlineDate ?? null)
    fields.push(`deadline_date = $${params.length}`)
  }

  if (fields.length > 0) {
    params.push(id)
    await query(
      `UPDATE internal_assignments SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    )
  }

  // Handle assignee changes (only when active or draft)
  if (data.addAssigneeIds?.length > 0) {
    await _upsertAssignees(id, data.addAssigneeIds)
    if (row.status === 'active') {
      for (const uid of data.addAssigneeIds) {
        createAndEmit(uid, 'task_assigned',
          'Phiếu giao việc mới',
          `Bạn vừa được thêm vào phiếu: "${row.title}"`,
          null
        )
      }
    }
  }

  if (data.removeAssigneeIds?.length > 0) {
    // Only allow removing pending or rejected assignees
    const { rows: blocked } = await query(
      `SELECT user_id FROM internal_assignment_assignees
       WHERE assignment_id = $1 AND user_id = ANY($2::uuid[])
         AND status NOT IN ('pending', 'rejected')`,
      [id, data.removeAssigneeIds]
    )
    if (blocked.length > 0) {
      throw Object.assign(
        new Error('Không thể xóa nhân sự đang thực hiện. Chỉ xóa được người chưa tiếp nhận hoặc đã từ chối.'),
        { status: 422 }
      )
    }
    await query(
      `DELETE FROM internal_assignment_assignees
       WHERE assignment_id = $1 AND user_id = ANY($2::uuid[])`,
      [id, data.removeAssigneeIds]
    )
  }

  // Notify existing active assignees about content update (if active)
  if (row.status === 'active' && fields.length > 0) {
    const { rows: activeAssignees } = await query(
      `SELECT user_id FROM internal_assignment_assignees
       WHERE assignment_id = $1 AND status NOT IN ('done', 'rejected')`,
      [id]
    )
    const updatedTitle = data.title ?? row.title
    for (const { user_id } of activeAssignees) {
      createAndEmit(user_id, 'task_status_changed',
        'Phiếu giao việc được cập nhật',
        `Nội dung phiếu "${updatedTitle}" đã được cập nhật`,
        null
      )
    }
  }

  await audit.log({
    userId: actorId, action: 'internal_assignment.updated',
    targetType: 'internal_assignments', targetId: id, meta: { changes: data },
  })

  return getById(id, actorId, 'admin')
}

async function _upsertAssignees(assignmentId, userIds) {
  if (!userIds?.length) return
  const values = userIds.map((_, i) => `($1, $${i + 2})`).join(', ')
  await query(
    `INSERT INTO internal_assignment_assignees (assignment_id, user_id)
     VALUES ${values}
     ON CONFLICT (assignment_id, user_id) DO UPDATE SET status = 'pending', rejected_at = NULL, note = NULL`,
    [assignmentId, ...userIds]
  )
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteAssignment(id, actorId) {
  const row = await assertExists(id)
  if (row.status !== 'draft') {
    throw Object.assign(new Error('Chỉ xóa được phiếu ở trạng thái nháp'), { status: 422 })
  }
  await query('DELETE FROM internal_assignments WHERE id = $1', [id])
  await audit.log({
    userId: actorId, action: 'internal_assignment.deleted',
    targetType: 'internal_assignments', targetId: id, meta: { title: row.title },
  })
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function sendAssignment(id, actorId) {
  const row = await assertExists(id)
  if (row.status !== 'draft') {
    throw Object.assign(new Error('Chỉ gửi được phiếu ở trạng thái nháp'), { status: 422 })
  }

  const { rows: assignees } = await query(
    'SELECT user_id FROM internal_assignment_assignees WHERE assignment_id = $1',
    [id]
  )
  if (assignees.length === 0) {
    throw Object.assign(new Error('Phiếu phải có ít nhất 1 nhân sự thực hiện trước khi gửi'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignments SET status = 'active', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  )

  for (const { user_id } of assignees) {
    createAndEmit(user_id, 'task_assigned',
      'Phiếu giao việc mới',
      `Bạn có phiếu giao việc mới: "${row.title}"`,
      null
    )
  }

  await audit.log({
    userId: actorId, action: 'internal_assignment.sent',
    targetType: 'internal_assignments', targetId: id,
  })

  return getById(id, actorId, 'admin')
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

async function cancelAssignment(id, actorId) {
  const row = await assertExists(id)
  if (!['draft', 'active'].includes(row.status)) {
    throw Object.assign(new Error('Không thể hủy phiếu ở trạng thái này'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignments SET status = 'cancelled', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  )

  // Notify assignees who haven't finished
  if (row.status === 'active') {
    const { rows: assignees } = await query(
      `SELECT user_id FROM internal_assignment_assignees
       WHERE assignment_id = $1 AND status NOT IN ('done', 'rejected')`,
      [id]
    )
    for (const { user_id } of assignees) {
      createAndEmit(user_id, 'task_status_changed',
        'Phiếu giao việc đã bị hủy',
        `Phiếu "${row.title}" đã bị hủy`,
        null
      )
    }
  }

  await audit.log({
    userId: actorId, action: 'internal_assignment.cancelled',
    targetType: 'internal_assignments', targetId: id,
  })
}

// ─── Close ────────────────────────────────────────────────────────────────────

async function closeAssignment(id, actorId) {
  const row = await assertExists(id)
  if (row.status !== 'active') {
    throw Object.assign(new Error('Chỉ đóng được phiếu đang thực hiện'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignments SET status = 'done', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id]
  )

  await audit.log({
    userId: actorId, action: 'internal_assignment.closed',
    targetType: 'internal_assignments', targetId: id,
  })
}

// ─── Staff actions ────────────────────────────────────────────────────────────

async function acceptAssignment(id, actorId) {
  const row     = await assertExists(id)
  if (row.status !== 'active') throw Object.assign(new Error('Phiếu không còn hoạt động'), { status: 422 })
  const assignee = await assertAssignee(id, actorId)
  if (assignee.status !== 'pending') {
    throw Object.assign(new Error('Bạn đã phản hồi phiếu này rồi'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignment_assignees
     SET status = 'accepted', accepted_at = NOW()
     WHERE assignment_id = $1 AND user_id = $2`,
    [id, actorId]
  )
  await audit.log({ userId: actorId, action: 'internal_assignment.accepted', targetType: 'internal_assignments', targetId: id })
  return getById(id, actorId, 'staff')
}

async function progressAssignment(id, actorId) {
  const row     = await assertExists(id)
  if (row.status !== 'active') throw Object.assign(new Error('Phiếu không còn hoạt động'), { status: 422 })
  const assignee = await assertAssignee(id, actorId)
  if (assignee.status !== 'accepted') {
    throw Object.assign(new Error('Bạn cần tiếp nhận phiếu trước'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignment_assignees
     SET status = 'in_progress'
     WHERE assignment_id = $1 AND user_id = $2`,
    [id, actorId]
  )
  await audit.log({ userId: actorId, action: 'internal_assignment.in_progress', targetType: 'internal_assignments', targetId: id })
  return getById(id, actorId, 'staff')
}

async function completeAssignment(id, actorId, note) {
  const row     = await assertExists(id)
  if (row.status !== 'active') throw Object.assign(new Error('Phiếu không còn hoạt động'), { status: 422 })
  const assignee = await assertAssignee(id, actorId)
  if (!['accepted', 'in_progress'].includes(assignee.status)) {
    throw Object.assign(new Error('Bạn cần tiếp nhận phiếu trước khi báo hoàn thành'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignment_assignees
     SET status = 'done', completed_at = NOW(), note = $3
     WHERE assignment_id = $1 AND user_id = $2`,
    [id, actorId, note ?? null]
  )

  // Notify admin
  const { rows: [creator] } = await query(
    `SELECT ia.created_by, u.name AS staff_name
     FROM internal_assignments ia
     JOIN users u ON u.id = $2
     WHERE ia.id = $1`,
    [id, actorId]
  )
  if (creator) {
    createAndEmit(creator.created_by, 'task_status_changed',
      'Phiếu giao việc hoàn thành',
      `${creator.staff_name} đã hoàn thành phiếu: "${row.title}"`,
      null
    )
  }

  await audit.log({ userId: actorId, action: 'internal_assignment.completed', targetType: 'internal_assignments', targetId: id })
  return getById(id, actorId, 'staff')
}

async function rejectAssignment(id, actorId, note) {
  const row     = await assertExists(id)
  if (row.status !== 'active') throw Object.assign(new Error('Phiếu không còn hoạt động'), { status: 422 })
  const assignee = await assertAssignee(id, actorId)
  if (!['pending', 'accepted'].includes(assignee.status)) {
    throw Object.assign(new Error('Không thể từ chối ở trạng thái hiện tại'), { status: 422 })
  }

  await query(
    `UPDATE internal_assignment_assignees
     SET status = 'rejected', rejected_at = NOW(), note = $3
     WHERE assignment_id = $1 AND user_id = $2`,
    [id, actorId, note]
  )

  // Notify admin
  const { rows: [creator] } = await query(
    `SELECT ia.created_by, u.name AS staff_name
     FROM internal_assignments ia
     JOIN users u ON u.id = $2
     WHERE ia.id = $1`,
    [id, actorId]
  )
  if (creator) {
    createAndEmit(creator.created_by, 'task_status_changed',
      'Phiếu giao việc bị từ chối',
      `${creator.staff_name} đã từ chối phiếu: "${row.title}". Lý do: ${note}`,
      null
    )
  }

  // Check if ALL assignees are now rejected → extra notify
  const { rows: [{ all_rej }] } = await query(
    `SELECT COUNT(*) FILTER (WHERE status != 'rejected') AS all_rej
     FROM internal_assignment_assignees WHERE assignment_id = $1`,
    [id]
  )
  if (parseInt(all_rej, 10) === 0 && creator) {
    createAndEmit(creator.created_by, 'task_status_changed',
      'Tất cả nhân sự đã từ chối',
      `Tất cả nhân sự được giao đều đã từ chối phiếu: "${row.title}"`,
      null
    )
  }

  await audit.log({ userId: actorId, action: 'internal_assignment.rejected', targetType: 'internal_assignments', targetId: id, meta: { note } })
  return getById(id, actorId, 'staff')
}

// ─── Comments ─────────────────────────────────────────────────────────────────

async function addComment(id, actorId, actorRole, content) {
  await assertExists(id)
  if (actorRole !== 'admin') await assertAssignee(id, actorId)

  const { rows: [comment] } = await query(
    `INSERT INTO internal_assignment_comments (assignment_id, user_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [id, actorId, content]
  )

  const { rows: [full] } = await query(
    `SELECT iac.*, u.name AS user_name FROM internal_assignment_comments iac
     JOIN users u ON u.id = iac.user_id WHERE iac.id = $1`,
    [comment.id]
  )
  return toCommentDto(full)
}

async function deleteComment(assignmentId, commentId, actorId, actorRole) {
  const { rows: [comment] } = await query(
    'SELECT * FROM internal_assignment_comments WHERE id = $1 AND assignment_id = $2',
    [commentId, assignmentId]
  )
  if (!comment) throw Object.assign(new Error('Comment không tồn tại'), { status: 404 })
  if (actorRole !== 'admin' && comment.user_id !== actorId) {
    throw Object.assign(new Error('Bạn chỉ có thể xóa comment của mình'), { status: 403 })
  }
  await query('DELETE FROM internal_assignment_comments WHERE id = $1', [commentId])
}

module.exports = {
  listAssignments, getStats, getById,
  createAssignment, updateAssignment, deleteAssignment,
  sendAssignment, cancelAssignment, closeAssignment,
  acceptAssignment, progressAssignment, completeAssignment, rejectAssignment,
  addComment, deleteComment,
}
