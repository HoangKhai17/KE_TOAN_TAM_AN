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
  const comp = row.components ?? {}
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
    allowanceItems:  comp.allowanceItems ?? [],
    bonusItems:      comp.bonusItems     ?? [],
    components:      row.components ?? null,
    notes:           row.notes ?? null,
    createdBy:       row.created_by,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  }
}

// --- Periods ---

async function listPeriods({ page = 1, limit = 24, year } = {}) {
  const offset = (page - 1) * limit
  const params = []
  let where = ''

  if (year) {
    params.push(parseInt(year, 10))
    where = `WHERE period_year = $${params.length}`
  }

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM payroll_periods ${where}`,
    params
  )
  const { rows } = await query(
    `SELECT * FROM payroll_periods ${where}
     ORDER BY period_year DESC, period_month DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  return {
    periods: rows.map(periodToDto),
    pagination: { page, limit, total: parseInt(count, 10), totalPages: Math.ceil(count / limit) },
  }
}

async function listDistinctYears() {
  const { rows } = await query(
    'SELECT DISTINCT period_year FROM payroll_periods ORDER BY period_year DESC'
  )
  return rows.map((r) => r.period_year)
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
    userId, baseSalary = 0,
    allowanceItems = [], bonusItems = [],
    allowances: allowancesLegacy = 0, bonus: bonusLegacy = 0,
    bhxhEmployee = 0, bhytEmployee = 0, bhtnEmployee = 0,
    bhxhEmployer = 0, bhytEmployer = 0, bhtnEmployer = 0,
    pitDeduction = 0, otherDeductions = 0,
    notes = null,
  } = data

  // Sum from items; fall back to legacy flat value if no items provided
  const allowances = allowanceItems.length > 0
    ? allowanceItems.reduce((s, i) => s + (i.amount ?? 0), 0)
    : allowancesLegacy
  const bonus = bonusItems.length > 0
    ? bonusItems.reduce((s, i) => s + (i.amount ?? 0), 0)
    : bonusLegacy

  const components = (allowanceItems.length > 0 || bonusItems.length > 0)
    ? { allowanceItems, bonusItems }
    : null

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

// --- Excel Export (custom fields) ---

