'use strict'
const { query }    = require('../../config/db')
const storage      = require('../../lib/storage')
const { getModule, assertEntityExists } = require('./attachments.registry')

function toDto(row) {
  return {
    id:           row.id,
    module:       row.module,
    entityId:     row.entity_id,
    fileName:     row.file_name,
    mimeType:     row.mime_type,
    sizeBytes:    Number(row.size_bytes),
    title:        row.title ?? row.file_name,
    description:  row.description ?? null,
    uploadedBy:   row.uploaded_by,
    uploadedByName: row.uploader_name ?? null,
    createdAt:    row.created_at,
  }
}

// Ném 403 nếu user không được đọc. Hỗ trợ cả canRead đồng bộ lẫn async.
async function assertCanRead(mod, att, user) {
  const allowed = await mod.canRead(att, user)
  if (!allowed) throw Object.assign(new Error('Bạn không có quyền xem file này'), { status: 403 })
}

async function list(module, entityId, user) {
  const mod = getModule(module)
  await assertCanRead(mod, { module, entity_id: entityId }, user)
  const { rows } = await query(
    `SELECT a.*, u.name AS uploader_name
       FROM attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE a.module = $1 AND a.entity_id = $2
      ORDER BY a.created_at DESC`,
    [module, entityId]
  )
  return rows.map(toDto)
}

// file = req.file (multer đã ghi ra đĩa + đã qua whitelist & magic bytes)
async function create(module, entityId, file, { title, description } = {}, userId) {
  await assertEntityExists(module, entityId)
  try {
    const { rows: [row] } = await query(
      `INSERT INTO attachments
         (module, entity_id, file_name, storage_path, mime_type, size_bytes, title, description, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        module, entityId,
        file.originalname,
        storage.toRelative(file.path),
        file.mimetype,
        file.size,
        title?.trim() || null,
        description?.trim() || null,
        userId,
      ]
    )
    return toDto(row)
  } catch (err) {
    storage.removeFile(storage.toRelative(file.path)) // DB lỗi → không để lại file rác
    throw err
  }
}

async function getForDownload(id, user) {
  const { rows: [row] } = await query('SELECT * FROM attachments WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Không tìm thấy file'), { status: 404 })

  // Chống IDOR: biết id chưa đủ, phải được module cho phép đọc
  await assertCanRead(getModule(row.module), row, user)

  return { row, absPath: storage.toAbsolute(row.storage_path) }
}

async function remove(id, user) {
  const { rows: [row] } = await query('SELECT * FROM attachments WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Không tìm thấy file'), { status: 404 })

  const mod = getModule(row.module)
  if (!mod.canDelete(row, user)) {
    throw Object.assign(new Error('Bạn không có quyền xoá file này'), { status: 403 })
  }

  await query('DELETE FROM attachments WHERE id = $1', [id])
  storage.removeFile(row.storage_path) // xoá DB xong mới xoá file trên đĩa
}

module.exports = { list, create, getForDownload, remove }
