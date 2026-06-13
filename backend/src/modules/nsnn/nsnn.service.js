const db    = require('../../lib/db')
const ExcelJS = require('exceljs')

// ── Access guard ───────────────────────────────────────────────────────────────

async function assertAccess(companyId, user) {
  if (user.role === 'admin') return
  const { rows } = await db.query(
    'SELECT id FROM companies WHERE id = $1 AND assigned_staff_id = $2',
    [companyId, user.id]
  )
  if (!rows.length) {
    const err = new Error('Không có quyền truy cập dữ liệu công ty này')
    err.status = 403
    throw err
  }
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function toDto(row) {
  return {
    id:           row.id,
    companyId:    row.company_id,
    documentType: row.document_type,
    category:     row.category,
    debtAmount:   row.debt_amount !== null ? parseFloat(row.debt_amount) : null,
    updateDate:   row.update_date ? String(row.update_date).substring(0, 10) : null,
    daysLate:     row.days_late !== null ? parseInt(row.days_late, 10) : null,
    repeatCount:  row.repeat_count !== null ? parseInt(row.repeat_count, 10) : null,
    notes:        row.notes,
    customFields: row.custom_fields ?? {},
    createdBy:    row.created_by,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  }
}

function colToDto(row) {
  return {
    id:        row.id,
    companyId: row.company_id,
    colName:   row.col_name,
    colType:   row.col_type,
    position:  row.position,
    createdAt: row.created_at,
  }
}

// ── BASE SELECT ───────────────────────────────────────────────────────────────

const BASE_SELECT = `
  SELECT
    d.*,
    CASE
      WHEN d.update_date IS NOT NULL
      THEN (CURRENT_DATE - d.update_date)::INTEGER
      ELSE NULL
    END AS days_late
  FROM company_nsnn_debts d
`

// ── CRUD ───────────────────────────────────────────────────────────────────────

async function listDebts(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await db.query(
    `${BASE_SELECT} WHERE d.company_id = $1 ORDER BY d.created_at ASC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createDebt(companyId, user, body) {
  await assertAccess(companyId, user)
  const {
    documentType, category, debtAmount, updateDate,
    repeatCount, notes, customFields,
  } = body

  const { rows } = await db.query(
    `INSERT INTO company_nsnn_debts
       (company_id, document_type, category, debt_amount, update_date,
        repeat_count, notes, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      companyId,
      documentType,
      category     || null,
      debtAmount   ?? null,
      updateDate   || null,
      repeatCount  ?? null,
      notes        || null,
      JSON.stringify(customFields ?? {}),
      user.id,
    ]
  )

  const inserted = rows[0]
  inserted.days_late = inserted.update_date
    ? Math.floor((Date.now() - new Date(inserted.update_date).getTime()) / 86_400_000)
    : null
  return toDto(inserted)
}

async function updateDebt(companyId, id, user, body) {
  await assertAccess(companyId, user)

  const fields = []
  const vals   = []
  let   i      = 1

  const push = (col, val) => { fields.push(`${col} = $${i++}`); vals.push(val) }

  if (body.documentType !== undefined) push('document_type', body.documentType)
  if (body.category     !== undefined) push('category',      body.category || null)
  if ('debtAmount'   in body)          push('debt_amount',   body.debtAmount ?? null)
  if ('updateDate'   in body)          push('update_date',   body.updateDate || null)
  if ('repeatCount'  in body)          push('repeat_count',  body.repeatCount ?? null)
  if (body.notes        !== undefined) push('notes',         body.notes || null)
  if (body.customFields !== undefined) push('custom_fields', JSON.stringify(body.customFields))

  push('updated_at', new Date())
  vals.push(id, companyId)

  const { rows } = await db.query(
    `UPDATE company_nsnn_debts
     SET ${fields.join(', ')}
     WHERE id = $${i++} AND company_id = $${i++}
     RETURNING *`,
    vals
  )
  if (!rows.length) {
    const err = new Error('Không tìm thấy dòng nợ')
    err.status = 404
    throw err
  }
  const updated = rows[0]
  updated.days_late = updated.update_date
    ? Math.floor((Date.now() - new Date(updated.update_date).getTime()) / 86_400_000)
    : null
  return toDto(updated)
}

async function deleteDebt(companyId, id, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await db.query(
    'DELETE FROM company_nsnn_debts WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!rowCount) {
    const err = new Error('Không tìm thấy dòng nợ')
    err.status = 404
    throw err
  }
}

// ── Custom columns ─────────────────────────────────────────────────────────────

async function listColumns(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await db.query(
    'SELECT * FROM company_nsnn_columns WHERE company_id = $1 ORDER BY position, created_at',
    [companyId]
  )
  return rows.map(colToDto)
}

async function createColumn(companyId, user, body) {
  await assertAccess(companyId, user)
  const { colName, colType = 'text' } = body

  const exists = await db.query(
    'SELECT id FROM company_nsnn_columns WHERE company_id = $1 AND col_name = $2',
    [companyId, colName]
  )
  if (exists.rows.length) {
    const err = new Error('Tên cột đã tồn tại')
    err.status = 409
    throw err
  }

  const { rows: posRows } = await db.query(
    'SELECT COALESCE(MAX(position),0)+1 AS next FROM company_nsnn_columns WHERE company_id = $1',
    [companyId]
  )
  const position = posRows[0].next

  const { rows } = await db.query(
    `INSERT INTO company_nsnn_columns (company_id, col_name, col_type, position)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [companyId, colName, colType, position]
  )
  return colToDto(rows[0])
}

async function deleteColumn(companyId, colId, user) {
  await assertAccess(companyId, user)
  await db.query(
    'DELETE FROM company_nsnn_columns WHERE id = $1 AND company_id = $2',
    [colId, companyId]
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────

const FIXED_FIELD_ORDER = [
  'stt', 'companyName', 'taxCode', 'assignedStaff',
  'documentType', 'category', 'debtAmount', 'updateDate',
  'daysLate', 'repeatCount', 'notes',
]

const FIXED_FIELD_DEF = {
  stt:           { label: 'STT',                              width: 6  },
  companyName:   { label: 'Khách hàng',                       width: 28 },
  taxCode:       { label: 'Mã số thuế',                       width: 16 },
  assignedStaff: { label: 'Quản lý',                          width: 20 },
  documentType:  { label: 'Loại chứng từ / công việc',        width: 34 },
  category:      { label: 'Phạm trù',                         width: 22 },
  debtAmount:    { label: 'Số tiền nợ NSNN',                  width: 18 },
  updateDate:    { label: 'Thời điểm cập nhật',               width: 16 },
  daysLate:      { label: 'Số ngày chậm so với hôm nay',      width: 20 },
  repeatCount:   { label: 'Số lần lặp lại cho 1 công việc',   width: 22 },
  notes:         { label: 'Ghi chú',                          width: 30 },
}

async function exportDebts(companyId, user, fieldsParam) {
  await assertAccess(companyId, user)

  const [{ rows: debts }, { rows: cols }, { rows: companyRows }] = await Promise.all([
    db.query(`${BASE_SELECT} WHERE d.company_id = $1 ORDER BY d.created_at ASC`, [companyId]),
    db.query('SELECT * FROM company_nsnn_columns WHERE company_id = $1 ORDER BY position, created_at', [companyId]),
    db.query('SELECT c.name, c.tax_code, u.name AS staff_name FROM companies c LEFT JOIN users u ON u.id = c.assigned_staff_id WHERE c.id = $1', [companyId]),
  ])

  const company = companyRows[0] ?? {}
  const dynKeys = cols.map((c) => `dyn__${c.col_name}`)
  const allKeys = [...FIXED_FIELD_ORDER, ...dynKeys]

  const requestedKeys = fieldsParam
    ? fieldsParam.split(',').map((s) => s.trim()).filter((k) => allKeys.includes(k))
    : allKeys

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Nợ NSNN')

  ws.columns = requestedKeys.map((key) => {
    if (key.startsWith('dyn__')) {
      const colName = key.slice(5)
      return { header: colName, key, width: 20 }
    }
    const def = FIXED_FIELD_DEF[key]
    return { header: def.label, key, width: def.width }
  })

  ws.getRow(1).eachCell((cell) => {
    cell.font            = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill            = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e3a5f' } }
    cell.alignment       = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border          = {
      top:    { style: 'thin' }, bottom: { style: 'thin' },
      left:   { style: 'thin' }, right:  { style: 'thin' },
    }
  })

  debts.forEach((row, idx) => {
    const mapped = toDto(row)
    const data   = {}
    for (const key of requestedKeys) {
      if (key === 'stt')           { data[key] = idx + 1; continue }
      if (key === 'companyName')   { data[key] = company.name ?? ''; continue }
      if (key === 'taxCode')       { data[key] = company.tax_code ?? ''; continue }
      if (key === 'assignedStaff') { data[key] = company.staff_name ?? ''; continue }
      if (key.startsWith('dyn__')) { data[key] = mapped.customFields[key.slice(5)] ?? ''; continue }
      data[key] = mapped[key] ?? ''
    }
    const wsRow = ws.addRow(data)
    wsRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top:   { style: 'thin' }, bottom: { style: 'thin' },
        left:  { style: 'thin' }, right:  { style: 'thin' },
      }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  return buffer
}

module.exports = {
  listDebts, createDebt, updateDebt, deleteDebt,
  listColumns, createColumn, deleteColumn,
  exportDebts,
}
