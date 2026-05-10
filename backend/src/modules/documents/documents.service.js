const path       = require('path')
const { query }  = require('../../config/db')
const audit      = require('../../lib/audit')
const activity   = require('../../lib/activity')
const graph      = require('../../config/graph')
const { ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } = require('./documents.schema')

function toDto(row) {
  return {
    id:             row.id,
    companyId:      row.company_id,
    taskId:         row.task_id ?? null,
    fileName:       row.file_name,
    category:       row.category,
    onedriveItemId: row.onedrive_item_id,
    webUrl:         row.web_url,
    sizeBytes:      row.size_bytes ?? null,
    mimeType:       row.mime_type ?? null,
    uploadedBy:     row.uploaded_by,
    uploaderName:   row.uploader_name ?? null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  }
}

function buildOneDrivePath(companyName, year, category) {
  const safeName = companyName.replace(/[\\/:*?"<>|]/g, '_')
  return `/root:/TamAn_Documents/KH_${safeName}/${year}/${category}:`
}

function validateFile(mimetype, originalname, size) {
  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    throw Object.assign(
      new Error(`File type '${mimetype}' is not allowed`),
      { status: 422 }
    )
  }
  const ext = path.extname(originalname).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw Object.assign(
      new Error(`File extension '${ext}' is not allowed`),
      { status: 422 }
    )
  }
  if (size > MAX_FILE_SIZE) {
    throw Object.assign(
      new Error(`File size ${size} bytes exceeds 20MB limit`),
      { status: 422 }
    )
  }
}

async function listDocuments(companyId, { taskId, category, page = 1, limit = 30 } = {}) {
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

  const offset = (page - 1) * limit
  const where  = conditions.join(' AND ')

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM documents d WHERE ${where}`,
    params
  )
  const { rows } = await query(
    `SELECT d.*, u.name AS uploader_name
     FROM documents d
     JOIN users u ON u.id = d.uploaded_by
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

async function uploadDocument(companyId, file, { category = 'khac', taskId }, actorId, ipAddress, userAgent) {
  const { rows: [company] } = await query('SELECT id, name FROM companies WHERE id = $1', [companyId])
  if (!company) throw Object.assign(new Error('Company not found'), { status: 404 })

  validateFile(file.mimetype, file.originalname, file.size)

  // Build OneDrive folder path
  const year        = new Date().getFullYear()
  const folderPath  = buildOneDrivePath(company.name, year, category)
  const uploadUrl   = `${folderPath}/${encodeURIComponent(file.originalname)}:/content`

  // Upload to OneDrive via Graph API
  let oneDriveItem
  try {
    oneDriveItem = await graph.graphRequest('PUT', uploadUrl, {
      headers: { 'Content-Type': file.mimetype },
      data: file.buffer,
      maxBodyLength: MAX_FILE_SIZE + 1024,
    })
  } catch (graphErr) {
    const status = graphErr.response?.status ?? 503
    throw Object.assign(
      new Error(`OneDrive upload failed: ${graphErr.message}`),
      { status }
    )
  }

  // Store metadata in DB
  const { rows: [doc] } = await query(
    `INSERT INTO documents
       (company_id, task_id, file_name, category, onedrive_item_id, web_url, size_bytes, mime_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      companyId,
      taskId || null,
      file.originalname,
      category,
      oneDriveItem.id,
      oneDriveItem.webUrl,
      file.size,
      file.mimetype,
      actorId,
    ]
  )

  if (taskId) {
    activity.logActivity(taskId, actorId, 'file_uploaded', null, file.originalname, { category })
  }

  await audit.log({
    userId: actorId, action: 'document.uploaded',
    targetType: 'documents', targetId: doc.id,
    meta: { fileName: file.originalname, companyId, taskId: taskId || null },
    ipAddress, userAgent,
  })

  const { rows: [full] } = await query(
    'SELECT d.*, u.name AS uploader_name FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = $1',
    [doc.id]
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
  activity.logActivity(taskId, actorId, 'file_uploaded', null, doc.file_name, { documentId })

  const { rows: [full] } = await query(
    'SELECT d.*, u.name AS uploader_name FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = $1',
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

  // Delete from OneDrive
  try {
    await graph.graphRequest('DELETE', `/items/${doc.onedrive_item_id}`)
  } catch (graphErr) {
    // Log but don't block — remove DB record even if OneDrive delete fails
    const logger = require('../../config/logger')
    logger.warn(`[Documents] OneDrive delete failed for item ${doc.onedrive_item_id}: ${graphErr.message}`)
  }

  await query('DELETE FROM documents WHERE id = $1', [documentId])

  await audit.log({
    userId: actorId, action: 'document.deleted',
    targetType: 'documents', targetId: documentId,
    meta: { fileName: doc.file_name, companyId }, ipAddress, userAgent,
  })
}

async function getLinkUrl(companyId, documentId) {
  const { rows: [doc] } = await query(
    'SELECT * FROM documents WHERE id = $1 AND company_id = $2',
    [documentId, companyId]
  )
  if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 })

  // Refresh webUrl via Graph API
  try {
    const item = await graph.graphRequest('GET', `/items/${doc.onedrive_item_id}`)
    if (item.webUrl && item.webUrl !== doc.web_url) {
      await query(
        'UPDATE documents SET web_url = $1, updated_at = NOW() WHERE id = $2',
        [item.webUrl, documentId]
      )
      return item.webUrl
    }
  } catch {
    // Return cached URL on failure
  }
  return doc.web_url
}

module.exports = { listDocuments, uploadDocument, attachToTask, deleteDocument, getLinkUrl }
