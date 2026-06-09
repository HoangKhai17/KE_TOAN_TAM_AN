const { query } = require('../../config/db')
const { createAndEmit } = require('../../lib/notify')
const { calculateAttendanceRecord } = require('./attendance.service')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toDto(r) {
  return {
    id:            r.id,
    userId:        r.user_id,
    userName:      r.user_name     ?? undefined,
    leaveType:     r.leave_type,
    startDate:     r.start_date,
    endDate:       r.end_date,
    totalDays:     parseFloat(r.total_days),
    reason:        r.reason,
    status:        r.status,
    approvedBy:    r.approved_by,
    approverName:  r.approver_name ?? undefined,
    approvedAt:    r.approved_at,
    approvalNote:  r.approval_note  ?? undefined,
    rejectionNote: r.rejection_note ?? undefined,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function countWorkingDays(startDate, endDate) {
  const holidayRes = await query(
    'SELECT holiday_date FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2',
    [startDate, endDate]
  )
  const holidays = new Set(
    holidayRes.rows.map((r) => {
      const d = r.holiday_date instanceof Date ? r.holiday_date : new Date(r.holiday_date)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    })
  )

  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ey, em, ed] = endDate.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  let count = 0
  while (cur <= end) {
    const dow     = cur.getDay()
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    if (dow !== 0 && dow !== 6 && !holidays.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
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

async function listLeaveRequests({ userId, status, leaveType, from, to, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit
  const conditions = ['1=1']
  const params = []

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`l.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`l.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (leaveType) { params.push(leaveType); conditions.push(`l.leave_type = $${params.length}`) }
  if (from)      { params.push(from);      conditions.push(`l.start_date >= $${params.length}`) }
  if (to)        { params.push(to);        conditions.push(`l.end_date   <= $${params.length}`) }

  const where = conditions.join(' AND ')

  // Single query with window COUNT — eliminates the separate COUNT(*) round-trip
  const { rows } = await query(
    `SELECT l.*, u.name AS user_name, a.name AS approver_name, COUNT(*) OVER() AS _total
     FROM leave_requests l
     JOIN  users u ON l.user_id    = u.id
     LEFT JOIN users a ON l.approved_by = a.id
     WHERE ${where}
     ORDER BY l.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const total = parseInt(rows[0]?._total ?? 0, 10)
  return { requests: rows.map(toDto), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
}

async function createLeaveRequest({ userId, leaveType, startDate, endDate, reason }) {
  const totalDays = await countWorkingDays(startDate, endDate)

  const { rows } = await query(
    `INSERT INTO leave_requests (user_id, leave_type, start_date, end_date, total_days, reason)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, leaveType, startDate, endDate, totalDays, reason ?? null]
  )

  const userRes  = await query('SELECT name FROM users WHERE id = $1', [userId])
  const userName = userRes.rows[0]?.name ?? 'Nhân viên'
  await notifyAdmins(
    `Đơn nghỉ phép mới — ${userName}`,
    `${userName} đăng ký nghỉ (${leaveType}) từ ${startDate} đến ${endDate} (${totalDays} ngày công)`
  )

  return toDto(rows[0])
}

async function approveLeaveRequest(id, approvedBy, approvalNote) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'approved', approved_by = $1, approved_at = NOW(),
         approval_note = $3, updated_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [approvedBy, id, approvalNote ?? null]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })
  const leave = rows[0]

  // Recalculate attendance for every day in the leave period (parallel — each day is independent)
  const [sy, sm, sd] = toDateStr(leave.start_date).split('-').map(Number)
  const endStr = toDateStr(leave.end_date)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const datesToRecalc = []
  while (cur <= end) {
    datesToRecalc.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    cur.setDate(cur.getDate() + 1)
  }
  await Promise.all(
    datesToRecalc.map((d) => calculateAttendanceRecord(leave.user_id, d).catch(() => {}))
  )

  await createAndEmit(
    leave.user_id, 'task_status_changed',
    'Đơn nghỉ phép được duyệt',
    `Đơn nghỉ ${leave.leave_type} từ ${toDateStr(leave.start_date)} đến ${toDateStr(leave.end_date)} đã được duyệt.`,
    null
  )

  return toDto(rows[0])
}

async function rejectLeaveRequest(id, { rejectionNote, reviewedBy }) {
  const { rows } = await query(
    `UPDATE leave_requests
     SET status = 'rejected', approved_by = $1, approved_at = NOW(),
         rejection_note = $2, updated_at = NOW()
     WHERE id = $3 AND status = 'pending'
     RETURNING *`,
    [reviewedBy, rejectionNote ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or already reviewed'), { status: 404 })

  await createAndEmit(
    rows[0].user_id, 'task_status_changed',
    'Đơn nghỉ phép bị từ chối',
    `Đơn nghỉ ${rows[0].leave_type} từ ${toDateStr(rows[0].start_date)} đến ${toDateStr(rows[0].end_date)} bị từ chối. Lý do: ${rejectionNote ?? 'Không rõ'}`,
    null
  )

  return toDto(rows[0])
}

async function cancelLeaveRequest(id, userId) {
  const { rows } = await query(
    `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'pending'
     RETURNING *`,
    [id, userId]
  )
  if (!rows[0]) throw Object.assign(new Error('Leave request not found or cannot be cancelled'), { status: 404 })
  return toDto(rows[0])
}

async function exportLeaveRecords({ from, to, status, userId, fields, res }) {
  const ExcelJS = require('exceljs')

  const userIds  = Array.isArray(userId) ? userId : (userId ? [userId] : [])
  const statuses = Array.isArray(status) ? status : (status ? [status] : [])

  const conditions = ['1=1']
  const params = []
  if (userIds.length > 0) {
    const start = params.length + 1
    userIds.forEach((id) => params.push(id))
    conditions.push(`l.user_id IN (${userIds.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (statuses.length > 0) {
    const start = params.length + 1
    statuses.forEach((s) => params.push(s))
    conditions.push(`l.status::text IN (${statuses.map((_, i) => `$${start + i}`).join(', ')})`)
  }
  if (from)   { params.push(from);   conditions.push(`l.start_date >= $${params.length}`) }
  if (to)     { params.push(to);     conditions.push(`l.end_date   <= $${params.length}`) }
  const where = conditions.join(' AND ')

  const { rows } = await query(
    `SELECT l.*, u.name AS user_name, a.name AS approver_name
     FROM leave_requests l
     JOIN  users u ON l.user_id    = u.id
     LEFT JOIN users a ON l.approved_by = a.id
     WHERE ${where}
     ORDER BY u.name, l.start_date`,
    params
  )

  const STATUS_VI    = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', cancelled: 'Đã huỷ' }
  const LEAVE_TYPE_VI = {
    annual: 'Nghỉ phép năm', sick: 'Nghỉ ốm', compensatory: 'Nghỉ bù',
    unpaid: 'Nghỉ không lương', business_trip: 'Công tác', wfh: 'Làm từ xa',
  }

  const ALL_COLS = [
    { key: 'userName',      header: 'Họ tên',          width: 24, required: true },
    { key: 'leaveType',     header: 'Loại nghỉ',       width: 18, required: true },
    { key: 'startDate',     header: 'Ngày bắt đầu',    width: 14 },
    { key: 'endDate',       header: 'Ngày kết thúc',   width: 14 },
    { key: 'totalDays',     header: 'Số ngày',         width: 8  },
    { key: 'statusLabel',   header: 'Trạng thái',      width: 14 },
    { key: 'reason',        header: 'Lý do',           width: 28 },
    { key: 'approvalNote',  header: 'Ghi chú duyệt',   width: 24 },
    { key: 'rejectionNote', header: 'Lý do từ chối',   width: 24 },
    { key: 'approverName',  header: 'Người duyệt',     width: 20 },
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
  const sheet = workbook.addWorksheet('Nghỉ phép')

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
      const rowData = { stt: sttIdx++ }
      selectedCols.forEach((c) => {
        switch (c.key) {
          case 'userName':      rowData[c.key] = r.user_name;                                    break
          case 'leaveType':     rowData[c.key] = LEAVE_TYPE_VI[r.leave_type] ?? r.leave_type;   break
          case 'startDate':     rowData[c.key] = fmtDate(r.start_date);                          break
          case 'endDate':       rowData[c.key] = fmtDate(r.end_date);                            break
          case 'totalDays':     rowData[c.key] = r.total_days != null ? parseFloat(r.total_days) : 0; break
          case 'statusLabel':   rowData[c.key] = STATUS_VI[r.status]   ?? r.status;             break
          case 'reason':        rowData[c.key] = r.reason               ?? '—';                 break
          case 'approvalNote':  rowData[c.key] = r.approval_note        ?? '—';                 break
          case 'rejectionNote': rowData[c.key] = r.rejection_note       ?? '—';                 break
          case 'approverName':  rowData[c.key] = r.approver_name        ?? '—';                 break
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

    // Per-employee summary row — total approved leave days
    const approvedDays = userRows
      .filter((r) => r.status === 'approved')
      .reduce((s, r) => s + (r.total_days != null ? parseFloat(r.total_days) : 0), 0)

    const sumData = { stt: '' }
    selectedCols.forEach((c) => {
      if      (c.key === 'userName')  sumData[c.key] = `∑ Tổng — ${userName}`
      else if (c.key === 'totalDays') sumData[c.key] = parseFloat(approvedDays.toFixed(2))
      else                            sumData[c.key] = ''
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
  res.setHeader('Content-Disposition', 'attachment; filename="leave_export.xlsx"')
  await workbook.xlsx.write(res)
  res.end()
}

module.exports = { listLeaveRequests, createLeaveRequest, approveLeaveRequest, rejectLeaveRequest, cancelLeaveRequest, exportLeaveRecords }
