const { query }  = require('../../config/db')
const audit      = require('../../lib/audit')
const activity   = require('../../lib/activity')
const attachments = require('../attachments/attachments.service')

function toDto(row) {
  return {
    id:          row.id,
    companyId:   row.company_id,
    taskId:      row.task_id ?? null,
    name:        row.name,
    url:         row.url ?? null,
    category:    row.category,
    // Tài liệu là LINK hoặc FILE. Với file thì url = null và có khối `file`
    // để giao diện hiện tên/kích thước và nút tải xuống.
    attachmentId: row.attachment_id ?? null,
    file: row.attachment_id ? {
      id:         row.attachment_id,
      fileName:   row.file_name ?? null,
      sizeBytes:  row.size_bytes != null ? Number(row.size_bytes) : null,
      mimeType:   row.mime_type ?? null,
    } : null,
    description: row.description ?? null,
    addedBy:     row.uploaded_by,
    addedByName: row.uploader_name ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

async function listDocuments(companyId, { taskId, category, search, page = 1, limit = 30 } = {}) {
  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  const conditions = ['d.company_id = $1']
  const params     = [companyId]

  if (taskId !== undefined) {
    if (taskId === null || taskId === 'null') {
      conditions.push('d.task_id IS NULL')
    } else {
      params.push(taskId)
      conditions.push(`d.task_id = $${params.length}`)
    }
  }
  if (category) {
    params.push(category)
    conditions.push(`d.category = $${params.length}`)
  }
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(d.name ILIKE $${params.length} OR d.description ILIKE $${params.length})`)
  }

  const offset = (page - 1) * limit
  const where  = conditions.join(' AND ')

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM documents d WHERE ${where}`,
    params
  )
  const { rows } = await query(
    `SELECT d.*, u.name AS uploader_name,
            a.file_name, a.size_bytes, a.mime_type
     FROM documents d
     JOIN users u ON u.id = d.uploaded_by
     LEFT JOIN attachments a ON a.id = d.attachment_id
     WHERE ${where}
     ORDER BY d.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  return {
    documents: rows.map(toDto),
    pagination: { page, limit, total: parseInt(count, 10), totalPages: Math.ceil(count / limit) },
  }
}

async function addDocumentLink(companyId, { name, url, attachmentId, category = 'khac', description, taskId }, actorId, ipAddress, userAgent) {
  const { rows: [company] } = await query('SELECT id FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  if (taskId) {
    const { rows: [task] } = await query(
      'SELECT id FROM tasks WHERE id = $1 AND company_id = $2',
      [taskId, companyId]
    )
    if (!task) throw Object.assign(new Error('Task not found or does not belong to this company'), { status: 404 })
  }

  // Tài liệu là LINK hoặc FILE, không phải cả hai (ràng buộc documents_url_or_file).
  // Với file: kiểm tra bản ghi đính kèm đúng là của công ty này — chặn việc gắn
  // nhầm (hoặc cố ý gắn) file của công ty khác vào đây.
  if (attachmentId) {
    const { rows: [att] } = await query(
      "SELECT id FROM attachments WHERE id = $1 AND module = 'company' AND entity_id = $2",
      [attachmentId, companyId]
    )
    if (!att) throw Object.assign(new Error('File đính kèm không hợp lệ'), { status: 400 })
  }

  const { rows: [doc] } = await query(
    `INSERT INTO documents (company_id, task_id, name, url, attachment_id, category, description, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [companyId, taskId || null, name, attachmentId ? null : url, attachmentId || null,
     category, description || null, actorId]
  )

  if (taskId) {
    activity.logActivity(taskId, actorId, 'file_uploaded', null, name, { category })
  }

  await audit.log({
    userId: actorId, action: 'document.added',
    targetType: 'documents', targetId: doc.id,
    meta: { name, companyId, taskId: taskId || null },
    ipAddress, userAgent,
  })

  const { rows: [full] } = await query(
    `SELECT d.*, u.name AS uploader_name, a.file_name, a.size_bytes, a.mime_type
       FROM documents d
       JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN attachments a ON a.id = d.attachment_id
      WHERE d.id = $1`,
    [doc.id]
  )
  return toDto(full)
}

async function updateDocumentLink(companyId, documentId, updates, actorId) {
  const { rows: [doc] } = await query(
    'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
    [documentId, companyId]
  )
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  const fields = []
  const params = []
  const allowed = ['name', 'url', 'category', 'description']
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      params.push(updates[key])
      fields.push(`${key} = $${params.length}`)
    }
  }
  if (fields.length === 0) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(documentId)
  const { rows: [updated] } = await query(
    `UPDATE documents SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  )

  const { rows: [full] } = await query(
    `SELECT d.*, u.name AS uploader_name, a.file_name, a.size_bytes, a.mime_type
       FROM documents d
       JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN attachments a ON a.id = d.attachment_id
      WHERE d.id = $1`,
    [updated.id]
  )
  return toDto(full)
}

async function attachToTask(companyId, documentId, { taskId }, actorId) {
  const { rows: [doc] } = await query(
    'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
    [documentId, companyId]
  )
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  const { rows: [task] } = await query(
    'SELECT id FROM tasks WHERE id = $1 AND company_id = $2',
    [taskId, companyId]
  )
  if (!task) throw Object.assign(new Error('Task not found or does not belong to this company'), { status: 404 })

  const { rows: [updated] } = await query(
    'UPDATE documents SET task_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [taskId, documentId]
  )
  activity.logActivity(taskId, actorId, 'file_uploaded', null, doc.name, { documentId })

  const { rows: [full] } = await query(
    `SELECT d.*, u.name AS uploader_name, a.file_name, a.size_bytes, a.mime_type
       FROM documents d
       JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN attachments a ON a.id = d.attachment_id
      WHERE d.id = $1`,
    [updated.id]
  )
  return toDto(full)
}

async function deleteDocument(companyId, documentId, actorId, ipAddress, userAgent) {
  const { rows: [doc] } = await query(
    'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
    [documentId, companyId]
  )
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  await query('DELETE FROM documents WHERE id = $1', [documentId])

  // Tài liệu là FILE → xoá luôn bản ghi đính kèm và file trên đĩa, tránh để lại
  // file mồ côi không ai truy cập được nhưng vẫn chiếm chỗ.
  if (doc.attachment_id) {
    try {
      await attachments.remove(doc.attachment_id, { id: actorId, role: 'admin' })
    } catch (err) {
      // Không chặn việc xoá tài liệu chỉ vì dọn file thất bại
      require('../../config/logger').warn('[Documents] Không xoá được file đính kèm', {
        attachmentId: doc.attachment_id, error: err.message,
      })
    }
  }

  await audit.log({
    userId: actorId, action: 'document.deleted',
    targetType: 'documents', targetId: documentId,
    meta: { name: doc.name, companyId }, ipAddress, userAgent,
  })
}

module.exports = { listDocuments, addDocumentLink, updateDocumentLink, attachToTask, deleteDocument }
