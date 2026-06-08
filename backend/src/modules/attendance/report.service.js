const { query } = require('../../config/db')

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toHolidayDto(r) {
  return {
    id:           r.id,
    holidayDate:  r.holiday_date,
    name:         r.name,
    otMultiplier: parseFloat(r.ot_multiplier),
    createdAt:    r.created_at,
  }
}

// ── Holidays CRUD ─────────────────────────────────────────────────────────────

async function listHolidays({ year } = {}) {
  const params = []
  let where = ''
  if (year) {
    params.push(year)
    where = `WHERE EXTRACT(YEAR FROM holiday_date) = $1`
  }
  const { rows } = await query(
    `SELECT * FROM public_holidays ${where} ORDER BY holiday_date`,
    params
  )
  return rows.map(toHolidayDto)
}

async function createHoliday({ holidayDate, name, otMultiplier = 3.0 }) {
  const { rows } = await query(
    `INSERT INTO public_holidays (holiday_date, name, ot_multiplier)
     VALUES ($1, $2, $3)
     ON CONFLICT (holiday_date) DO UPDATE SET name = $2, ot_multiplier = $3
     RETURNING *`,
    [holidayDate, name, otMultiplier]
  )
  return toHolidayDto(rows[0])
}

async function updateHoliday(id, { name, otMultiplier }) {
  const { rows } = await query(
    `UPDATE public_holidays
     SET name = COALESCE($1, name), ot_multiplier = COALESCE($2, ot_multiplier)
     WHERE id = $3
     RETURNING *`,
    [name ?? null, otMultiplier != null ? Number(otMultiplier) : null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Holiday not found'), { status: 404 })
  return toHolidayDto(rows[0])
}

async function deleteHoliday(id) {
  const { rows } = await query(
    'DELETE FROM public_holidays WHERE id = $1 RETURNING id',
    [id]
  )
  if (!rows[0]) throw Object.assign(new Error('Holiday not found'), { status: 404 })
}

// ── Monthly Report ────────────────────────────────────────────────────────────

async function getMonthlyReport({ month, year }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [{ rows: attRows }, { rows: otRows }] = await Promise.all([
    query(
      `SELECT
         u.id         AS user_id,
         u.name       AS user_name,
         u.job_title,
         COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('present','late','early_leave','late_and_early')), 0) AS actual_work_days,
         COALESCE(SUM(ar.work_units) FILTER (WHERE ar.status IN ('on_leave','wfh','business_trip','holiday')),       0) AS leave_paid_days,
         COUNT(*) FILTER (WHERE ar.status = 'absent')    AS absent_days,
         COUNT(*) FILTER (WHERE ar.status = 'late')      AS late_count,
         COUNT(*) FILTER (WHERE ar.status IN ('early_leave','late_and_early')) AS early_count,
         COALESCE(SUM(ar.ot_hours), 0)                   AS total_ot_hours,
         COUNT(ar.id)                                     AS total_records
       FROM users u
       LEFT JOIN attendance_records ar
         ON ar.user_id = u.id AND ar.work_date BETWEEN $1 AND $2
       WHERE u.status IN ('active','on_leave')
       GROUP BY u.id, u.name, u.job_title
       ORDER BY u.name`,
      [from, to]
    ),
    // Raw approved OT hours (giờ thực tế đã duyệt, từ overtime_requests)
    query(
      `SELECT user_id,
              SUM(ot_hours)              AS approved_ot_hours,
              SUM(ot_hours * ot_rate)    AS weighted_ot
       FROM overtime_requests
       WHERE ot_date BETWEEN $1 AND $2 AND status = 'approved'
       GROUP BY user_id`,
      [from, to]
    ),
  ])

  const otMap = new Map(otRows.map((r) => [r.user_id, {
    approvedOtHours: parseFloat(r.approved_ot_hours ?? 0),
    weightedOtHours: parseFloat(r.weighted_ot ?? 0),
  }]))

  return attRows.map((r) => ({
    userId:          r.user_id,
    userName:        r.user_name,
    jobTitle:        r.job_title,
    actualWorkDays:  parseFloat(r.actual_work_days),
    leavePaidDays:   parseFloat(r.leave_paid_days),
    absentDays:      parseInt(r.absent_days,   10),
    lateCount:       parseInt(r.late_count,    10),
    earlyCount:      parseInt(r.early_count,   10),
    approvedOtHours: otMap.get(r.user_id)?.approvedOtHours ?? 0,
    weightedOtHours: otMap.get(r.user_id)?.weightedOtHours ?? 0,
    totalRecords:    parseInt(r.total_records, 10),
  }))
}

// ── Sync Attendance → Payroll ─────────────────────────────────────────────────

async function syncAttendanceToPayroll(payrollPeriodId) {
  // Get payroll period
  const periodRes = await query(
    'SELECT * FROM payroll_periods WHERE id = $1',
    [payrollPeriodId]
  )
  if (!periodRes.rows[0]) throw Object.assign(new Error('Payroll period not found'), { status: 404 })
  const period = periodRes.rows[0]

  if (period.status === 'paid') {
    throw Object.assign(new Error('Kỳ lương đã chốt (paid), không thể cập nhật'), { status: 409 })
  }

  const from = typeof period.start_date === 'string' ? period.start_date
    : `${period.start_date.getUTCFullYear()}-${String(period.start_date.getUTCMonth() + 1).padStart(2, '0')}-${String(period.start_date.getUTCDate()).padStart(2, '0')}`
  const to   = typeof period.end_date   === 'string' ? period.end_date
    : `${period.end_date.getUTCFullYear()}-${String(period.end_date.getUTCMonth() + 1).padStart(2, '0')}-${String(period.end_date.getUTCDate()).padStart(2, '0')}`

  // Check for incomplete records (warnings)
  const { rows: warningRows } = await query(
    `SELECT u.name, ar.work_date, ar.status
     FROM attendance_records ar
     JOIN users u ON ar.user_id = u.id
     WHERE ar.work_date BETWEEN $1 AND $2
       AND (ar.status = 'unscheduled' OR (ar.check_out_time IS NULL AND ar.status IN ('present','late','early_leave','late_and_early')))
     ORDER BY ar.work_date, u.name`,
    [from, to]
  )

  // Get all active employees
  const { rows: employees } = await query(
    `SELECT id FROM users WHERE status IN ('active', 'on_leave') ORDER BY name`,
    []
  )

  const empIds = employees.map((e) => e.id)

  // Batch: aggregate attendance + OT for ALL employees in 2 queries (not 2×N)
  const [{ rows: attAggRows }, { rows: otAggRows }] = await Promise.all([
    query(
      `SELECT user_id,
         COALESCE(SUM(work_units) FILTER (WHERE status IN ('present','late','early_leave','late_and_early')), 0) AS actual_work_days,
         COALESCE(SUM(work_units) FILTER (WHERE status IN ('on_leave','wfh','business_trip','holiday')),       0) AS leave_paid_days,
         COUNT(*) FILTER (WHERE status = 'absent') AS absent_days,
         COUNT(*) FILTER (WHERE status = 'late')   AS late_count
       FROM attendance_records
       WHERE work_date BETWEEN $1 AND $2 AND user_id = ANY($3::uuid[])
       GROUP BY user_id`,
      [from, to, empIds]
    ),
    query(
      `SELECT user_id,
         COALESCE(SUM(ot_hours), 0)           AS approved_ot_hours,
         COALESCE(SUM(ot_hours * ot_rate), 0) AS weighted_ot
       FROM overtime_requests
       WHERE ot_date BETWEEN $1 AND $2 AND status = 'approved' AND user_id = ANY($3::uuid[])
       GROUP BY user_id`,
      [from, to, empIds]
    ),
  ])

  const attMap = new Map(attAggRows.map((r) => [r.user_id, r]))
  const otMap  = new Map(otAggRows.map((r)  => [r.user_id, r]))

  const updatedUsers = []
  for (const emp of employees) {
    const att = attMap.get(emp.id) ?? {}
    const ot  = otMap.get(emp.id)  ?? {}

    const summary = {
      actual_work_days:  parseFloat(att.actual_work_days  ?? 0),
      leave_paid_days:   parseFloat(att.leave_paid_days   ?? 0),
      total_paid_days:   parseFloat(att.actual_work_days  ?? 0) + parseFloat(att.leave_paid_days ?? 0),
      absent_days:       parseInt(att.absent_days  ?? 0, 10),
      late_count:        parseInt(att.late_count   ?? 0, 10),
      ot_hours:          parseFloat(ot.approved_ot_hours ?? 0),
      ot_weighted_hours: parseFloat(ot.weighted_ot       ?? 0),
    }

    // UPSERT: tạo mới nếu chưa có, cập nhật attendance_summary nếu đã có
    await query(
      `INSERT INTO payroll_records
         (payroll_period_id, user_id, created_by, components)
       VALUES ($1, $2, $3, jsonb_build_object('attendance_summary', $4::jsonb))
       ON CONFLICT (payroll_period_id, user_id)
       DO UPDATE SET
         components = COALESCE(payroll_records.components, '{}') ||
                      jsonb_build_object('attendance_summary', $4::jsonb),
         updated_at = NOW()`,
      [payrollPeriodId, emp.id, period.created_by, JSON.stringify(summary)]
    )
    updatedUsers.push(emp.id)
  }

  return {
    periodId:     payrollPeriodId,
    periodYear:   period.period_year,
    periodMonth:  period.period_month,
    updatedCount: updatedUsers.length,
    warnings:     warningRows.map((r) => ({
      userName: r.name,
      workDate: r.work_date,
      status:   r.status,
    })),
  }
}

// ── Excel Export ──────────────────────────────────────────────────────────────

async function exportMonthlyReportExcel(month, year, res) {
  const ExcelJS = require('exceljs')
  const rows = await getMonthlyReport({ month, year })

  const pad = (n) => String(n).padStart(2, '0')
  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet(`BaoCao_T${pad(month)}_${year}`)

  sheet.columns = [
    { header: 'STT',                  key: 'stt',             width: 5  },
    { header: 'Họ tên',               key: 'userName',        width: 24 },
    { header: 'Chức danh',            key: 'jobTitle',        width: 18 },
    { header: 'Ngày công TT',         key: 'actualWorkDays',  width: 14 },
    { header: 'Nghỉ có lương (TL)',   key: 'leavePaidDays',   width: 16 },
    { header: 'Tổng công',            key: 'totalWork',       width: 12 },
    { header: 'Vắng',                 key: 'absentDays',      width: 8  },
    { header: 'Đi muộn (lần)',        key: 'lateCount',       width: 13 },
    { header: 'Về sớm (lần)',         key: 'earlyCount',      width: 13 },
    { header: 'OT đã duyệt (h)',      key: 'approvedOtHours', width: 15 },
  ]

  // Blue header
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 22

  rows.forEach((r, idx) => {
    sheet.addRow({
      stt:             idx + 1,
      userName:        r.userName,
      jobTitle:        r.jobTitle ?? '—',
      actualWorkDays:  r.actualWorkDays,
      leavePaidDays:   r.leavePaidDays,
      totalWork:       r.actualWorkDays + r.leavePaidDays,
      absentDays:      r.absentDays,
      lateCount:       r.lateCount,
      earlyCount:      r.earlyCount,
      approvedOtHours: r.approvedOtHours,
    })
  })

  // Number format for decimal columns
  ;[4, 5, 6, 10].forEach((c) => { sheet.getColumn(c).numFmt = '0.0' })

  // Zebra rows
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const fill = rowNum % 2 === 0
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }
      : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    row.eachCell((cell) => { cell.fill = fill })
  })

  const filename = `BaoCao_ChamCong_T${pad(month)}_${year}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await workbook.xlsx.write(res)
}

// ── Custom Export (field-selectable) ─────────────────────────────────────────

// Summary export: 1 row per employee, selected columns only.
async function exportCustomSummary({ month, year, fields, res }) {
  const ExcelJS = require('exceljs')
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const rows = await getMonthlyReport({ month: m, year: y })
  const pad  = (n) => String(n).padStart(2, '0')

  const ALL_COLS = [
    { key: 'userName',        header: 'Họ tên',              width: 24, required: true },
    { key: 'jobTitle',        header: 'Chức danh',           width: 20 },
    { key: 'actualWorkDays',  header: 'Ngày công TT',        width: 14 },
    { key: 'leavePaidDays',   header: 'Nghỉ có lương',       width: 16 },
    { key: 'totalWork',       header: 'Tổng công',           width: 12 },
    { key: 'absentDays',      header: 'Vắng',                width: 8  },
    { key: 'lateCount',       header: 'Đi muộn (lần)',       width: 14 },
    { key: 'earlyCount',      header: 'Về sớm (lần)',        width: 14 },
    { key: 'approvedOtHours', header: 'OT đã duyệt (h)',     width: 15 },
  ]

  const fieldSet      = new Set(fields)
  const selectedCols  = ALL_COLS.filter((c) => c.required || fieldSet.has(c.key))
  const allCols       = [{ key: 'stt', header: 'STT', width: 5 }, ...selectedCols]

  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet(`TH_T${pad(m)}_${y}`)
  sheet.columns  = allCols.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  const hRow = sheet.getRow(1)
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  hRow.alignment = { horizontal: 'center', vertical: 'middle' }
  hRow.height    = 22

  rows.forEach((r, idx) => {
    const row = { stt: idx + 1 }
    selectedCols.forEach((c) => {
      if (c.key === 'totalWork') row.totalWork = (r.actualWorkDays ?? 0) + (r.leavePaidDays ?? 0)
      else row[c.key] = r[c.key] ?? (c.key === 'jobTitle' ? '—' : 0)
    })
    sheet.addRow(row)
  })

  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const fgColor = rowNum % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF'
    row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } } })
  })

  const filename = `TongHop_ChamCong_T${pad(m)}_${y}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  await workbook.xlsx.write(res)
}

