'use strict'
const { query } = require('../../config/db')

// ─── DTOs ─────────────────────────────────────────────────────────────────────

function toCategoryDto(row) {
  return {
    id:        row.id,
    name:      row.name,
    color:     row.color,
    sortOrder: row.sort_order,
    linkCount: parseInt(row.link_count ?? 0, 10),
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function toLinkDto(row) {
  return {
    id:          row.id,
    title:       row.title,
    url:         row.url ?? null,
    // Mục dạng FILE: url = null, thay bằng thông tin file đính kèm
    file: row.attachment_id
      ? {
          id:        row.attachment_id,
          fileName:  row.att_file_name,
          mimeType:  row.att_mime_type,
          sizeBytes: Number(row.att_size_bytes),
        }
      : null,
    description: row.description ?? null,
    category:    row.category_id
      ? { id: row.category_id, name: row.category_name ?? null, color: row.category_color ?? null }
      : null,
    createdBy:   { id: row.created_by, name: row.creator_name ?? null },
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

async function listCategories() {
  const { rows } = await query(
    `SELECT dc.*,
            COUNT(dl.id)::int AS link_count
     FROM internal_doc_categories dc
     LEFT JOIN internal_doc_links dl ON dl.category_id = dc.id
     GROUP BY dc.id
     ORDER BY dc.sort_order ASC, dc.created_at ASC`
  )
  return rows.map(toCategoryDto)
}

async function createCategory({ name, color, sortOrder }, actorId) {
  const { rows: [row] } = await query(
    `INSERT INTO internal_doc_categories (name, color, sort_order, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, color ?? '#6366f1', sortOrder ?? 0, actorId]
  )
  return toCategoryDto({ ...row, link_count: 0 })
}

async function updateCategory(id, { name, color, sortOrder }) {
  const fields = []
  const params = []
  if (name      !== undefined) { params.push(name);      fields.push(`name = $${params.length}`) }
  if (color     !== undefined) { params.push(color);     fields.push(`color = $${params.length}`) }
  if (sortOrder !== undefined) { params.push(sortOrder); fields.push(`sort_order = $${params.length}`) }

  if (fields.length === 0) throw Object.assign(new Error('Không có gì để cập nhật'), { status: 400 })
  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE internal_doc_categories SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length} RETURNING *`,
    params
  )
  if (!row) throw Object.assign(new Error('Danh mục không tồn tại'), { status: 404 })
  return toCategoryDto(row)
}

async function deleteCategory(id) {
  const { rows: [row] } = await query('SELECT id FROM internal_doc_categories WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Danh mục không tồn tại'), { status: 404 })
  await query('DELETE FROM internal_doc_categories WHERE id = $1', [id])
}

// ─── Links ────────────────────────────────────────────────────────────────────

async function listLinks({ categoryId, search, page = 1, limit = 20 } = {}) {
  const params = []
  const conds  = []

  const safePage  = Math.max(1, parseInt(page, 10)  || 1)
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const offset    = (safePage - 1) * safeLimit

  if (categoryId === 'none') {
    conds.push('dl.category_id IS NULL')
  } else if (categoryId) {
    params.push(categoryId)
    conds.push(`dl.category_id = $${params.length}`)
  }

  if (search) {
    params.push(`%${search}%`)
    conds.push(`(dl.title ILIKE $${params.length} OR dl.url ILIKE $${params.length} OR dl.description ILIKE $${params.length})`)
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

  const { rows } = await query(
    `SELECT dl.*,
            u.name  AS creator_name,
            dc.name AS category_name,
            dc.color AS category_color,
            a.file_name AS att_file_name, a.mime_type AS att_mime_type, a.size_bytes AS att_size_bytes,
            COUNT(*) OVER() AS _total
     FROM internal_doc_links dl
     LEFT JOIN users u  ON u.id  = dl.created_by
     LEFT JOIN internal_doc_categories dc ON dc.id = dl.category_id
     LEFT JOIN attachments a ON a.id = dl.attachment_id
     ${where}
     ORDER BY dc.sort_order NULLS LAST, dc.name NULLS LAST, dl.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, safeLimit, offset]
  )

  const total = parseInt(rows[0]?._total ?? 0, 10)
  return {
    items: rows.map(toLinkDto),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) || 1 },
  }
}

// Một mục = LINK (url) HOẶC FILE (attachmentId) — ràng buộc CHECK ở DB đảm bảo đúng 1 trong 2.
async function createLink({ categoryId, title, url, description, attachmentId }, actorId) {
  const { rows: [row] } = await query(
    `INSERT INTO internal_doc_links (category_id, title, url, description, attachment_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [categoryId ?? null, title, url ?? null, description ?? null, attachmentId ?? null, actorId]
  )
  const { rows: [full] } = await query(
    `SELECT dl.*, u.name AS creator_name, dc.name AS category_name, dc.color AS category_color,
            a.file_name AS att_file_name, a.mime_type AS att_mime_type, a.size_bytes AS att_size_bytes
     FROM internal_doc_links dl
     LEFT JOIN users u  ON u.id  = dl.created_by
     LEFT JOIN internal_doc_categories dc ON dc.id = dl.category_id
     LEFT JOIN attachments a ON a.id = dl.attachment_id
     WHERE dl.id = $1`,
    [row.id]
  )
  return toLinkDto(full)
}

async function updateLink(id, { categoryId, title, url, description }, actorId, isAdmin) {
  const { rows: [existing] } = await query('SELECT * FROM internal_doc_links WHERE id = $1', [id])
  if (!existing) throw Object.assign(new Error('Không tìm thấy link'), { status: 404 })
  if (!isAdmin && existing.created_by !== actorId) {
    throw Object.assign(new Error('Không có quyền sửa link này'), { status: 403 })
  }

  const fields = []
  const params = []
  if (categoryId  !== undefined) { params.push(categoryId ?? null);    fields.push(`category_id = $${params.length}`) }
  if (title       !== undefined) { params.push(title);                 fields.push(`title = $${params.length}`) }
  if (url         !== undefined) { params.push(url);                   fields.push(`url = $${params.length}`) }
  if (description !== undefined) { params.push(description ?? null);   fields.push(`description = $${params.length}`) }

  if (fields.length > 0) {
    params.push(id)
    await query(`UPDATE internal_doc_links SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  }

  const { rows: [full] } = await query(
    `SELECT dl.*, u.name AS creator_name, dc.name AS category_name, dc.color AS category_color,
            a.file_name AS att_file_name, a.mime_type AS att_mime_type, a.size_bytes AS att_size_bytes
     FROM internal_doc_links dl
     LEFT JOIN users u  ON u.id  = dl.created_by
     LEFT JOIN internal_doc_categories dc ON dc.id = dl.category_id
     LEFT JOIN attachments a ON a.id = dl.attachment_id
     WHERE dl.id = $1`,
    [id]
  )
  return toLinkDto(full)
}

async function deleteLink(id, actorId, isAdmin) {
  const { rows: [row] } = await query('SELECT * FROM internal_doc_links WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Không tìm thấy link'), { status: 404 })
  if (!isAdmin && row.created_by !== actorId) {
    throw Object.assign(new Error('Không có quyền xóa link này'), { status: 403 })
  }
  await query('DELETE FROM internal_doc_links WHERE id = $1', [id])

  // Mục dạng FILE → xoá luôn bản ghi attachment + file trên đĩa, không để lại rác
  if (row.attachment_id) {
    const attachments = require('../attachments/attachments.service')
    await attachments.remove(row.attachment_id, { id: actorId, role: isAdmin ? 'admin' : 'staff' })
  }
}

module.exports = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listLinks, createLink, updateLink, deleteLink,
}
