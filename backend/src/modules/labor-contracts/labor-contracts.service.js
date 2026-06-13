const { query, getClient } = require('../../config/db')
const ExcelJS   = require('exceljs')

const STATUS_LABEL = {
  active:        'Còn hiệu lực',
  expiring_soon: 'Sắp hết hạn',
  expired:       'Đã hết hạn',
  permanent:     'Không thời hạn',
}

// SQL fragment — computed columns tính tại query time, không lưu DB
const BASE_SELECT = `
  SELECT *,
    CASE WHEN end_date IS NULL THEN NULL
         ELSE (end_date - CURRENT_DATE)::INTEGER
    END AS days_remaining,
    CASE
      WHEN end_date IS NULL              THEN 'permanent'
      WHEN end_date < CURRENT_DATE       THEN 'expired'
      WHEN end_date - CURRENT_DATE <= 30 THEN 'expiring_soon'
      ELSE                                    'active'
    END AS contract_status
  FROM company_labor_contracts
`

function toDto(row) {
  const cf = row.custom_fields
  // Chấp nhận cả object {} lẫn legacy array []
  let customFields = {}
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    customFields = cf
  }
  const dr = row.days_remaining
  return {
    id:             row.id,
    companyId:      row.company_id,
    employeeName:   row.employee_name,
    taxCode:        row.tax_code        ?? null,
    contractType:   row.contract_type   ?? null,
    contractNumber: row.contract_number ?? null,
    contractDate:   row.contract_date   ?? null,
    endDate:        row.end_date        ?? null,
    notes:          row.notes           ?? null,
    customFields,
    daysRemaining:  dr !== null && dr !== undefined ? parseInt(dr, 10) : null,
    contractStatus: row.contract_status ?? 'permanent',
    createdBy:      row.created_by,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  }
}

function colToDto(row) {
  return {
    id:       row.id,
    colName:  row.col_name,
    colType:  row.col_type,
    position: row.position,
  }
}

async function assertAccess(companyId, user) {
  const { rows: [row] } = await query(
    'SELECT assigned_staff_id FROM companies WHERE id = $1', [companyId]
  )
  if (!row) throw Object.assign(new Error('Company not found'), { status: 404 })
  if (user?.role === 'admin') return
  if (row.assigned_staff_id !== user.id) {
    throw Object.assign(new Error('Bạn không có quyền truy cập công ty này'), { status: 403 })
  }
}

async function getById(id, companyId) {
  const { rows: [row] } = await query(
    `${BASE_SELECT} WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  )
  if (!row) throw Object.assign(new Error('Contract not found'), { status: 404 })
  return toDto(row)
}

// ── Columns ───────────────────────────────────────────────────────────────────

async function listColumns(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    `SELECT * FROM company_labor_contract_columns
     WHERE company_id = $1 ORDER BY position, created_at`,
    [companyId]
  )
  return rows.map(colToDto)
}

async function createColumn(companyId, { colName, colType }, user) {
  await assertAccess(companyId, user)
  const { rows: [row] } = await query(
    `INSERT INTO company_labor_contract_columns (company_id, col_name, col_type, position)
     SELECT $1, $2, $3,
       COALESCE((SELECT MAX(position) + 1 FROM company_labor_contract_columns WHERE company_id = $1), 0)
     RETURNING *`,
    [companyId, colName, colType ?? 'text']
  )
  return colToDto(row)
}

async function deleteColumn(companyId, columnId, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await query(
    'DELETE FROM company_labor_contract_columns WHERE id = $1 AND company_id = $2',
    [columnId, companyId]
  )
  if (!rowCount) throw Object.assign(new Error('Column not found'), { status: 404 })
}

// ── Contracts ─────────────────────────────────────────────────────────────────

async function listContracts(companyId, user) {
  await assertAccess(companyId, user)
  const { rows } = await query(
    `${BASE_SELECT} WHERE company_id = $1
     ORDER BY
       CASE WHEN end_date IS NULL THEN 2 ELSE 1 END,
       end_date ASC`,
    [companyId]
  )
  return rows.map(toDto)
}

async function createContract(companyId, data, actorId, user) {
  await assertAccess(companyId, user)
  const {
    employeeName, taxCode, contractType, contractNumber,
    contractDate, endDate, notes, customFields = {},
  } = data

  const { rows: [row] } = await query(
    `INSERT INTO company_labor_contracts
       (company_id, employee_name, tax_code, contract_type, contract_number,
        contract_date, end_date, notes, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      companyId, employeeName,
      taxCode        ?? null,
      contractType   ?? null,
      contractNumber ?? null,
      contractDate   ?? null,
      endDate        ?? null,
      notes          ?? null,
      JSON.stringify(typeof customFields === 'object' && !Array.isArray(customFields) ? customFields : {}),
      actorId,
    ]
  )
  return getById(row.id, companyId)
}

