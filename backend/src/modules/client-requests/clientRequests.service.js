'use strict'
const crypto = require('crypto')
const { query } = require('../../config/db')
const { createAndEmit, emitData } = require('../../lib/notify')
const { sendMail } = require('../../utils/mailer')
const logger = require('../../config/logger')

// ── Status enum constants ──────────────────────────────────────────────────────
const STATUS = Object.freeze({
  PENDING:      'pending',
  RECEIVED:     'received',
  OVERDUE:      'overdue',
  NOT_REQUIRED: 'not_required',
})

function toDto(row) {
  return {
    id:                 row.id,
    taskId:             row.task_id ?? null,
    taskTitle:          row.task_title ?? null,
    companyId:          row.company_id,
    companyName:        row.company_name ?? null,
    requestedBy:        row.requested_by,
    requestedByName:    row.requested_by_name ?? null,
    documentName:       row.document_name,
    description:        row.description ?? null,
    periodLabel:        row.period_label ?? null,
    deadlineDate:       row.deadline_date ?? null,
    status:             row.status,
    receivedAt:         row.received_at ?? null,
    receivedBy:         row.received_by ?? null,
    receivedByName:     row.received_by_name ?? null,
    reminderSentCount:  row.reminder_sent_count,
    lastReminderAt:     row.last_reminder_at ?? null,
    remindedEmail:      row.reminded_email ?? null,
    contactEmail:       row.reminded_email ?? null,
    hasPublicLink:      !!row.public_token,
    publicToken:        row.public_token ?? null,
    tokenExpiresAt:     row.token_expires_at ?? null,
    tokenSubmittedAt:   row.token_submitted_at ?? null,
    tokenSubmittedData: row.token_submitted_data ?? null,
    notes:              row.notes ?? null,
    collaborators:      Array.isArray(row.collaborators) ? row.collaborators : [],
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

// ── Người hỗ trợ (collaborators) cho CDR ────────────────────────────────────────
// Diff insert/delete; loại trùng + loại OWNER (requested_by). Trả { toAdd, toRemove }.
async function syncCdrCollaborators(requestId, collaboratorIds, ownerId, actorId) {
  const desired = [...new Set((collaboratorIds || []).filter(Boolean))].filter((id) => id !== ownerId)
  const desiredSet = new Set(desired)

  const { rows: cur } = await query(
    'SELECT user_id FROM client_request_collaborators WHERE request_id = $1', [requestId]
  )
  const current = new Set(cur.map((r) => r.user_id))

  const toAdd    = desired.filter((id) => !current.has(id))
  const toRemove = [...current].filter((id) => !desiredSet.has(id))

  for (const uid of toAdd) {
    await query(
      `INSERT INTO client_request_collaborators (request_id, user_id, added_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [requestId, uid, actorId]
    )
  }
  if (toRemove.length) {
    await query(
      'DELETE FROM client_request_collaborators WHERE request_id = $1 AND user_id = ANY($2::uuid[])',
      [requestId, toRemove]
    )
  }
  return { toAdd, toRemove }
}

async function notifyCdrCollaboratorChanges({ toAdd, toRemove }, item, actorId) {
  const jobs = []
  const label = `"${item.documentName}" — ${item.companyName || ''}`
  for (const uid of toAdd) {
    if (uid === actorId) continue
    jobs.push(createAndEmit(uid, 'task_assigned', 'Bạn được thêm hỗ trợ yêu cầu KH', label, item.taskId ?? null))
  }
  for (const uid of toRemove) {
    if (uid === actorId) continue
    jobs.push(createAndEmit(uid, 'task_status_changed', 'Bạn không còn hỗ trợ yêu cầu KH', `${label} — bạn đã được gỡ khỏi danh sách hỗ trợ`, item.taskId ?? null))
  }
  await Promise.all(jobs)
}

const CDR_COLS = `
  cdr.*,
  t.title  AS task_title,
  c.name   AS company_name,
  rb.name  AS requested_by_name,
  rcv.name AS received_by_name,
  COALESCE((
    SELECT json_agg(json_build_object('id', ucc.id, 'name', ucc.name) ORDER BY ucc.name)
    FROM client_request_collaborators crc JOIN users ucc ON ucc.id = crc.user_id
    WHERE crc.request_id = cdr.id
  ), '[]'::json) AS collaborators`

const CDR_FROM = `
  FROM client_document_requests cdr
  LEFT JOIN tasks     t   ON t.id   = cdr.task_id
  LEFT JOIN companies c   ON c.id   = cdr.company_id
  LEFT JOIN users     rb  ON rb.id  = cdr.requested_by
  LEFT JOIN users     rcv ON rcv.id = cdr.received_by`

const CDR_SELECT = `SELECT ${CDR_COLS} ${CDR_FROM}`

async function listClientRequests(filters = {}) {
  const {
    page = 1, limit = 20,
    companyId, taskId, requestedBy, status, deadlineDateFrom, deadlineDateTo,
    search,
    sortBy = 'created_at', sortDir = 'desc',
    staffScopeId, collaboratorIds,
  } = filters

  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  // Phạm vi nhân sự: CDR mình tạo (requested_by) HOẶC mình được nhờ HỖ TRỢ.
  if (staffScopeId) {
    params.push(staffScopeId)
    const p = params.length
    conditions.push(
      `(cdr.requested_by = $${p} OR EXISTS (SELECT 1 FROM client_request_collaborators crc WHERE crc.request_id = cdr.id AND crc.user_id = $${p}))`
    )
  }
  // Lọc "CV hỗ trợ": chỉ CDR mà 1 trong các user chỉ định là NGƯỜI HỖ TRỢ.
  const collabArr = collaboratorIds == null
    ? null
    : (Array.isArray(collaboratorIds) ? collaboratorIds : String(collaboratorIds).split(',').map((x) => x.trim()).filter(Boolean))
  if (collabArr && collabArr.length) {
    params.push(collabArr)
    conditions.push(`EXISTS (SELECT 1 FROM client_request_collaborators crc WHERE crc.request_id = cdr.id AND crc.user_id = ANY($${params.length}::uuid[]))`)
  }

  if (companyId) {
    const arr = Array.isArray(companyId) ? companyId : String(companyId).split(',').map((x) => x.trim()).filter(Boolean)
    if (arr.length) { params.push(arr); conditions.push(`cdr.company_id = ANY($${params.length}::uuid[])`) }
  }
  if (taskId)      { params.push(taskId);       conditions.push(`cdr.task_id = $${params.length}`) }
  if (requestedBy) {
    const arr = Array.isArray(requestedBy) ? requestedBy : String(requestedBy).split(',').map((x) => x.trim()).filter(Boolean)
    if (arr.length) { params.push(arr); conditions.push(`cdr.requested_by = ANY($${params.length}::uuid[])`) }
  }
  if (status) {
    const arr = Array.isArray(status) ? status : [status]
    params.push(arr)
    conditions.push(`cdr.status = ANY($${params.length}::client_doc_status[])`)
  }
  if (deadlineDateFrom && deadlineDateTo) {
    params.push(deadlineDateTo)
    conditions.push(`cdr.created_at::date <= $${params.length}`)
    params.push(deadlineDateFrom)
    conditions.push(`(cdr.deadline_date IS NULL OR cdr.deadline_date >= $${params.length})`)
  } else if (deadlineDateFrom) {
    params.push(deadlineDateFrom)
    conditions.push(`(cdr.deadline_date IS NULL OR cdr.deadline_date >= $${params.length})`)
  } else if (deadlineDateTo) {
    params.push(deadlineDateTo)
    conditions.push(`cdr.created_at::date <= $${params.length}`)
  }
  if (search) {
    const idx = params.length + 1
    params.push(`%${search}%`)
    conditions.push(`(cdr.document_name ILIKE $${idx} OR cdr.reminded_email ILIKE $${idx})`)
  }

  const where = conditions.join(' AND ')

  const SORT_COLS = {
    created_at:    'cdr.created_at',
    deadline_date: 'cdr.deadline_date',
    updated_at:    'cdr.updated_at',
    document_name: 'cdr.document_name',
  }
  const orderBy = `${SORT_COLS[sortBy] || 'cdr.created_at'} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`

  const { rows } = await query(
    `SELECT ${CDR_COLS}, COUNT(*) OVER() AS _total
     ${CDR_FROM}
     WHERE ${where}
     ORDER BY ${orderBy}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  const total = parseInt(rows[0]?._total ?? 0, 10)
  return {
    items: rows.map(toDto),
    pagination: {
      total,
      page:       parseInt(page, 10),
      limit:      parseInt(limit, 10),
      totalPages: Math.ceil(total / limit),
    },
  }
}

async function getById(id) {
  const { rows } = await query(`${CDR_SELECT} WHERE cdr.id = $1`, [id])
  if (!rows[0]) throw Object.assign(new Error('Client request not found'), { status: 404 })
  return toDto(rows[0])
}

async function createClientRequest(data, requestedBy) {
  const {
    companyId, taskId = null, documentName, description = null,
    periodLabel = null, deadlineDate = null, remindedEmail = null, notes = null,
    collaboratorIds,
  } = data

  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Công ty không tồn tại'), { status: 404 })

  if (taskId) {
    const { rows: [task] } = await query('SELECT id FROM tasks WHERE id = $1', [taskId])
    if (!task) throw Object.assign(new Error('Task không tồn tại'), { status: 404 })
  }

  const { rows: [row] } = await query(
    `INSERT INTO client_document_requests
       (company_id, task_id, requested_by, document_name, description,
        period_label, deadline_date, reminded_email, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [companyId, taskId, requestedBy, documentName, description ?? null,
     periodLabel ?? null, deadlineDate ?? null, remindedEmail ?? null, notes ?? null]
  )

  // Người hỗ trợ ban đầu (nếu có) — owner = requestedBy, tự loại khỏi danh sách.
  if (Array.isArray(collaboratorIds) && collaboratorIds.length) {
    const changes = await syncCdrCollaborators(row.id, collaboratorIds, requestedBy, requestedBy)
    const withCollab = await getById(row.id)
    await notifyCdrCollaboratorChanges(changes, withCollab, requestedBy)
    emitData('data:cdr', { action: 'created', id: withCollab.id })
    return withCollab
  }

  const item = await getById(row.id)
  emitData('data:cdr', { action: 'created', id: item.id })
  return item
}

async function updateClientRequest(id, data, actorId = null) {
  const fieldMap = {
    documentName:  'document_name',
    description:   'description',
    periodLabel:   'period_label',
    deadlineDate:  'deadline_date',
    taskId:        'task_id',
    remindedEmail: 'reminded_email',
    contactEmail:  'reminded_email',
    notes:         'notes',
  }

  const fields = []
  const params = []

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (camel in data) {
      params.push(data[camel] ?? null)
      fields.push(`${snake} = $${params.length}`)
    }
  }

  const wantsCollab = data.collaboratorIds !== undefined
  if (!fields.length && !wantsCollab) throw Object.assign(new Error('No fields to update'), { status: 422 })

  // Cần owner (requested_by) để loại khỏi danh sách hỗ trợ + xác nhận tồn tại
  const { rows: [existing] } = await query('SELECT requested_by FROM client_document_requests WHERE id = $1', [id])
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })

  if (fields.length) {
    params.push(new Date())
    fields.push(`updated_at = $${params.length}`)
    params.push(id)
    await query(
      `UPDATE client_document_requests SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params
    )
  }

  // Đồng bộ người hỗ trợ (nếu client gửi collaboratorIds)
  let changes = { toAdd: [], toRemove: [] }
  if (wantsCollab) {
    changes = await syncCdrCollaborators(id, data.collaboratorIds, existing.requested_by, actorId ?? existing.requested_by)
  }

  const item = await getById(id)
  if (changes.toAdd.length || changes.toRemove.length) {
    await notifyCdrCollaboratorChanges(changes, item, actorId ?? existing.requested_by)
  }
  emitData('data:cdr', { action: 'updated', id })
  return item
}

async function deleteClientRequest(id, userId, isAdmin = false) {
  const { rows: [row] } = await query(
    'SELECT id, requested_by FROM client_document_requests WHERE id = $1', [id]
  )
  if (!row) throw Object.assign(new Error('Client request not found'), { status: 404 })
  if (!isAdmin && row.requested_by !== userId) {
    throw Object.assign(new Error('Bạn không có quyền xóa yêu cầu này'), { status: 403 })
  }
  await query('DELETE FROM client_document_requests WHERE id = $1', [id])
  emitData('data:cdr', { action: 'deleted', id })
}

async function receiveClientRequest(id, receivedBy) {
  const { rows: [existing] } = await query(
    'SELECT id, status FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })
  if (existing.status === 'received') {
    throw Object.assign(new Error('Yêu cầu đã được đánh dấu nhận rồi'), { status: 409 })
  }

  await query(
    `UPDATE client_document_requests
     SET status = $1, received_at = NOW(), received_by = $2, updated_at = NOW()
     WHERE id = $3`,
    [STATUS.RECEIVED, receivedBy, id]
  )

  const item = await getById(id)
  emitData('data:cdr', { action: 'updated', id })
  return item
}

async function unreceiveClientRequest(id) {
  const { rows: [existing] } = await query(
    'SELECT id, status FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })
  if (existing.status !== STATUS.RECEIVED) {
    throw Object.assign(new Error('Chỉ có thể hoàn tác trạng thái "đã nhận"'), { status: 409 })
  }

  await query(
    `UPDATE client_document_requests
     SET status = $1, received_at = NULL, received_by = NULL, updated_at = NOW()
     WHERE id = $2`,
    [STATUS.PENDING, id]
  )

  const item = await getById(id)
  emitData('data:cdr', { action: 'updated', id })
  return item
}

async function dismissClientRequest(id) {
  const { rows: [existing] } = await query(
    'SELECT id FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })

  await query(
    `UPDATE client_document_requests
     SET status = $1, updated_at = NOW()
     WHERE id = $2`,
    [STATUS.NOT_REQUIRED, id]
  )

  const item = await getById(id)
  emitData('data:cdr', { action: 'updated', id })
  return item
}

async function sendReminder(id, { email, message } = {}) {
  const { rows: [row] } = await query(
    `SELECT cdr.id, cdr.document_name, cdr.deadline_date, cdr.reminded_email,
            cdr.requested_by, c.name AS company_name
     FROM client_document_requests cdr
     JOIN companies c ON c.id = cdr.company_id
     WHERE cdr.id = $1`,
    [id]
  )
  if (!row) throw Object.assign(new Error('Client request not found'), { status: 404 })

  const toEmail = email || row.reminded_email
  if (!toEmail) throw Object.assign(new Error('Chưa có email nhắc nhở, vui lòng cung cấp email'), { status: 422 })

  const deadlineStr = row.deadline_date
    ? new Date(row.deadline_date).toLocaleDateString('vi-VN')
    : 'chưa có hạn'
  const bodyText = message || `Kính gửi, vui lòng cung cấp tài liệu "${row.document_name}" trước ${deadlineStr}.`

  await sendMail({
    to:      toEmail,
    subject: `[Nhắc nhở] Tài liệu yêu cầu: ${row.document_name}`,
    html:    `<p>${bodyText}</p>`,
    text:    bodyText,
  })

  await query(
    `UPDATE client_document_requests
     SET reminder_sent_count = reminder_sent_count + 1,
         last_reminder_at = NOW(),
         reminded_email = $1,
         updated_at = NOW()
     WHERE id = $2`,
    [toEmail, id]
  )

  return getById(id)
}

async function generateLink(id, { expiresInDays = 30 } = {}) {
  const { rows: [existing] } = await query(
    'SELECT id FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })

  const token     = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  await query(
    `UPDATE client_document_requests
     SET public_token = $1, token_expires_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [token, expiresAt, id]
  )

  return { token, expiresAt, publicUrl: `/public/form/${token}` }
}

async function revokeLink(id) {
  const { rows: [existing] } = await query(
    'SELECT id FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })

  await query(
    `UPDATE client_document_requests
     SET public_token = NULL, token_expires_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id]
  )
}

async function getPublicForm(token) {
  const { rows: [row] } = await query(
    `SELECT cdr.id, cdr.document_name, cdr.description, cdr.period_label,
            cdr.deadline_date, cdr.status, cdr.token_expires_at,
            cdr.token_submitted_at, c.name AS company_name
     FROM client_document_requests cdr
     JOIN companies c ON c.id = cdr.company_id
     WHERE cdr.public_token = $1`,
    [token]
  )

  if (!row) throw Object.assign(new Error('Link không hợp lệ hoặc không tồn tại'), { status: 404 })
  if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
    throw Object.assign(new Error('Link đã hết hạn'), { status: 410 })
  }

  return {
    id:               row.id,
    documentName:     row.document_name,
    description:      row.description ?? null,
    periodLabel:      row.period_label ?? null,
    deadlineDate:     row.deadline_date ?? null,
    status:           row.status,
    companyName:      row.company_name,
    alreadySubmitted: !!row.token_submitted_at,
  }
}

async function submitPublicForm(token, data) {
  const { rows: [row] } = await query(
    `SELECT id, status, token_expires_at, token_submitted_at, requested_by,
            document_name,
            (SELECT name FROM companies WHERE id = cdr2.company_id) AS company_name
     FROM client_document_requests cdr2
     WHERE public_token = $1`,
    [token]
  )

  if (!row) throw Object.assign(new Error('Link không hợp lệ'), { status: 404 })
  if (row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
    throw Object.assign(new Error('Link đã hết hạn'), { status: 410 })
  }
  if (row.token_submitted_at) {
    throw Object.assign(new Error('Biểu mẫu này đã được gửi rồi'), { status: 409 })
  }

  const submittedData = {
    contact_name:  data.contactName,
    phone:         data.phone,
    description:   data.description,
    shared_links:  data.sharedLinks,
    notes:         data.notes ?? null,
  }

  await query(
    `UPDATE client_document_requests
     SET token_submitted_at   = NOW(),
         token_submitted_data = $1::jsonb,
         status               = 'received',
         received_at          = NOW(),
         public_token         = NULL,
         token_expires_at     = NULL,
         updated_at           = NOW()
     WHERE id = $2`,
    [JSON.stringify(submittedData), row.id]
  )

  createAndEmit(
    row.requested_by,
    'client_doc_submitted',
    `Khách hàng đã gửi tài liệu: "${row.document_name}"`,
    `Tài liệu "${row.document_name}" (${row.company_name}) vừa được khách hàng cung cấp qua form.`,
    row.id,
  ).catch(() => {})

  return { success: true }
}

async function getAdminOverview(filters = {}) {
  const { companyId, periodLabel, deadlineDateFrom, deadlineDateTo } = filters

  const conditions = ['1=1']
  const params = []

  if (companyId)        { params.push(companyId);        conditions.push(`cdr.company_id = $${params.length}`) }
  if (periodLabel)      { params.push(periodLabel);      conditions.push(`cdr.period_label = $${params.length}`) }
  if (deadlineDateFrom && deadlineDateTo) {
    params.push(deadlineDateTo)
    conditions.push(`cdr.created_at::date <= $${params.length}`)
    params.push(deadlineDateFrom)
    conditions.push(`(cdr.deadline_date IS NULL OR cdr.deadline_date >= $${params.length})`)
  } else if (deadlineDateFrom) {
    params.push(deadlineDateFrom)
    conditions.push(`(cdr.deadline_date IS NULL OR cdr.deadline_date >= $${params.length})`)
  } else if (deadlineDateTo) {
    params.push(deadlineDateTo)
    conditions.push(`cdr.created_at::date <= $${params.length}`)
  }

  const where = conditions.join(' AND ')

  const [{ rows: statRows }, { rows: upcomingRows }] = await Promise.all([
    query(
      `SELECT
         COUNT(*) FILTER (WHERE cdr.status = 'pending')      AS pending,
         COUNT(*) FILTER (WHERE cdr.status = 'received')     AS received,
         COUNT(*) FILTER (WHERE cdr.status = 'overdue')      AS overdue,
         COUNT(*) FILTER (WHERE cdr.status = 'not_required') AS not_required,
         COUNT(*) AS total
       FROM client_document_requests cdr
       WHERE ${where}`,
      params
    ),
    query(
      `SELECT cdr.*,
              t.title  AS task_title,
              c.name   AS company_name,
              rb.name  AS requested_by_name,
              rcv.name AS received_by_name
       FROM client_document_requests cdr
       LEFT JOIN tasks     t   ON t.id   = cdr.task_id
       LEFT JOIN companies c   ON c.id   = cdr.company_id
       LEFT JOIN users     rb  ON rb.id  = cdr.requested_by
       LEFT JOIN users     rcv ON rcv.id = cdr.received_by
       WHERE ${where}
         AND cdr.status = 'pending'
         AND cdr.deadline_date IS NOT NULL
         AND cdr.deadline_date <= (CURRENT_DATE + INTERVAL '7 days')
       ORDER BY cdr.deadline_date ASC
       LIMIT 10`,
      params
    ),
  ])

  const stats = statRows[0]
  return {
    stats: {
      total:       parseInt(stats.total, 10),
      pending:     parseInt(stats.pending, 10),
      received:    parseInt(stats.received, 10),
      overdue:     parseInt(stats.overdue, 10),
      notRequired: parseInt(stats.not_required, 10),
    },
    upcomingDeadlines: upcomingRows.map(toDto),
  }
}

async function manualSubmit(id, data, submittedBy) {
  const { rows: [row] } = await query(
    'SELECT id FROM client_document_requests WHERE id = $1', [id]
  )
  if (!row) throw Object.assign(new Error('Client request not found'), { status: 404 })

  const submittedData = {
    contact_name:  data.contactName ?? null,
    phone:         data.phone ?? null,
    description:   data.description ?? null,
    shared_links:  data.sharedLinks ?? [],
    notes:         data.notes ?? null,
    submitted_via: 'manual',
  }

  const params = [JSON.stringify(submittedData)]
  const setClauses = [
    `token_submitted_data = $${params.length}`,
    `token_submitted_at = NOW()`,
    `updated_at = NOW()`,
  ]

  if (data.markReceived) {
    params.push(submittedBy)
    setClauses.push(
      `status = 'received'`,
      `received_at = NOW()`,
      `received_by = $${params.length}`,
    )
  }

  params.push(id)
  await query(
    `UPDATE client_document_requests SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
    params
  )
  return getById(id)
}

async function countPendingByTask(taskId) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*) AS cnt FROM client_document_requests
     WHERE task_id = $1 AND status = 'pending'`,
    [taskId]
  )
  return parseInt(r.cnt, 10)
}

async function getStats(filters = {}) {
  const { companyId, requestedBy, search, deadlineDateFrom, deadlineDateTo, staffScopeId, collaboratorIds } = filters
  const conditions = ['1=1']
  const params = []

  if (companyId)   { params.push(companyId);  conditions.push(`company_id = $${params.length}`) }
  if (requestedBy) { params.push(requestedBy); conditions.push(`requested_by = $${params.length}`) }
  // Phạm vi nhân sự (danh sách + tile số đếm phải khớp): CDR mình tạo HOẶC mình hỗ trợ.
  if (staffScopeId) {
    params.push(staffScopeId)
    const p = params.length
    conditions.push(`(requested_by = $${p} OR EXISTS (SELECT 1 FROM client_request_collaborators crc WHERE crc.request_id = client_document_requests.id AND crc.user_id = $${p}))`)
  }
  const collabArr = collaboratorIds == null
    ? null
    : (Array.isArray(collaboratorIds) ? collaboratorIds : String(collaboratorIds).split(',').map((x) => x.trim()).filter(Boolean))
  if (collabArr && collabArr.length) {
    params.push(collabArr)
    conditions.push(`EXISTS (SELECT 1 FROM client_request_collaborators crc WHERE crc.request_id = client_document_requests.id AND crc.user_id = ANY($${params.length}::uuid[]))`)
  }
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(document_name ILIKE $${params.length} OR reminded_email ILIKE $${params.length})`)
  }
  if (deadlineDateFrom && deadlineDateTo) {
    params.push(deadlineDateTo);   conditions.push(`created_at::date <= $${params.length}`)
    params.push(deadlineDateFrom); conditions.push(`(deadline_date IS NULL OR deadline_date >= $${params.length})`)
  } else if (deadlineDateFrom) {
    params.push(deadlineDateFrom); conditions.push(`(deadline_date IS NULL OR deadline_date >= $${params.length})`)
  } else if (deadlineDateTo) {
    params.push(deadlineDateTo);   conditions.push(`created_at::date <= $${params.length}`)
  }

  const { rows: [r] } = await query(
    `SELECT
       COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE status = 'pending')           AS pending,
       COUNT(*) FILTER (WHERE status = 'received')          AS received,
       COUNT(*) FILTER (WHERE status = 'overdue')           AS overdue,
       COUNT(*) FILTER (WHERE status = 'not_required')      AS not_required
     FROM client_document_requests
     WHERE ${conditions.join(' AND ')}`,
    params
  )
  return {
    total:       parseInt(r.total, 10),
    pending:     parseInt(r.pending, 10),
    received:    parseInt(r.received, 10),
    overdue:     parseInt(r.overdue, 10),
    notRequired: parseInt(r.not_required, 10),
  }
}

async function getAvailableYears() {
  const { rows } = await query(
    `SELECT DISTINCT EXTRACT(YEAR FROM deadline_date)::int AS year
     FROM client_document_requests
     WHERE deadline_date IS NOT NULL
     ORDER BY year DESC`
  )
  return rows.map((r) => r.year)
}

module.exports = {
  listClientRequests,
  getById,
  createClientRequest,
  updateClientRequest,
  deleteClientRequest,
  receiveClientRequest,
  unreceiveClientRequest,
  dismissClientRequest,
  sendReminder,
  generateLink,
  revokeLink,
  manualSubmit,
  getPublicForm,
  submitPublicForm,
  getAdminOverview,
  getStats,
  countPendingByTask,
  getAvailableYears,
}
