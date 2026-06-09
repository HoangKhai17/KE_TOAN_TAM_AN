const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id:                r.id,
    userId:            r.user_id,
    userName:          r.user_name          ?? undefined,
    otDate:            r.ot_date,
    startTime:         r.start_time,
    endTime:           r.end_time,
    otHours:           parseFloat(r.ot_hours),
    otRate:            parseFloat(r.ot_rate),
    reason:            r.reason,
    status:            r.status,
    approvedBy:        r.approved_by,
    approverName:      r.approver_name      ?? undefined,
    approvedAt:        r.approved_at,
    approvalNote:      r.approval_note      ?? undefined,
    rejectionNote:     r.rejection_note     ?? undefined,
    clientCompanyId:   r.client_company_id  ?? undefined,
    clientCompanyName: r.client_company_name ?? undefined,
    createdAt:         r.created_at,
    updatedAt:         r.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function calcOtHours(startTime, endTime) {
  const startMin = parseTimeToMinutes(startTime)
  let endMin     = parseTimeToMinutes(endTime)
  if (endMin <= startMin) endMin += 24 * 60 // midnight crossover
  const diffHours = (endMin - startMin) / 60
  return diffHours > 4 ? diffHours - 0.5 : diffHours // deduct 30min break if >4h
}

async function calcOtRate(otDate) {
  const dayOfWeek = new Date(`${otDate}T00:00:00`).getDay() // 0=Sun, 6=Sat

  const holidayRes = await query(
    'SELECT id FROM public_holidays WHERE holiday_date = $1',
    [otDate]
  )
  if (holidayRes.rows.length > 0) return 3.0
  if (dayOfWeek === 0 || dayOfWeek === 6) return 2.0
  return 1.5
}

async function notifyAdmins(title, body) {
  const { rows } = await query(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
  )
  await Promise.all(rows.map((r) => createAndEmit(r.id, 'task_assigned', title, body, null)))
}

function toDateStr(d) {
  if (!d) return null
  const obj = d instanceof Date ? d : new Date(d)
  return `${obj.getUTCFullYear()}-${String(obj.getUTCMonth() + 1).padStart(2, '0')}-${String(obj.getUTCDate()).padStart(2, '0')}`
}

// ── Service functions ─────────────────────────────────────────────────────────