async function updateContract(companyId, id, data, actorId, user) {
  await assertAccess(companyId, user)

  const { rows: [existing] } = await query(
    'SELECT id FROM company_labor_contracts WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!existing) throw Object.assign(new Error('Contract not found'), { status: 404 })

  const fieldMap = {
    employeeName:   'employee_name',
    taxCode:        'tax_code',
    contractType:   'contract_type',
    contractNumber: 'contract_number',
    contractDate:   'contract_date',
    endDate:        'end_date',
    notes:          'notes',
  }

  const updates = []
  const params  = []
  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      params.push(data[key] ?? null)
      updates.push(`${col} = $${params.length}`)
    }
  }
  if (data.customFields !== undefined) {
    const cf = data.customFields
    params.push(JSON.stringify(typeof cf === 'object' && !Array.isArray(cf) ? cf : {}))
    updates.push(`custom_fields = $${params.length}`)
  }
  if (!updates.length) throw Object.assign(new Error('No fields to update'), { status: 400 })

  params.push(id)
  await query(
    `UPDATE company_labor_contracts SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}`,
    params
  )
  return getById(id, companyId)
}

async function deleteContract(companyId, id, user) {
  await assertAccess(companyId, user)
  const { rowCount } = await query(
    'DELETE FROM company_labor_contracts WHERE id = $1 AND company_id = $2',
    [id, companyId]
  )
  if (!rowCount) throw Object.assign(new Error('Contract not found'), { status: 404 })
}

// ── Export ────────────────────────────────────────────────────────────────────

// Thứ tự cột cố định — dùng để giữ đúng thứ tự trong Excel dù frontend chọn lộn xộn
const FIXED_FIELD_ORDER = [
  'stt', 'companyName', 'assignedStaff', 'employeeName', 'taxCode',
  'contractType', 'contractNumber', 'contractDate', 'endDate',
  'daysRemaining', 'contractStatus', 'notes',
]

const FIXED_FIELD_DEF = {
  stt:            { header: 'STT',           width: 5  },
  companyName:    { header: 'Tên công ty',   width: 30 },
  assignedStaff:  { header: 'NV phụ trách',  width: 22 },
  employeeName:   { header: 'Tên nhân viên', width: 28 },
  taxCode:        { header: 'MST nhân viên', width: 16 },
  contractType:   { header: 'Loại hợp đồng', width: 25 },
  contractNumber: { header: 'Số hợp đồng',   width: 20 },
  contractDate:   { header: 'Ngày ký',       width: 16 },
  endDate:        { header: 'Ngày kết thúc', width: 16 },
  daysRemaining:  { header: 'Ngày còn lại',  width: 15 },
  contractStatus: { header: 'Tình trạng',    width: 18 },
  notes:          { header: 'Ghi chú',       width: 35 },
}

const STATUS_FILL = {
  active:        'FFE2EFDA',
  expiring_soon: 'FFFFF2CC',
  expired:       'FFFFC7CE',
  permanent:     'FFF2F2F2',
}

