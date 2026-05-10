const { query } = require('../../config/db')
const audit     = require('../../lib/audit')
const ExcelJS   = require('exceljs')

function periodToDto(row) {
  return {
    id:          row.id,
    periodYear:  row.period_year,
    periodMonth: row.period_month,
    startDate:   row.start_date,
    endDate:     row.end_date,
    status:      row.status,
    notes:       row.notes ?? null,
    createdBy:   row.created_by,
    confirmedBy: row.confirmed_by ?? null,
    confirmedAt: row.confirmed_at ?? null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

function recordToDto(row) {
  return {
    id:              row.id,
    periodId:        row.payroll_period_id,
    userId:          row.user_id,
    userName:        row.user_name ?? null,
    baseSalary:      Number(row.base_salary),
    allowances:      Number(row.allowances),
    bonus:           Number(row.bonus),
    grossIncome:     Number(row.gross_income),
    bhxhEmployee:    Number(row.bhxh_employee),
    bhytEmployee:    Number(row.bhyt_employee),
    bhtnEmployee:    Number(row.bhtn_employee),
    bhxhEmployer:    Number(row.bhxh_employer),
    bhytEmployer:    Number(row.bhyt_employer),
    bhtnEmployer:    Number(row.bhtn_employer),
    pitDeduction:    Number(row.pit_deduction),
    otherDeductions: Number(row.other_deductions),
    netSalary:       Number(row.net_salary),
    components:      row.components ?? null,
    notes:           row.notes ?? null,
    createdBy:       row.created_by,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

// --- Periods ---

async function listPeriods({ page = 1, limit = 24 } = {}) {
  const offset = (page - 1) * limit
  const { rows: [{ count }] } = await query('SELECT COUNT(*) FROM payroll_periods', [])
  const { rows } = await query(
    'SELECT * FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  )
  return {
    periods: rows.map(periodToDto),
    pagination: { page, limit, total: parseInt(count, 10), totalPages: Math.ceil(count / limit) },
  }
}

async function getPeriod(id) {
  const { rows: [row] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [id])
  if (!row) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  return periodToDto(row)
}

async function createPeriod(data, actorId) {
  const { periodYear, periodMonth, startDate, endDate, notes } = data
  try {
    const { rows: [row] } = await query(
      `INSERT INTO payroll_periods (period_year, period_month, start_date, end_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [periodYear, periodMonth, startDate, endDate, notes ?? null, actorId]
    )
    return periodToDto(row)
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error(`Payroll period ${periodMonth}/${periodYear} already exists`), { status: 409 })
    }
    throw err
  }
}

async function updatePeriod(id, data, actorId) {
  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [id])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  if (period.status !== 'draft') {
    throw Object.assign(new Error('Cannot edit a confirmed or paid payroll period'), { status: 409 })
  }

  const updates = ['updated_at = NOW()']
  const params  = []
  if (data.startDate !== undefined) { params.push(data.startDate); updates.push(`start_date = $${params.length}`) }
  if (data.endDate   !== undefined) { params.push(data.endDate);   updates.push(`end_date = $${params.length}`) }
  if (data.notes     !== undefined) { params.push(data.notes);     updates.push(`notes = $${params.length}`) }

  params.push(id)
  const { rows: [updated] } = await query(
    `UPDATE payroll_periods SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
  return periodToDto(updated)
}

async function confirmPeriod(id, actorId, ipAddress, userAgent) {
  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [id])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  if (period.status !== 'draft') {
    throw Object.assign(new Error(`Period status is '${period.status}', expected 'draft'`), { status: 409 })
  }

  const { rows: [updated] } = await query(
    `UPDATE payroll_periods
     SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [actorId, id]
  )

  await audit.log({
    userId: actorId, action: 'payroll.confirmed',
    targetType: 'payroll_periods', targetId: id,
    meta: { periodYear: period.period_year, periodMonth: period.period_month },
    ipAddress, userAgent,
  })
  return periodToDto(updated)
}

async function markPaid(id, actorId, ipAddress, userAgent) {
  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [id])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  if (period.status !== 'confirmed') {
    throw Object.assign(new Error(`Period status is '${period.status}', expected 'confirmed'`), { status: 409 })
  }

  const { rows: [updated] } = await query(
    `UPDATE payroll_periods SET status = 'paid', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  )
  await audit.log({
    userId: actorId, action: 'payroll.paid',
    targetType: 'payroll_periods', targetId: id,
    meta: { periodYear: period.period_year, periodMonth: period.period_month },
    ipAddress, userAgent,
  })
  return periodToDto(updated)
}

// --- Records ---

async function listRecords(periodId) {
  const { rows: [period] } = await query('SELECT id FROM payroll_periods WHERE id = $1', [periodId])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })

  const { rows } = await query(
    `SELECT pr.*, u.name AS user_name
     FROM payroll_records pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.payroll_period_id = $1
     ORDER BY u.name`,
    [periodId]
  )
  return rows.map(recordToDto)
}

async function upsertRecord(periodId, data, actorId) {
  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [periodId])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  if (period.status !== 'draft') {
    throw Object.assign(new Error('Cannot edit records in a confirmed or paid period'), { status: 409 })
  }

  const {
    userId, baseSalary = 0, allowances = 0, bonus = 0,
    bhxhEmployee = 0, bhytEmployee = 0, bhtnEmployee = 0,
    bhxhEmployer = 0, bhytEmployer = 0, bhtnEmployer = 0,
    pitDeduction = 0, otherDeductions = 0,
    components = null, notes = null,
  } = data

  const { rows: [record] } = await query(
    `INSERT INTO payroll_records
       (payroll_period_id, user_id, base_salary, allowances, bonus,
        bhxh_employee, bhyt_employee, bhtn_employee,
        bhxh_employer, bhyt_employer, bhtn_employer,
        pit_deduction, other_deductions, components, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (payroll_period_id, user_id)
     DO UPDATE SET
       base_salary = EXCLUDED.base_salary,
       allowances = EXCLUDED.allowances,
       bonus = EXCLUDED.bonus,
       bhxh_employee = EXCLUDED.bhxh_employee,
       bhyt_employee = EXCLUDED.bhyt_employee,
       bhtn_employee = EXCLUDED.bhtn_employee,
       bhxh_employer = EXCLUDED.bhxh_employer,
       bhyt_employer = EXCLUDED.bhyt_employer,
       bhtn_employer = EXCLUDED.bhtn_employer,
       pit_deduction = EXCLUDED.pit_deduction,
       other_deductions = EXCLUDED.other_deductions,
       components = EXCLUDED.components,
       notes = EXCLUDED.notes,
       updated_at = NOW()
     RETURNING *`,
    [
      periodId, userId, baseSalary, allowances, bonus,
      bhxhEmployee, bhytEmployee, bhtnEmployee,
      bhxhEmployer, bhytEmployer, bhtnEmployer,
      pitDeduction, otherDeductions,
      components ? JSON.stringify(components) : null,
      notes, actorId,
    ]
  )

  const { rows: [full] } = await query(
    'SELECT pr.*, u.name AS user_name FROM payroll_records pr JOIN users u ON u.id = pr.user_id WHERE pr.id = $1',
    [record.id]
  )
  return recordToDto(full)
}

async function deleteRecord(periodId, recordId, actorId) {
  const { rows: [period] } = await query('SELECT status FROM payroll_periods WHERE id = $1', [periodId])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  if (period.status !== 'draft') {
    throw Object.assign(new Error('Cannot delete records in a confirmed or paid period'), { status: 409 })
  }
  const { rows: [record] } = await query(
    'SELECT id FROM payroll_records WHERE id = $1 AND payroll_period_id = $2',
    [recordId, periodId]
  )
  if (!record) throw Object.assign(new Error('Record not found'), { status: 404 })
  await query('DELETE FROM payroll_records WHERE id = $1', [recordId])
}

// --- Excel Export ---

async function exportExcel(periodId, res) {
  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [periodId])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })

  const { rows: records } = await query(
    `SELECT pr.*, u.name AS user_name
     FROM payroll_records pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.payroll_period_id = $1
     ORDER BY u.name`,
    [periodId]
  )

  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet(`Luong_T${period.period_month}_${period.period_year}`)

  sheet.columns = [
    { header: 'STT',            key: 'stt',             width: 6  },
    { header: 'Họ tên',         key: 'user_name',        width: 25 },
    { header: 'Lương CB',       key: 'base_salary',      width: 14 },
    { header: 'Phụ cấp',        key: 'allowances',       width: 12 },
    { header: 'Thưởng',         key: 'bonus',            width: 12 },
    { header: 'Tổng thu nhập',  key: 'gross_income',     width: 16 },
    { header: 'BHXH NV (8%)',   key: 'bhxh_employee',   width: 14 },
    { header: 'BHYT NV (1.5%)', key: 'bhyt_employee',   width: 16 },
    { header: 'BHTN NV (1%)',   key: 'bhtn_employee',   width: 14 },
    { header: 'TNCN',           key: 'pit_deduction',    width: 12 },
    { header: 'Khấu trừ khác',  key: 'other_deductions', width: 14 },
    { header: 'Thực nhận',      key: 'net_salary',       width: 14 },
    { header: 'Ghi chú',        key: 'notes',            width: 20 },
  ]

  // Style header row
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFD9E1F2' },
  }

  records.forEach((r, idx) => {
    sheet.addRow({
      stt:             idx + 1,
      user_name:       r.user_name,
      base_salary:     Number(r.base_salary),
      allowances:      Number(r.allowances),
      bonus:           Number(r.bonus),
      gross_income:    Number(r.gross_income),
      bhxh_employee:  Number(r.bhxh_employee),
      bhyt_employee:  Number(r.bhyt_employee),
      bhtn_employee:  Number(r.bhtn_employee),
      pit_deduction:   Number(r.pit_deduction),
      other_deductions:Number(r.other_deductions),
      net_salary:      Number(r.net_salary),
      notes:           r.notes ?? '',
    })
  })

  // Number format for currency columns
  const currencyCols = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  currencyCols.forEach(colIdx => {
    sheet.getColumn(colIdx).numFmt = '#,##0'
  })

  const filename = `BangLuong_T${String(period.period_month).padStart(2, '0')}_${period.period_year}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
}

module.exports = {
  listPeriods, getPeriod, createPeriod, updatePeriod,
  confirmPeriod, markPaid,
  listRecords, upsertRecord, deleteRecord,
  exportExcel,
}
