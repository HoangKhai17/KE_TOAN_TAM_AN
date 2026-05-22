'use strict'
const crypto = require('crypto')
const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')
const { sendMail } = require('../../utils/mailer')
const logger = require('../../config/logger')

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
    hasPublicLink:      !!row.public_token,
    tokenExpiresAt:     row.token_expires_at ?? null,
    tokenSubmittedAt:   row.token_submitted_at ?? null,
    tokenSubmittedData: row.token_submitted_data ?? null,
    notes:              row.notes ?? null,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  }
}

const CDR_SELECT = `
  SELECT cdr.*,
         t.title  AS task_title,
         c.name   AS company_name,
         rb.name  AS requested_by_name,
         rcv.name AS received_by_name
  FROM client_document_requests cdr
  LEFT JOIN tasks     t   ON t.id   = cdr.task_id
  LEFT JOIN companies c   ON c.id   = cdr.company_id
  LEFT JOIN users     rb  ON rb.id  = cdr.requested_by
  LEFT JOIN users     rcv ON rcv.id = cdr.received_by`

async function listClientRequests(filters = {}) {
  const {
    page = 1, limit = 20,
    companyId, taskId, status, deadlineDateFrom, deadlineDateTo,
    sortBy = 'created_at', sortDir = 'desc',
  } = filters

  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  if (companyId)        { params.push(companyId);        conditions.push(`cdr.company_id = $${params.length}`) }
  if (taskId)           { params.push(taskId);           conditions.push(`cdr.task_id = $${params.length}`) }
  if (status) {
    const arr = Array.isArray(status) ? status : [status]
    params.push(arr)
    conditions.push(`cdr.status = ANY($${params.length}::client_doc_status[])`)
  }
  if (deadlineDateFrom) { params.push(deadlineDateFrom); conditions.push(`cdr.deadline_date >= $${params.length}`) }
  if (deadlineDateTo)   { params.push(deadlineDateTo);   conditions.push(`cdr.deadline_date <= $${params.length}`) }

  const where = conditions.join(' AND ')

  const SORT_COLS = {
    created_at:    'cdr.created_at',
    deadline_date: 'cdr.deadline_date',
    updated_at:    'cdr.updated_at',
    document_name: 'cdr.document_name',
  }
  const orderBy = `${SORT_COLS[sortBy] || 'cdr.created_at'} ${sortDir === 'asc' ? 'ASC' : 'DESC'}`

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `${CDR_SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM client_document_requests cdr WHERE ${where}`, params),
  ])

  const total = parseInt(countRows[0].count, 10)
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

  return getById(row.id)
}

async function updateClientRequest(id, data) {
  const fieldMap = {
    documentName:  'document_name',
    description:   'description',
    periodLabel:   'period_label',
    deadlineDate:  'deadline_date',
    taskId:        'task_id',
    remindedEmail: 'reminded_email',
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

  if (!fields.length) throw Object.assign(new Error('No fields to update'), { status: 422 })

  params.push(new Date())
  fields.push(`updated_at = $${params.length}`)
  params.push(id)

  const { rowCount } = await query(
    `UPDATE client_document_requests SET ${fields.join(', ')} WHERE id = $${params.length}`,
    params
  )
  if (!rowCount) throw Object.assign(new Error('Client request not found'), { status: 404 })

  return getById(id)
}

async function deleteClientRequest(id) {
  const { rowCount } = await query('DELETE FROM client_document_requests WHERE id = $1', [id])
  if (!rowCount) throw Object.assign(new Error('Client request not found'), { status: 404 })
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
     SET status = 'received', received_at = NOW(), received_by = $1, updated_at = NOW()
     WHERE id = $2`,
    [receivedBy, id]
  )

  return getById(id)
}

async function unreceiveClientRequest(id) {
  const { rows: [existing] } = await query(
    'SELECT id, status FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })
  if (existing.status !== 'received') {
    throw Object.assign(new Error('Chỉ có thể hoàn tác trạng thái "đã nhận"'), { status: 409 })
  }

  await query(
    `UPDATE client_document_requests
     SET status = 'pending', received_at = NULL, received_by = NULL, updated_at = NOW()
     WHERE id = $1`,
    [id]
  )

  return getById(id)
}

async function dismissClientRequest(id) {
  const { rows: [existing] } = await query(
    'SELECT id FROM client_document_requests WHERE id = $1', [id]
  )
  if (!existing) throw Object.assign(new Error('Client request not found'), { status: 404 })

  await query(
    `UPDATE client_document_requests
     SET status = 'not_required', updated_at = NOW()
     WHERE id = $1`,
    [id]
  )

  return getById(id)
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
    contact_name: data.contactName,
    phone:        data.phone,
    description:  data.description,
    shared_link:  data.sharedLink,
    notes:        data.notes ?? null,
  }

  await query(
    `UPDATE client_document_requests
     SET token_submitted_at   = NOW(),
         token_submitted_data = $1::jsonb,
         status               = 'received',
         received_at          = NOW(),
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
  if (deadlineDateFrom) { params.push(deadlineDateFrom); conditions.push(`cdr.deadline_date >= $${params.length}`) }
  if (deadlineDateTo)   { params.push(deadlineDateTo);   conditions.push(`cdr.deadline_date <= $${params.length}`) }

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

async function countPendingByTask(taskId) {
  const { rows: [r] } = await query(
    `SELECT COUNT(*) AS cnt FROM client_document_requests
     WHERE task_id = $1 AND status = 'pending'`,
    [taskId]
  )
  return parseInt(r.cnt, 10)
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
  getPublicForm,
  submitPublicForm,
  getAdminOverview,
  countPendingByTask,
}
