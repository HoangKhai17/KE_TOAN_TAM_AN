const { query } = require('../../config/db')

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertAccess(companyId, user) {
  const { rows: [row] } = await query(
    'SELECT assigned_staff_id FROM companies WHERE id = $1',
    [companyId]
  )
  if (!row) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user?.role === 'admin') return
  if (row.assigned_staff_id !== user.id)
    throw Object.assign(new Error('Bạn không có quyền truy cập công ty này'), { status: 403 })
}

async function assertYearBelongs(yearId, companyId) {
  const { rows: [row] } = await query(
    'SELECT id FROM company_archive_years WHERE id = $1 AND company_id = $2',
    [yearId, companyId]
  )
  if (!row) throw Object.assign(new Error('Year not found'), { status: 404 })
}

const EMPTY_MONTHS = {
  '1': '', '2': '', '3': '', '4': '', '5': '', '6': '',
  '7': '', '8': '', '9': '', '10': '', '11': '', '12': '',
}

function yearToDto(row) {
  return {
    id:        row.id,
    companyId: row.company_id,
    year:      row.year,
    notes:     row.notes     ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function docToDto(row) {
  return {
    id:              row.id,
    yearId:          row.year_id,
    documentType:    row.document_type,
    detail:          row.detail          ?? null,
    months:          row.months          ?? { ...EMPTY_MONTHS },
    extraFields:     row.extra_fields    ?? {},
    notes:           row.notes           ?? null,
    characteristics: row.characteristics ?? null,
    position:        row.position,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

function colToDto(row) {
  return {
    id:        row.id,
    companyId: row.company_id,
    colName:   row.col_name,
    position:  row.position,
    createdAt: row.created_at,
  }
}

// ── Years ─────────────────────────────────────────────────────────────────────

async function listYears(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    'SELECT * FROM company_archive_years WHERE company_id = $1 ORDER BY year DESC',
    [companyId]
  )
  return rows.map(yearToDto)
}

async function createYear(companyId, { year, notes }, user) {
  await assertAccess(companyId, user)
  const { rows: [row] } = await query(
    `INSERT INTO company_archive_years (company_id, year, notes, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [companyId, year, notes ?? null, user.id]
  )
  return yearToDto(row)
}

async function updateYear(companyId, yearId, { notes }, user) {
  await assertAccess(companyId, user)
  const { rows: [row] } = await query(
    `UPDATE company_archive_years
     SET notes = $1
     WHERE id = $2 AND company_id = $3
     RETURNING *`,
    [notes ?? null, yearId, companyId]
  )
  if (!row) throw Object.assign(new Error('Year not found'), { status: 404 })
  return yearToDto(row)
}

async function deleteYear(companyId, yearId, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await query(
    'DELETE FROM company_archive_years WHERE id = $1 AND company_id = $2',
    [yearId, companyId]
  )
  if (!rowCount) throw Object.assign(new Error('Year not found'), { status: 404 })
}

// ── Docs ──────────────────────────────────────────────────────────────────────

async function listDocs(companyId, yearId, user, { page = 1, pageSize = 20 } = {}) {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)
  const offset = (page - 1) * pageSize
  const { rows } = await query(
    `SELECT *, COUNT(*) OVER() AS _total
     FROM company_archive_docs
     WHERE year_id = $1
     ORDER BY position, created_at
     LIMIT $2 OFFSET $3`,
    [yearId, pageSize, offset]
  )
  const total = rows.length > 0 ? parseInt(rows[0]._total, 10) : 0
  return { docs: rows.map(docToDto), total, page, pageSize }
}

async function createDoc(companyId, yearId, data, user) {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)

  const { documentType, detail, months, extraFields, notes, characteristics } = data
  const mergedMonths = { ...EMPTY_MONTHS, ...(months ?? {}) }

  const { rows: [row] } = await query(
    `INSERT INTO company_archive_docs
       (year_id, document_type, detail, months, extra_fields, notes, characteristics, position)
     SELECT $1, $2, $3, $4, $5, $6, $7,
       COALESCE((SELECT MAX(position) + 1 FROM company_archive_docs WHERE year_id = $1), 0)
     RETURNING *`,
    [
      yearId,
      documentType,
      detail          ?? null,
      JSON.stringify(mergedMonths),
      JSON.stringify(extraFields ?? {}),
      notes           ?? null,
      characteristics ?? null,
    ]
  )
  return docToDto(row)
}

async function updateDoc(companyId, yearId, docId, data, user) {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)

  const fieldMap = {
    documentType:    'document_type',
    detail:          'detail',
    notes:           'notes',
    characteristics: 'characteristics',
  }

  const updates = []
  const params  = []

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key] ?? null)
      updates.push(`${col} = $${params.length}`)
    }
  }

  // months: JSONB merge — chỉ ghi đè đúng key được gửi lên
  if (data.months !== undefined) {
    params.push(JSON.stringify(data.months))
    updates.push(`months = months || $${params.length}::jsonb`)
  }

  // extraFields: JSONB merge — cùng pattern với months
  if (data.extraFields !== undefined) {
    params.push(JSON.stringify(data.extraFields))
    updates.push(`extra_fields = extra_fields || $${params.length}::jsonb`)
  }

  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(docId, yearId)
  const { rows: [row] } = await query(
    `UPDATE company_archive_docs
     SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length - 1} AND year_id = $${params.length}
     RETURNING *`,
    params
  )
  if (!row) throw Object.assign(new Error('Doc not found'), { status: 404 })
  return docToDto(row)
}

async function deleteDoc(companyId, yearId, docId, user) {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)
  const { rowCount } = await query(
    'DELETE FROM company_archive_docs WHERE id = $1 AND year_id = $2',
    [docId, yearId]
  )
  if (!rowCount) throw Object.assign(new Error('Doc not found'), { status: 404 })
}

async function reorderDocs(companyId, yearId, items, user) {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)

  await query(
    `UPDATE company_archive_docs AS d
     SET position    = v.pos::int,
         updated_at  = NOW()
     FROM (
       SELECT unnest($1::uuid[]) AS id,
              unnest($2::int[])  AS pos
     ) AS v
     WHERE d.id = v.id AND d.year_id = $3`,
    [
      items.map((i) => i.id),
      items.map((i) => i.position),
      yearId,
    ]
  )
}

// ── Columns ───────────────────────────────────────────────────────────────────

async function listColumns(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    'SELECT * FROM company_archive_columns WHERE company_id = $1 ORDER BY position, created_at',
    [companyId]
  )
  return rows.map(colToDto)
}

async function createColumn(companyId, { colName }, user) {
  await assertAccess(companyId, user)
  const { rows: [row] } = await query(
    `INSERT INTO company_archive_columns (company_id, col_name, position)
     SELECT $1, $2,
       COALESCE((SELECT MAX(position) + 1 FROM company_archive_columns WHERE company_id = $1), 0)
     RETURNING *`,
    [companyId, colName]
  )
  return colToDto(row)
}

async function deleteColumn(companyId, colId, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await query(
    'DELETE FROM company_archive_columns WHERE id = $1 AND company_id = $2',
    [colId, companyId]
  )
  if (!rowCount) throw Object.assign(new Error('Column not found'), { status: 404 })
}

module.exports = {
  listYears,
  createYear,
  updateYear,
  deleteYear,
  listDocs,
  createDoc,
  updateDoc,
  deleteDoc,
  reorderDocs,
  listColumns,
  createColumn,
  deleteColumn,
}
