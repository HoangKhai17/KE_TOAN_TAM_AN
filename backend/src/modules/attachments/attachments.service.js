'use strict'
const { query }    = require('../../config/db')
const storage      = require('../../lib/storage')
const { getModule, assertEntityExists } = require('./attachments.registry')

function toDto(row) {
  return {
    id:           row.id,
    module:       row.module,
    entityId:     row.entity_id,
    fieldKey:     row.field_key ?? null,
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

async function list(module, entityId, user, { fieldKey } = {}) {
  const mod = getModule(module)
  await assertCanRead(mod, { module, entity_id: entityId }, user)
  const params = [module, entityId]
  let where = 'a.module = $1 AND a.entity_id = $2'
  if (fieldKey) { params.push(fieldKey); where += ` AND a.field_key = $${params.length}` }
  const { rows } = await query(
    `SELECT a.*, u.name AS uploader_name
       FROM attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
      WHERE ${where}
      ORDER BY a.created_at DESC`,
    params
  )
  return rows.map(toDto)
}

// file = req.file (multer đã ghi ra đĩa + đã qua whitelist & magic bytes)
// fieldKey: chỉ dùng cho module 'company_table_row' (phân biệt cột file trong 1 dòng)
async function create(module, entityId, file, { title, description, fieldKey } = {}, userId) {
  await assertEntityExists(module, entityId)
  try {
    const { rows: [row] } = await query(
      `INSERT INTO attachments
         (module, entity_id, field_key, file_name, storage_path, mime_type, size_bytes, title, description, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        module, entityId,
        fieldKey?.trim() || null,
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

// Dọn TẤT CẢ file của một entity (gọi nội bộ khi xoá bản ghi cha — vd xoá địa điểm).
// KHÔNG kiểm tra quyền: phía gọi đã kiểm tra quyền trên bản ghi cha.
async function removeAllForEntity(module, entityId) {
  const { rows } = await query(
    'SELECT id, storage_path FROM attachments WHERE module = $1 AND entity_id = $2',
    [module, entityId]
  )
  if (rows.length === 0) return
  await query('DELETE FROM attachments WHERE module = $1 AND entity_id = $2', [module, entityId])
  for (const r of rows) storage.removeFile(r.storage_path)
}

// Dọn file của NHIỀU entity cùng lúc (vd xoá cả bảng tùy chỉnh → nhiều dòng).
async function removeAllForEntities(module, entityIds) {
  if (!entityIds || entityIds.length === 0) return
  const { rows } = await query(
    'SELECT id, storage_path FROM attachments WHERE module = $1 AND entity_id = ANY($2)',
    [module, entityIds]
  )
  if (rows.length === 0) return
  await query('DELETE FROM attachments WHERE module = $1 AND entity_id = ANY($2)', [module, entityIds])
  for (const r of rows) storage.removeFile(r.storage_path)
}

// Dọn file của một FIELD trên nhiều entity (vd xoá 1 cột file → chỉ file cột đó, giữ cột khác).
async function removeAllForField(module, entityIds, fieldKey) {
  if (!entityIds || entityIds.length === 0) return
  const { rows } = await query(
    'SELECT id, storage_path FROM attachments WHERE module = $1 AND entity_id = ANY($2) AND field_key = $3',
    [module, entityIds, fieldKey]
  )
  if (rows.length === 0) return
  await query('DELETE FROM attachments WHERE module = $1 AND entity_id = ANY($2) AND field_key = $3',
    [module, entityIds, fieldKey])
  for (const r of rows) storage.removeFile(r.storage_path)
}

module.exports = { list, create, getForDownload, remove, removeAllForEntity, removeAllForEntities, removeAllForField }
