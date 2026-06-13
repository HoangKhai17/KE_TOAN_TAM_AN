const { query, getClient } = require('../../config/db')
const ExcelJS   = require('exceljs')

const MONTHS_ARR = ['1','2','3','4','5','6','7','8','9','10','11','12']

function countFilledMonths(months) {
  if (!months) return 0
  return MONTHS_ARR.filter((m) => (months[m] ?? '').trim() !== '').length
}

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
    colType:   row.col_type ?? 'text',
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

async function createColumn(companyId, { colName, colType = 'text' }, user) {
  await assertAccess(companyId, user)
  const { rows: [row] } = await query(
    `INSERT INTO company_archive_columns (company_id, col_name, col_type, position)
     SELECT $1, $2, $3,
       COALESCE((SELECT MAX(position) + 1 FROM company_archive_columns WHERE company_id = $1), 0)
     RETURNING *`,
    [companyId, colName, colType]
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

// ── Export ────────────────────────────────────────────────────────────────────

async function exportDocs(companyId, yearId, user, fieldsParam = '') {
  await assertAccess(companyId, user)
  await assertYearBelongs(yearId, companyId)

  const [{ rows: docRows }, { rows: colRows }, companyRes, yearRes] = await Promise.all([
    query(
      'SELECT * FROM company_archive_docs WHERE year_id = $1 ORDER BY position, created_at',
      [yearId]
    ),
    query(
      'SELECT * FROM company_archive_columns WHERE company_id = $1 ORDER BY position, created_at',
      [companyId]
    ),
    query(
      `SELECT c.name, u.name AS staff_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.assigned_staff_id
       WHERE c.id = $1`,
      [companyId]
    ),
    query('SELECT year FROM company_archive_years WHERE id = $1', [yearId]),
  ])

  const docs              = docRows.map(docToDto)
  const dynCols           = colRows.map(colToDto)
  const companyName       = companyRes.rows[0]?.name      ?? ''
  const assignedStaffName = companyRes.rows[0]?.staff_name ?? ''
  const yearValue         = yearRes.rows[0]?.year          ?? ''

  const requested = fieldsParam
    ? new Set(fieldsParam.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const include = (key) => !requested || requested.has(key)

  const wsCols = [
    include('stt')           && { header: 'STT',            key: 'stt',           width: 6  },
    include('companyName')   && { header: 'Tên công ty',    key: 'companyName',   width: 30 },
    include('assignedStaff') && { header: 'NV phụ trách',   key: 'assignedStaff', width: 22 },
    include('documentType')  && { header: 'Loại chứng từ',  key: 'documentType',  width: 36 },
    include('detail')        && { header: 'Chi tiết',       key: 'detail',        width: 24 },
    ...MONTHS_ARR.filter((m) => include(`month__${m}`)).map((m) => ({
      header: `T${m}`, key: `month__${m}`, width: 7,
    })),
    include('totalMonths')     && { header: 'Tổng tháng',  key: 'totalMonths',     width: 11 },
    include('notes')           && { header: 'Ghi chú',     key: 'notes',           width: 30 },
    include('characteristics') && { header: 'Đặc điểm',   key: 'characteristics', width: 24 },
    ...dynCols
      .filter((col) => include(`ext__${col.colName}`))
      .map((col) => ({ header: col.colName, key: `ext__${col.colName}`, width: 20 })),
  ].filter(Boolean)

  function getCellValue(doc, key, idx) {
    if (key === 'companyName')     return companyName
    if (key === 'assignedStaff')   return assignedStaffName
    if (key === 'stt')             return idx + 1
    if (key === 'documentType')    return doc.documentType    ?? ''
    if (key === 'detail')          return doc.detail          ?? ''
    if (key === 'notes')           return doc.notes           ?? ''
    if (key === 'characteristics') return doc.characteristics ?? ''
    if (key === 'totalMonths')     return countFilledMonths(doc.months)
    if (key.startsWith('month__')) return (doc.months?.[key.slice(7)] ?? '').trim()
    if (key.startsWith('ext__'))   return doc.extraFields?.[key.slice(5)] ?? ''
    return ''
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet(`HS LT ${yearValue}`)
  ws.columns = wsCols

  const headerRow = ws.getRow(1)
  headerRow.font      = { bold: true }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height    = 22

  docs.forEach((doc, idx) => {
    const rowData = Object.fromEntries(wsCols.map((col) => [col.key, getCellValue(doc, col.key, idx)]))
    const row     = ws.addRow(rowData)
    row.alignment = { vertical: 'top', wrapText: true }
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' },
      }
    })
  })

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    }
  })

  return { wb, companyName, yearValue }
}

// ── Batch import ──────────────────────────────────────────────────────────────

async function batchCreateDocs(companyId, user, rows) {
  await assertAccess(companyId, user)
  const client = await getClient()
  let inserted = 0, failed = 0
  const errors = []
  const yearCache = {}

  try {
    await client.query('BEGIN')
    for (let i = 0; i < rows.length; i++) {
      const sp = `sp_${i}`
      await client.query(`SAVEPOINT ${sp}`)
      try {
        const row = rows[i]
        const yearValue = row.year ? parseInt(row.year, 10) : null
        if (!yearValue || isNaN(yearValue)) throw new Error('Năm không hợp lệ')
        if (!row.documentType) throw new Error('Loại chứng từ là bắt buộc')

        // Resolve or create year record
        let yearId = yearCache[yearValue]
        if (!yearId) {
          const existing = await client.query(
            'SELECT id FROM company_archive_years WHERE company_id = $1 AND year = $2',
            [companyId, yearValue]
          )
          if (existing.rows.length) {
            yearId = existing.rows[0].id
          } else {
            const created = await client.query(
              `INSERT INTO company_archive_years (company_id, year, created_by)
               VALUES ($1, $2, $3) RETURNING id`,
              [companyId, yearValue, user.id]
            )
            yearId = created.rows[0].id
          }
          yearCache[yearValue] = yearId
        }

        // Build months JSONB from month_1 … month_12 fields
        const months = { ...EMPTY_MONTHS }
        for (let m = 1; m <= 12; m++) {
          const v = row[`month_${m}`]
          if (v !== null && v !== undefined && v !== '') months[String(m)] = String(v)
        }

        // Custom extra_fields from dyn__ prefixed keys
        const extraFields = {}
        for (const [k, v] of Object.entries(row)) {
          if (k.startsWith('dyn__') && v !== null && v !== undefined && v !== '') {
            extraFields[k.slice(5)] = v
          }
        }

        await client.query(
          `INSERT INTO company_archive_docs
             (year_id, document_type, detail, months, extra_fields, notes, characteristics, position)
           SELECT $1, $2, $3, $4, $5, $6, $7,
             COALESCE((SELECT MAX(position) + 1 FROM company_archive_docs WHERE year_id = $1), 0)`,
          [
            yearId,
            row.documentType,
            row.detail          ?? null,
            JSON.stringify(months),
            JSON.stringify(extraFields),
            row.notes           ?? null,
            row.characteristics ?? null,
          ]
        )
        inserted++
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
        failed++
        errors.push({ row: rows[i]._rowNum ?? i + 2, message: err.message })
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { inserted, failed, errors }
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
  batchCreateDocs,
  listColumns,
  createColumn,
  deleteColumn,
  exportDocs,
}