// Detail export: 1 row per attendance record (employee × day), selected columns only.
async function exportDetailRecords({ month, year, fields, res }) {
  const ExcelJS = require('exceljs')
  const y   = parseInt(year, 10)
  const m   = parseInt(month, 10)
  const pad = (n) => String(n).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const to   = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`

  const { rows } = await query(
    `SELECT
       u.name          AS user_name,
       u.job_title,
       ar.work_date,
       ar.status,
       ar.check_in_time,
       ar.check_out_time,
       ar.actual_hours,
       ar.late_minutes,
       ar.early_minutes,
       COALESCE(ot_day.approved_ot, ar.ot_hours, 0) AS ot_hours,
       ar.notes
     FROM attendance_records ar
     JOIN users u ON ar.user_id = u.id
     LEFT JOIN (
       SELECT user_id, ot_date, SUM(ot_hours) AS approved_ot
       FROM overtime_requests
       WHERE status = 'approved' AND ot_date BETWEEN $1 AND $2
       GROUP BY user_id, ot_date
     ) ot_day ON ot_day.user_id = ar.user_id AND ot_day.ot_date = ar.work_date
     WHERE ar.work_date BETWEEN $1 AND $2
       AND u.status IN ('active', 'on_leave')
     ORDER BY u.name, ar.work_date`,
    [from, to]
  )

  const STATUS_VI = {
    present: 'Có mặt', late: 'Đi muộn', early_leave: 'Về sớm',
    late_and_early: 'Muộn & Sớm', absent: 'Vắng mặt', on_leave: 'Nghỉ phép',
    business_trip: 'Công tác', wfh: 'WFH', holiday: 'Nghỉ lễ', unscheduled: 'Ngoài lịch',
  }
  const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  const ALL_COLS = [
    { key: 'userName',     header: 'Họ tên',        width: 24, required: true },
    { key: 'jobTitle',     header: 'Chức danh',      width: 20 },
    { key: 'workDate',     header: 'Ngày',           width: 12, required: true },
    { key: 'dayOfWeek',    header: 'Thứ',            width: 6  },
    { key: 'statusLabel',  header: 'Trạng thái',     width: 16 },
    { key: 'checkInTime',  header: 'Giờ vào',        width: 10 },
    { key: 'checkOutTime', header: 'Giờ ra',         width: 10 },
    { key: 'actualHours',  header: 'Số giờ làm',     width: 12 },
    { key: 'lateMinutes',  header: 'Muộn (phút)',    width: 12 },
    { key: 'earlyMinutes', header: 'Về sớm (phút)',  width: 14 },
    { key: 'otHours',      header: 'OT (giờ)',       width: 10 },
    { key: 'notes',        header: 'Ghi chú',        width: 24 },
  ]

  const fieldSet     = new Set(fields)
  const selectedCols = ALL_COLS.filter((c) => c.required || fieldSet.has(c.key))
  const allCols      = [{ key: 'stt', header: 'STT', width: 5 }, ...selectedCols]

  const workbook = new ExcelJS.Workbook()
  const sheet    = workbook.addWorksheet(`CT_T${pad(m)}_${y}`)
  sheet.columns  = allCols.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  const hRow = sheet.getRow(1)
  hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
  hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  hRow.alignment = { horizontal: 'center', vertical: 'middle' }
  hRow.height    = 22

  const fmtTs = (ts) => {
    if (!ts) return null
    const d = new Date(ts)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Build helper to fill a data row object from a DB record
  function buildDataRow(r) {
    const dateObj = new Date(String(r.work_date).slice(0, 10) + 'T00:00:00')
    const row = { stt: '' }
    selectedCols.forEach((c) => {
      switch (c.key) {
        case 'userName':     row.userName     = r.user_name; break
        case 'jobTitle':     row.jobTitle     = r.job_title ?? '—'; break
        case 'workDate':     row.workDate     = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`; break
        case 'dayOfWeek':    row.dayOfWeek    = DOW[dateObj.getDay()]; break
        case 'statusLabel':  row.statusLabel  = STATUS_VI[r.status] ?? r.status; break
        case 'checkInTime':  row.checkInTime  = fmtTs(r.check_in_time) ?? '—'; break
        case 'checkOutTime': row.checkOutTime = fmtTs(r.check_out_time) ?? '—'; break
        case 'actualHours':  row.actualHours  = r.actual_hours != null ? parseFloat(r.actual_hours) : null; break
        case 'lateMinutes':  row.lateMinutes  = r.late_minutes ?? 0; break
        case 'earlyMinutes': row.earlyMinutes = r.early_minutes ?? 0; break
        case 'otHours':      row.otHours      = r.ot_hours != null ? parseFloat(r.ot_hours) : 0; break
        case 'notes':        row.notes        = r.notes ?? ''; break
      }
    })
    return row
  }

  // Group records by employee name (ORDER BY u.name guarantees same-user rows are contiguous)
  const userGroups = new Map()
  rows.forEach((r) => {
    const name = r.user_name
    if (!userGroups.has(name)) userGroups.set(name, [])
    userGroups.get(name).push(r)
  })

  let sttIdx = 1
  let sheetRowNum = 2 // tracks actual row number for zebra striping

  userGroups.forEach((userRows, userName) => {
    // ── Regular rows (with zebra striping applied inline) ──
    userRows.forEach((r) => {
      const rowData   = buildDataRow(r)
      rowData.stt     = sttIdx++
      const addedRow  = sheet.addRow(rowData)
      const fgColor   = sheetRowNum % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF'
      addedRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } }
      })
      sheetRowNum++
    })

    // ── Per-employee summary row ──
    const totalHours = userRows.reduce((s, r) => s + (r.actual_hours  != null ? parseFloat(r.actual_hours)  : 0), 0)
    const totalLate  = userRows.reduce((s, r) => s + (r.late_minutes  ?? 0), 0)
    const totalEarly = userRows.reduce((s, r) => s + (r.early_minutes ?? 0), 0)
    const totalOt    = userRows.reduce((s, r) => s + (r.ot_hours      != null ? parseFloat(r.ot_hours)      : 0), 0)

    const sumData = { stt: '' }
    selectedCols.forEach((c) => {
      switch (c.key) {
        case 'userName':     sumData.userName     = `∑ Tổng — ${userName}`; break
        case 'actualHours':  sumData.actualHours  = totalHours;  break
        case 'lateMinutes':  sumData.lateMinutes  = totalLate;   break
        case 'earlyMinutes': sumData.earlyMinutes = totalEarly;  break
        case 'otHours':      sumData.otHours      = totalOt;     break
        default:             sumData[c.key]       = ''; break
      }
    })

    const sumRow = sheet.addRow(sumData)
    sumRow.font  = { bold: true }
    sumRow.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDE0F7' } } // light blue
    sumRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF4B8EC8' } } }
    })
    sheetRowNum++
  })

  const filename = `ChiTiet_ChamCong_T${pad(m)}_${y}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
  await workbook.xlsx.write(res)
}

module.exports = { listHolidays, createHoliday, updateHoliday, deleteHoliday, getMonthlyReport, syncAttendanceToPayroll, exportMonthlyReportExcel, exportCustomSummary, exportDetailRecords }