async function exportContracts(companyId, user, fieldsParam = '') {
  const [[contracts, columns], companyRes] = await Promise.all([
    Promise.all([listContracts(companyId, user), listColumns(companyId, user)]),
    query(
      `SELECT c.name, u.name AS staff_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.assigned_staff_id
       WHERE c.id = $1`,
      [companyId]
    ),
  ])
  const companyName       = companyRes.rows[0]?.name       ?? ''
  const assignedStaffName = companyRes.rows[0]?.staff_name ?? ''

  // Parse requested fields — null means "xuất tất cả"
  const requested = fieldsParam
    ? new Set(fieldsParam.split(',').map((s) => s.trim()).filter(Boolean))
    : null
  const include = (key) => !requested || requested.has(key)

  // Build ordered column list
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '')

  const wsCols = [
    ...FIXED_FIELD_ORDER
      .filter(include)
      .map((key) => ({ key, ...FIXED_FIELD_DEF[key] })),
    ...columns
      .filter((col) => include(`dyn__${col.colName}`))
      .map((col) => ({ header: col.colName, key: `dyn__${col.colName}`, width: 20 })),
  ]

  function getCellValue(c, key, idx) {
    if (key === 'stt')            return idx + 1
    if (key === 'companyName')    return companyName
    if (key === 'assignedStaff')  return assignedStaffName
    if (key === 'contractDate')   return fmtDate(c.contractDate)
    if (key === 'endDate')        return fmtDate(c.endDate)
    if (key === 'daysRemaining')  return c.daysRemaining !== null ? c.daysRemaining : ''
    if (key === 'contractStatus') return STATUS_LABEL[c.contractStatus] ?? c.contractStatus
    if (key.startsWith('dyn__')) return c.customFields[key.slice(5)] ?? ''
    return c[key] ?? ''
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Kế Toán Tâm An'
  const ws = wb.addWorksheet('Theo dõi HĐLĐ')
  ws.columns = wsCols

  const headerRow = ws.getRow(1)
  headerRow.font      = { bold: true }
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }
  headerRow.alignment = { vertical: 'middle' }
  headerRow.height    = 20

  const statusColIdx = wsCols.findIndex((c) => c.key === 'contractStatus')

  contracts.forEach((c, idx) => {
    const rowData = Object.fromEntries(wsCols.map((col) => [col.key, getCellValue(c, col.key, idx)]))
    const dataRow = ws.addRow(rowData)

    if (statusColIdx >= 0) {
      const fillArgb = STATUS_FILL[c.contractStatus]
      if (fillArgb) {
        dataRow.getCell(statusColIdx + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
      }
    }
  })

  return wb
}

// ── Batch import ──────────────────────────────────────────────────────────────

async function batchCreate(companyId, user, rows) {
  await assertAccess(companyId, user)
  const client = await getClient()
  let inserted = 0, failed = 0
  const errors = []
  try {
    await client.query('BEGIN')
    for (let i = 0; i < rows.length; i++) {
      const sp = `sp_${i}`
      await client.query(`SAVEPOINT ${sp}`)
      try {
        const {
          employeeName, taxCode, contractType, contractNumber,
          contractDate, endDate, notes, customFields = {},
        } = rows[i]
        await client.query(
          `INSERT INTO company_labor_contracts
             (company_id, employee_name, tax_code, contract_type, contract_number,
              contract_date, end_date, notes, custom_fields, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            companyId,
            employeeName,
            taxCode        ?? null,
            contractType   ?? null,
            contractNumber ?? null,
            contractDate   ?? null,
            endDate        ?? null,
            notes          ?? null,
            JSON.stringify(typeof customFields === 'object' && !Array.isArray(customFields) ? customFields : {}),
            user.id,
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
  listContracts,
  createContract,
  updateContract,
  deleteContract,
  exportContracts,
  batchCreate,
  listColumns,
  createColumn,
  deleteColumn,
}