async function exportExcelCustom(periodId, { fields = [], includeDetailSheet = false, splitItemCols = false }, res) {
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

  const ALL_COLS = {
    stt:             { header: 'STT',            width: 6,  isIndex: true },
    user_name:       { header: 'Họ tên',         width: 25 },
    base_salary:     { header: 'Lương cơ bản',   width: 16, currency: true },
    allowances:      { header: 'Tổng phụ cấp',   width: 16, currency: true },
    bonus:           { header: 'Tổng thưởng',    width: 16, currency: true },
    gross_income:    { header: 'Tổng thu nhập',  width: 16, currency: true },
    bhxh_employee:   { header: 'BHXH NV',        width: 14, currency: true },
    bhyt_employee:   { header: 'BHYT NV',        width: 14, currency: true },
    bhtn_employee:   { header: 'BHTN NV',        width: 14, currency: true },
    bhxh_employer:   { header: 'BHXH CT',        width: 14, currency: true },
    bhyt_employer:   { header: 'BHYT CT',        width: 14, currency: true },
    bhtn_employer:   { header: 'BHTN CT',        width: 14, currency: true },
    pit_deduction:   { header: 'Thuế TNCN',      width: 14, currency: true },
    other_deductions:{ header: 'Khấu trừ khác',  width: 15, currency: true },
    net_salary:      { header: 'Thực nhận',      width: 16, currency: true },
    notes:           { header: 'Ghi chú',        width: 30 },
  }

  const ORDERED_KEYS = Object.keys(ALL_COLS)
  const selected = (fields.length > 0 ? fields.filter((k) => ALL_COLS[k]) : ORDERED_KEYS)
    .map((k) => ({ key: k, ...ALL_COLS[k] }))

  // Build dynamic item columns when splitItemCols is requested
  const dynCols = []
  if (splitItemCols) {
    const seenA = new Set(), seenB = new Set()
    records.forEach((r) => {
      const comp = r.components ?? {}
      ;(comp.allowanceItems ?? []).forEach((i) => {
        if (i.name && !seenA.has(i.name)) { seenA.add(i.name) }
      })
      ;(comp.bonusItems ?? []).forEach((i) => {
        if (i.name && !seenB.has(i.name)) { seenB.add(i.name) }
      })
    })
    seenA.forEach((name) => dynCols.push({ key: `__pc__${name}`, header: `PC: ${name}`, width: 16, currency: true, dynType: 'allowance', dynName: name }))
    seenB.forEach((name) => dynCols.push({ key: `__th__${name}`, header: `TH: ${name}`, width: 16, currency: true, dynType: 'bonus',     dynName: name }))
  }

  const allCols = [...selected, ...dynCols]

  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet(`Lương T${period.period_month} ${period.period_year}`)
  sheet.columns  = allCols.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  const hRow = sheet.getRow(1)
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
  hRow.alignment = { vertical: 'middle' }
  hRow.height    = 22

  records.forEach((r, idx) => {
    const comp = r.components ?? {}
    const rowData = {}
    allCols.forEach((col) => {
      if (col.isIndex) {
        rowData[col.key] = idx + 1
      } else if (col.dynType) {
        const items = col.dynType === 'allowance' ? (comp.allowanceItems ?? []) : (comp.bonusItems ?? [])
        const found = items.find((i) => i.name === col.dynName)
        rowData[col.key] = found ? Number(found.amount ?? 0) : 0
      } else {
        rowData[col.key] = col.currency ? Number(r[col.key] ?? 0) : (r[col.key] ?? '')
      }
    })
    const row = sheet.addRow(rowData)
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } }
    allCols.forEach((col, ci) => { if (col.currency) row.getCell(ci + 1).numFmt = '#,##0' })
  })

  if (includeDetailSheet) {
    const dSheet = workbook.addWorksheet('Chi tiết phụ cấp & thưởng')
    dSheet.columns = [
      { header: 'STT',            key: 'stt',      width: 6  },
      { header: 'Nhân viên',      key: 'name',     width: 25 },
      { header: 'Loại',           key: 'category', width: 12 },
      { header: 'Tên khoản',      key: 'item_name',width: 25 },
      { header: 'Dự án / Nguồn',  key: 'project',  width: 22 },
      { header: 'Số tiền (VND)',   key: 'amount',   width: 16 },
      { header: 'Ghi chú',        key: 'note',     width: 25 },
    ]
    const dhRow = dSheet.getRow(1)
    dhRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    dhRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    dhRow.alignment = { vertical: 'middle' }
    dhRow.height    = 22

    let stt = 0
    records.forEach((r) => {
      const comp = r.components ?? {}
      const items = [
        ...(comp.allowanceItems ?? []).map((i) => ({ ...i, category: 'Phụ cấp' })),
        ...(comp.bonusItems     ?? []).map((i) => ({ ...i, category: 'Thưởng'  })),
      ]
      items.forEach((item) => {
        stt++
        const row = dSheet.addRow({
          stt, name: r.user_name, category: item.category,
          item_name: item.name, project: item.project ?? '',
          amount: Number(item.amount ?? 0), note: item.note ?? '',
        })
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stt % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF' } }
        row.getCell('amount').numFmt = '#,##0'
      })
    })
  }

  const filename = `BangLuong_T${String(period.period_month).padStart(2, '0')}_${period.period_year}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
}

// --- Excel Export (legacy, all columns) ---

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
    { header: 'BHXH NV',   key: 'bhxh_employee',   width: 14 },
    { header: 'BHYT NV', key: 'bhyt_employee',   width: 16 },
    { header: 'BHTN NV',   key: 'bhtn_employee',   width: 14 },
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

// --- Send Payroll Email ---

async function sendPayrollEmails(periodId) {
  const { sendMail }                    = require('../../utils/mailer')
  const { getTemplate, renderTemplate } = require('../../utils/emailTemplates')

  const { rows: [period] } = await query('SELECT * FROM payroll_periods WHERE id = $1', [periodId])
  if (!period) throw Object.assign(new Error('Payroll period not found'), { status: 404 })

  const monthYear = `Tháng ${String(period.period_month).padStart(2,'0')}/${period.period_year}`

  const { rows: records } = await query(
    `SELECT pr.*, u.name AS user_name, u.email, u.role
     FROM payroll_records pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.payroll_period_id = $1
       AND u.role = 'staff'
       AND u.email IS NOT NULL AND u.email <> ''
     ORDER BY u.name`,
    [periodId]
  )

  if (records.length === 0) return { sent: 0, failed: 0, skipped: 0, total: 0 }

  const fmt = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n ?? 0))) + ' ₫'
  const tpl = await getTemplate('email_tpl_payroll_slip')

  const buildItemRows = (items) => items.map((item, idx) => {
    const bg          = idx % 2 !== 0 ? 'background:#f8fafc;' : ''
    const projectPart = item.project ? ` <span style="color:#94a3b8;font-size:11.5px">(${item.project})</span>` : ''
    const notePart    = item.note    ? ` <em style="color:#94a3b8;font-size:11.5px">— ${item.note}</em>` : ''
    return `<tr style="${bg}"><td style="padding:7px 14px 7px 36px;border:1px solid #e2e8f0;color:#64748b;font-size:12.5px">↳ ${item.name}${projectPart}${notePart}</td><td style="padding:7px 14px;border:1px solid #e2e8f0;text-align:right;font-size:12.5px;color:#475569;font-weight:600">${fmt(item.amount)}</td></tr>`
  }).join('')

  let sent = 0, failed = 0
  await Promise.all(records.map(async (r) => {
    const net  = Number(r.net_salary ?? 0)
    const comp = r.components ?? {}
    const allowance_items_html = buildItemRows(comp.allowanceItems ?? [])
    const bonus_items_html     = buildItemRows(comp.bonusItems     ?? [])
    const notes_section        = r.notes
      ? `<div style="margin-top:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 16px"><p style="margin:0;font-size:13px;color:#0369a1;line-height:1.6"><strong>Ghi chú từ kế toán:</strong> ${r.notes}</p></div>`
      : ''

    const html = renderTemplate(tpl, {
      user_name:             r.user_name,
      month_year:            monthYear,
      base_salary:           fmt(r.base_salary),
      allowances:            fmt(r.allowances),
      bonus:                 fmt(r.bonus),
      gross_income:          fmt(r.gross_income),
      bhxh_employee:         fmt(r.bhxh_employee),
      bhyt_employee:         fmt(r.bhyt_employee),
      bhtn_employee:         fmt(r.bhtn_employee),
      pit_deduction:         fmt(r.pit_deduction),
      other_deductions:      fmt(r.other_deductions),
      net_salary:            fmt(net),
      notes:                 r.notes ?? '',
      allowance_items_html,
      bonus_items_html,
      notes_section,
    })
    const ok = await sendMail({
      to:      r.email,
      subject: `[Kế Toán Tâm An] Bảng lương ${monthYear} — ${r.user_name}`,
      html,
    })
    if (ok) sent++; else failed++
  }))

  return { sent, failed, skipped: 0, total: records.length }
}

module.exports = {
  listPeriods, listDistinctYears, getPeriod, createPeriod, updatePeriod,
  confirmPeriod, markPaid,
  listRecords, upsertRecord, deleteRecord,
  exportExcel, exportExcelCustom, sendPayrollEmails,
}
