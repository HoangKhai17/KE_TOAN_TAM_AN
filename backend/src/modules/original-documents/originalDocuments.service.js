const { query } = require('../../config/db')

function toDto(row) {
  return {
    id:        row.id,
    companyId: row.company_id,
    name:      row.name,
    note:      row.note ?? null,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Admin: toàn quyền. Staff: chỉ hồ sơ của công ty MÌNH phụ trách. (giống document-types)
async function assertCompanyAccess(companyId, user) {
  const { rows: [c] } = await query('SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId])
  if (!c) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user && user.role !== 'admin' && c.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập hồ sơ của công ty này'), { status: 403 })
  }
}

async function listOriginalDocuments(companyId, user) {
  await assertCompanyAccess(companyId, user)
  const { rows } = await query(
    `SELECT * FROM company_original_documents
      WHERE company_id = $1
      ORDER BY sort_order ASC, created_at ASC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createOriginalDocument(companyId, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { name, note, sortOrder } = data
  const order = sortOrder ?? Number((await query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM company_original_documents WHERE company_id = $1', [companyId]
  )).rows[0].next)
  const { rows: [row] } = await query(
    `INSERT INTO company_original_documents
       (company_id, name, note, sort_order, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$5)
     RETURNING *`,
    [companyId, name, note ?? null, order, actorId]
  )
  return toDto(row)
}

async function updateOriginalDocument(companyId, id, data, user) {
  await assertCompanyAccess(companyId, user)
  const actorId = user.id
  const { rows: [existing] } = await query(
    'SELECT id FROM company_original_documents WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!existing) throw Object.assign(new Error('Original document not found'), { status: 404 })

  const map = {
    name: 'name', note: 'note', sortOrder: 'sort_order',
  }
  const updates = ['updated_by = $1', 'updated_at = NOW()']
  const params  = [actorId]
  for (const [key, col] of Object.entries(map)) {
    if (data[key] !== undefined) {
      params.push(data[key] === '' ? null : data[key])
      updates.push(`${col} = $${params.length}`)
    }
  }
  params.push(id)
  const { rows: [row] } = await query(
    `UPDATE company_original_documents SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return toDto(row)
}

async function deleteOriginalDocument(companyId, id, user) {
  await assertCompanyAccess(companyId, user)
  const { rows: [row] } = await query(
    'SELECT id FROM company_original_documents WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Original document not found'), { status: 404 })
  await query('DELETE FROM company_original_documents WHERE id = $1', [id])
}

module.exports = {
  listOriginalDocuments, createOriginalDocument, updateOriginalDocument, deleteOriginalDocument,
}