async function listOvertimeRequests({ userId, status, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`o.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`o.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (from)   { params.push(from);   conditions.push(`o.ot_date >= $${params.length}`) }
  if (to)     { params.push(to);     conditions.push(`o.ot_date <= $${params.length}`) }

  const where = conditions.join(' AND ')

  // Single query with window COUNT — eliminates the separate COUNT(*) round-trip
  const { rows } = await query(
    `SELECT o.*, u.name AS user_name, a.name AS approver_name,
            c.name AS client_company_name, COUNT(*) OVER() AS _total
     FROM overtime_requests o
     JOIN  users    u ON o.user_id          = u.id
     LEFT JOIN users    a ON o.approved_by      = a.id
     LEFT JOIN companies c ON o.client_company_id = c.id
     WHERE ${where}
     ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const total = parseInt(rows[0]?._total ?? 0, 10)
  return { requests: rows.map(toDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function createOvertimeRequest({ userId, otDate, startTime, endTime, reason, clientCompanyId }) {
  const otHours = calcOtHours(startTime, endTime)
  const otRate  = await calcOtRate(otDate)

  const { rows } = await query(
    `INSERT INTO overtime_requests (user_id, ot_date, start_time, end_time, ot_hours, ot_rate, reason, client_company_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, otDate, startTime, endTime, parseFloat(otHours.toFixed(2)), otRate, reason ?? null, clientCompanyId ?? null]
  )

  const userRes  = await query('SELECT name FROM users WHERE id = $1', [userId])
  const userName = userRes.rows[0]?.name ?? 'Nhân viên'
  await notifyAdmins(
    `Đơn tăng ca mới — ${userName}`,
    `${userName} đăng ký OT ngày ${otDate} từ ${startTime} đến ${endTime} (${otHours.toFixed(1)}h × ${otRate})`
  )

  return toDto(rows[0])
}

async function approveOvertimeRequest(id, approvedBy, approvalNote) {
  const { rows } = await query(
    `UPDATE overtime_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(),
         approval_note = $3, updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, id, approvalNote ?? null]
  )
  if (!rows[0]) throw Object.assign(new Error('OT request not found or already reviewed'), { status: 404 })
  const ot = rows[0]

  // Recalculate total approved OT hours for that day and update attendance_records
  const totalOtRes = await query(
    `SELECT COALESCE(SUM(ot_hours), 0) AS total_ot
     FROM overtime_requests
     WHERE user_id = $1 AND ot_date = $2 AND status = 'approved'`,
    [ot.user_id, ot.ot_date]
  )
  const totalOt = parseFloat(totalOtRes.rows[0].total_ot)

  await query(
    `UPDATE attendance_records SET ot_hours = $1, updated_at = NOW()
     WHERE user_id = $2 AND work_date = $3`,
    [totalOt, ot.user_id, ot.ot_date]
  )

  await createAndEmit(
    ot.user_id, 'task_status_changed',
    'Đơn tăng ca được duyệt',
    `Đơn OT ngày ${toDateStr(ot.ot_date)} từ ${ot.start_time} đến ${ot.end_time} đã được duyệt.`,
    null
  )

  return toDto(rows[0])
}

async function rejectOvertimeRequest(id, { rejectionNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE overtime_requests
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [reviewedBy, rejectionNote ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('OT request not found or already reviewed'), { status: 404 })

  await createAndEmit(
    rows[0].user_id, 'task_status_changed',
    'Đơn tăng ca bị từ chối',
    `Đơn OT ngày ${toDateStr(rows[0].ot_date)} bị từ chối. Lý do: ${rejectionNote ?? 'Không rõ'}`,
    null
  )

  return toDto(rows[0])
}

async function exportOvertimeRecords({ from, to, status, userId, fields, res }) {
  const ExcelJS = require('exceljs')

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  const conditions = ['1=1']
  const params = []
  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`o.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`o.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (from)   { params.push(from);   conditions.push(`o.ot_date >= $${params.length}`) }
  if (to)     { params.push(to);     conditions.push(`o.ot_date <= $${params.length}`) }
  const where = conditions.join(' AND ')

  const { rows } = await query(
    `SELECT o.*, u.name AS user_name,
            a.name AS approver_name,
            c.name AS client_company_name
     FROM overtime_requests o
     JOIN  users    u ON o.user_id          = u.id
     LEFT JOIN users    a ON o.approved_by      = a.id
     LEFT JOIN companies c ON o.client_company_id = c.id
     WHERE ${where}
     ORDER BY u.name, o.ot_date`,
    params
  )

  const STATUS_VI = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã huỷ' }
  const DOW_VI    = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  const ALL_COLS = [
    { key: 'userName',          header: 'Họ tên',         width: 24, required: true },
    { key: 'otDate',            header: 'Ngày tăng ca',   width: 14, required: true },
    { key: 'dayOfWeek',         header: 'Thứ',            width: 6  },
    { key: 'startTime',         header: 'Giờ bắt đầu',   width: 12 },
    { key: 'endTime',           header: 'Giờ kết thúc',  width: 12 },
    { key: 'otHours',           header: 'Số giờ OT',     width: 10 },
    { key: 'otRate',            header: 'Hệ số',         width: 8  },
    { key: 'statusLabel',       header: 'Trạng thái',    width: 14 },
    { key: 'clientCompanyName', header: 'Khách hàng',    width: 24 },
    { key: 'reason',            header: 'Lý do',         width: 28 },
    { key: 'approvalNote',      header: 'Ghi chú duyệt', width: 24 },
    { key: 'approverName',      header: 'Người duyệt',   width: 20 },
  ]

  const fieldSet     = new Set(fields)
  const selectedCols = ALL_COLS.filter((c) => c.required || fieldSet.has(c.key))

  const fmtDate = (d) => {
    if (!d) return '—'
    const [y, m, dy] = String(d).slice(0, 10).split('-')
    return `${dy}/${m}/${y}`
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'KeToanTamAn'
  const sheet = workbook.addWorksheet('Tăng ca')

  sheet.columns = [
    { key: 'stt', header: 'STT', width: 5 },
    ...selectedCols.map((c) => ({ key: c.key, header: c.header, width: c.width })),
  ]

  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF4B8EC8' } } }
  })
  headerRow.height = 22
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  // Group by employee
  const userGroups = new Map()
  rows.forEach((r) => {
    const name = r.user_name
    if (!userGroups.has(name)) userGroups.set(name, [])
    userGroups.get(name).push(r)
  })

  let sttIdx = 1
  let rowNum  = 2

  userGroups.forEach((userRows, userName) => {
    userRows.forEach((r) => {
      const dateObj = r.ot_date ? new Date(String(r.ot_date).slice(0, 10) + 'T00:00:00') : null
      const rowData = { stt: sttIdx++ }
      selectedCols.forEach((c) => {
        switch (c.key) {
          case 'userName':          rowData[c.key] = r.user_name;                                          break
          case 'otDate':            rowData[c.key] = fmtDate(r.ot_date);                                   break
          case 'dayOfWeek':         rowData[c.key] = dateObj ? DOW_VI[dateObj.getDay()] : '—';             break
          case 'startTime':         rowData[c.key] = r.start_time         ?? '—';                         break
          case 'endTime':           rowData[c.key] = r.end_time           ?? '—';                         break
          case 'otHours':           rowData[c.key] = r.ot_hours  != null ? parseFloat(r.ot_hours)  : 0;   break
          case 'otRate':            rowData[c.key] = r.ot_rate   != null ? `${r.ot_rate}x`         : '—'; break
          case 'statusLabel':       rowData[c.key] = STATUS_VI[r.status]  ?? r.status;                    break
          case 'clientCompanyName': rowData[c.key] = r.client_company_name ?? '—';                        break
          case 'reason':            rowData[c.key] = r.reason              ?? '—';                        break
          case 'approvalNote':      rowData[c.key] = r.approval_note       ?? '—';                        break
          case 'approverName':      rowData[c.key] = r.approver_name       ?? '—';                        break
        }
      })
      const addedRow = sheet.addRow(rowData)
      const fgColor  = rowNum % 2 === 0 ? 'FFF0F4FF' : 'FFFFFFFF'
      addedRow.eachCell((cell) => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fgColor } }
        cell.alignment = { vertical: 'middle' }
      })
      rowNum++
    })

    // Per-employee summary row — total approved OT hours
    const approvedOt = userRows
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + (r.ot_hours != null ? parseFloat(r.ot_hours) : 0), 0)

    const sumData = { stt: '' }
    selectedCols.forEach((c) => {
      if      (c.key === 'userName') sumData[c.key] = `∑ Tổng — ${userName}`
      else if (c.key === 'otHours')  sumData[c.key] = parseFloat(approvedOt.toFixed(2))
      else                           sumData[c.key] = ''
    })

    const sumRow = sheet.addRow(sumData)
    sumRow.font = { bold: true }
    sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDE0F7' } }
    sumRow.eachCell((cell) => {
      cell.border    = { top: { style: 'thin', color: { argb: 'FF4B8EC8' } } }
      cell.alignment = { vertical: 'middle' }
    })
    rowNum++
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="overtime_export.xlsx"')
  await workbook.xlsx.write(res)
  res.end()
}

module.exports = { listOvertimeRequests, createOvertimeRequest, approveOvertimeRequest, rejectOvertimeRequest, exportOvertimeRecords }
