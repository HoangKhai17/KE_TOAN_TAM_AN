const { query } = require('../../config/db')

function toDto(row) {
  return {
    id:        row.id,
    companyId: row.company_id,
    content:   row.content,
    severity:  row.severity,
    isPinned:  row.is_pinned,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Admin: toàn quyền. Staff: chỉ lưu ý của công ty MÌNH phụ trách.
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập lưu ý của công ty này'), { status: 403 })
  }
}

async function listNotes(companyId, user) {
  await assertCompanyAccess(companyId, user)
  // Ghim lên đầu, sau đó theo thứ tự thủ công rồi thời gian tạo
  const { rows } = await query(
    `SELECT * FROM company_important_notes
      WHERE company_id = $1
      ORDER BY is_pinned DESC, sort_order ASC, created_at ASC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createNote(companyId, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { content, severity = 'normal', isPinned = false, sortOrder } = data
  const order = sortOrder ?? Number((await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_important_notes WHERE company_id = $1', [companyId]
  )).rows[0].next)
  const { rows: [row] } = await query(
    `INSERT INTO company_important_notes
       (company_id, content, severity, is_pinned, sort_order, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$6)
     RETURNING *`,
    [companyId, content, severity, isPinned, order, actorId]
  )
  return toDto(row)
}

async function updateNote(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { rows: [existing] } = await query(
    'SELECT id FROM company_important_notes WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!existing) throw Object.assign(new Error('Note not found'), { status: 404 })

  const map = {
    content: 'content', severity: 'severity', isPinned: 'is_pinned', sortOrder: 'sort_order',
  }
  const updates = ['updated_by = $1', 'updated_at = NOW()']
  const params  = [actorId]
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE company_important_notes SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return toDto(row)
}

async function deleteNote(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT id FROM company_important_notes WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Note not found'), { status: 404 })
  await query('DELETE FROM company_important_notes WHERE id = $1', [id])
}

module.exports = { listNotes, createNote, updateNote, deleteNote }
