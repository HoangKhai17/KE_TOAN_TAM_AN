const { query }                          = require('../../config/db')
const { sendMail }                       = require('../../utils/mailer')
const { getTemplate, renderTemplate }    = require('../../utils/emailTemplates')
const { DAILY_VIEW, summaryColumns, getStrictUnpaidFrom } = require('./aggregate.sql')

// ── DTOs ──────────────────────────────────────────────────────────────────────

function toRecordDto(r) {
  return {
    id:              r.id,
    userId:          r.user_id,
    userName:        r.user_name    ?? undefined,
    workDate:        r.work_date,
    shiftId:         r.shift_id,
    shiftName:       r.shift_name   ?? undefined,
    checkInTime:     r.check_in_time,
    checkOutTime:    r.check_out_time,
    actualHours:     r.actual_hours  != null ? parseFloat(r.actual_hours) : null,
    lateMinutes:     r.late_minutes  ?? 0,
    earlyMinutes:    r.early_minutes ?? 0,
    workUnits:       r.work_units    != null ? parseFloat(r.work_units) : 0,
    status:          r.status,
    isAdjusted:      r.is_adjusted,
    isHoliday:       r.is_holiday,
    leaveRequestId:  r.leave_request_id,
    otHours:         parseFloat(r.effective_ot_hours ?? r.ot_hours ?? 0),
    notes:           r.notes,
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  }
}

function toLogDto(r) {
  return {
    id:         r.id,
    userId:     r.user_id,
    logType:    r.log_type,
    loggedAt:   r.logged_at,
    method:     r.method,
    deviceInfo: r.device_info,
    ipAddress:  r.ip_address,
    notes:      r.notes,
  }
}

// ── Work Schedule Resolution ──────────────────────────────────────────────────
// Returns an effective "ws" object for a given date — either from an explicit
// override in work_schedules, or derived from system config (day-of-week + shifts).
// Returns null if the date is a day off with no logs to record.

async function resolveWorkSchedule(date) {
  const jsDay = new Date(date + 'T00:00:00').getDay() // 0=Sun, 6=Sat

  // 1. Read both system config keys in one query
  const cfgRes = await query(
    `SELECT key, value FROM system_configs WHERE key IN ('attendance.default_shift_id', 'attendance.saturday_shift_id')`
  )
  const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value ?? '']))
  const defaultShiftId  = cfg['attendance.default_shift_id']  || null
  const saturdayShiftId = cfg['attendance.saturday_shift_id'] || null

  // Determine the applicable shiftId for this day
  let shiftId = null
  let isDayOff = false

  if (jsDay === 0) {
    isDayOff = true // Sunday always off
  } else if (jsDay === 6) {
    shiftId  = saturdayShiftId
    isDayOff = !shiftId  // Saturday: off if no shift configured
  } else {
    shiftId = defaultShiftId
  }

  if (isDayOff) return { is_day_off: true, shift_id: null }

  // 2. Fetch shift details
  const shift = shiftId
    ? (await query('SELECT * FROM shifts WHERE id = $1', [shiftId])).rows[0] ?? null
    : null

  return {
    shift_id:       shiftId,
    is_day_off:     false,
    start_time:     shift?.start_time     ?? null,
    end_time:       shift?.end_time       ?? null,
    break_minutes:  shift?.break_minutes  ?? 60,
    required_hours: shift?.required_hours ?? null,
    tolerance_in:   shift?.tolerance_in   ?? 15,
    tolerance_out:  shift?.tolerance_out  ?? 15,
    shift_type:     shift?.shift_type     ?? null,
  }
}

// ── Helpers cho phép tính đơn vị công ─────────────────────────────────────────

// Làm tròn 3 chữ số — khớp NUMERIC(4,3) của cột đơn vị công. Cần thiết vì
// paid_rate 0.75 × nửa ngày = 0.375, và phép cộng số thực dễ sinh đuôi 0.30000000004.
const round3 = (n) => Math.round(n * 1000) / 1000

// Số giờ chuẩn của ca: ưu tiên required_hours khai báo, nếu không thì suy ra từ
// giờ bắt đầu/kết thúc trừ nghỉ trưa. Fallback 8h khi ca chưa cấu hình gì.
function deriveRequiredHours(ws) {
  if (ws?.required_hours != null) return parseFloat(ws.required_hours)
  if (ws?.start_time && ws?.end_time) {
    const [sh, sm] = ws.start_time.split(':').map(Number)
    const [eh, em] = ws.end_time.split(':').map(Number)
    const h = (eh * 60 + em - sh * 60 - sm) / 60 - (ws.break_minutes ?? 60) / 60
    if (h > 0) return h
  }
  return 8
}

// Quy đổi thời lượng đơn nghỉ ra đơn vị công (tối đa 1.0 cho một ngày).
function unitsFromDayPart(dayPart, hours, requiredHours) {
  switch (dayPart) {
    case 'morning':
    case 'afternoon': return 0.5
    case 'hours':     return round3(Math.min(1, (parseFloat(hours) || 0) / (requiredHours || 8)))
    default:          return 1.0   // 'full' và mọi giá trị lạ
  }
}

// ── Core Calculation ──────────────────────────────────────────────────────────

async function calculateAttendanceRecord(userId, date) {
  // Step 1: Check for an explicit work_schedule override for this user/date.
  // These are written only for exceptions (e.g. a specific day off, or a
  // different shift for one employee). Fall back to system-derived schedule.
  const wsOverrideRes = await query(
    `SELECT ws.*, ws.is_day_off,
            s.start_time, s.end_time, s.break_minutes, s.required_hours,
            s.tolerance_in, s.tolerance_out, s.shift_type
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ws.user_id = $1 AND ws.work_date = $2`,
    [userId, date]
  )
  const ws = wsOverrideRes.rows[0] ?? await resolveWorkSchedule(date)

  // Step 2: day off → no record needed
  if (ws.is_day_off) return null

  const requiredHours = deriveRequiredHours(ws)

  // Step 3: public holiday — nghỉ HƯỞNG LƯƠNG, không phải công thực tế
  const holidayRes = await query(
    'SELECT name FROM public_holidays WHERE holiday_date = $1',
    [date]
  )
  if (holidayRes.rows.length > 0) {
    const { rows } = await query(
      `INSERT INTO attendance_records
         (user_id, work_date, shift_id, status, work_units, paid_leave_units, unpaid_leave_units, is_holiday)
       VALUES ($1, $2, $3, 'holiday', 0, 1.0, 0, TRUE)
       ON CONFLICT (user_id, work_date) DO UPDATE SET
         status = 'holiday', work_units = 0, paid_leave_units = 1.0, unpaid_leave_units = 0,
         is_holiday = TRUE, shift_id = $3, updated_at = NOW()
       RETURNING *`,
      [userId, date, ws.shift_id ?? null]
    )
    return toRecordDto(rows[0])
  }

  // Step 4: đơn nghỉ đã duyệt phủ ngày này + chính sách của loại nghỉ đó
  const leaveRes = await query(
    `SELECT lr.id, lr.leave_type, lr.day_part, lr.hours,
            p.is_paid, p.paid_rate, p.counts_as_work, p.maps_to_status
     FROM leave_requests lr
     LEFT JOIN leave_policies p ON p.leave_type = lr.leave_type
     WHERE lr.user_id = $1 AND lr.status = 'approved'
       AND lr.start_date <= $2 AND lr.end_date >= $2
     ORDER BY lr.created_at
     LIMIT 1`,
    [userId, date]
  )
  const leave = leaveRes.rows[0] ?? null

  // Chính sách mặc định khi loại nghỉ chưa được cấu hình: nghỉ có lương nguyên ngày.
  const policy = leave
    ? {
        isPaid:       leave.is_paid       ?? true,
        paidRate:     leave.paid_rate     != null ? parseFloat(leave.paid_rate) : 1,
        countsAsWork: leave.counts_as_work ?? false,
        mapsToStatus: leave.maps_to_status ?? 'on_leave',
      }
    : null

  // Step 5: quy đổi thời lượng đơn nghỉ ra ĐƠN VỊ CÔNG
  //   full = 1.0 · morning/afternoon = 0.5 · hours = số giờ / giờ chuẩn của ca
  let leaveUnits  = 0   // phần NGHỈ (annual/sick/unpaid…)
  let workFromLeave = 0 // phần vẫn tính là ĐANG LÀM VIỆC (wfh, công tác)
  if (leave) {
    const u = unitsFromDayPart(leave.day_part, leave.hours, requiredHours)
    if (policy.countsAsWork) workFromLeave = u
    else                     leaveUnits    = u
  }

  // Step 6: công thực tế — chỉ tính cho phần ngày CÒN LẠI sau khi trừ đơn nghỉ.
  // Đây là điểm khác căn bản so với bản cũ: trước đây đơn nghỉ GHI ĐÈ cả ngày,
  // nên "nửa ngày làm + nửa ngày nghỉ" không thể biểu diễn được.
  const remaining = round3(1 - leaveUnits - workFromLeave)

  let workUnits     = workFromLeave
  let checkInTime   = null
  let checkOutTime  = null
  let actualHours   = null
  let lateMinutes   = 0
  let earlyMinutes  = 0
  let timeStatus    = null

  const userRoleRes = await query('SELECT role FROM users WHERE id = $1', [userId])
  const isAdmin = userRoleRes.rows[0]?.role === 'admin'

  if (remaining > 0.001) {
    if (isAdmin) {
      // Admin đủ công tự động — nhưng CHỈ phần ngày không nghỉ.
      workUnits = round3(workUnits + remaining)
      timeStatus = 'present'
      if (ws.start_time) checkInTime  = `${date} ${ws.start_time}`
      if (ws.end_time)   checkOutTime = `${date} ${ws.end_time}`
      if (ws.start_time && ws.end_time) {
        const [sh, sm] = ws.start_time.split(':').map(Number)
        const [eh, em] = ws.end_time.split(':').map(Number)
        actualHours = Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60 - (ws.break_minutes ?? 60) / 60)
      }
    } else {
      const timesRes = await query(
        `SELECT
           MIN(logged_at) FILTER (WHERE log_type = 'check_in')  AS check_in_time,
           MAX(logged_at) FILTER (WHERE log_type = 'check_out') AS check_out_time
         FROM attendance_logs
         WHERE user_id = $1 AND logged_at::date = $2`,
        [userId, date]
      )
      checkInTime  = timesRes.rows[0].check_in_time  ?? null
      checkOutTime = timesRes.rows[0].check_out_time ?? null

      if (checkInTime) {
        // Nghỉ trưa trừ theo TỈ LỆ phần ngày còn phải làm: người nghỉ phép buổi chiều
        // chỉ làm buổi sáng thì không ăn trọn 1 tiếng nghỉ trưa của cả ngày.
        const breakHours = (ws.break_minutes ?? 60) / 60 * remaining
        if (checkOutTime) {
          const diffHours = (new Date(checkOutTime) - new Date(checkInTime)) / 3600000
          actualHours = Math.max(0, diffHours - breakHours)
        }

        // Nghỉ có phép một phần ngày thì KHÔNG tính trễ/sớm ở phía được nghỉ:
        // nghỉ phép buổi chiều mà bị gắn nhãn "Về sớm" là sai và gây oan cho nhân viên.
        const partial     = leaveUnits > 0 && leaveUnits < 1
        const skipLate    = partial && (leave?.day_part === 'morning'   || leave?.day_part === 'hours')
        const skipEarly   = partial && (leave?.day_part === 'afternoon' || leave?.day_part === 'hours')

        if (ws.start_time && !skipLate) {
          const [sh, sm] = ws.start_time.split(':').map(Number)
          const ciDate = new Date(checkInTime)
          const shiftStart = new Date(ciDate)
          shiftStart.setHours(sh, sm, 0, 0)
          const diffMin = (ciDate - shiftStart) / 60000
          const tol = ws.tolerance_in ?? 15
          if (diffMin > tol) lateMinutes = Math.floor(diffMin - tol)
        }
        if (ws.end_time && checkOutTime && !skipEarly) {
          const [eh, em] = ws.end_time.split(':').map(Number)
          const coDate = new Date(checkOutTime)
          const shiftEnd = new Date(coDate)
          shiftEnd.setHours(eh, em, 0, 0)
          const diffMin = (shiftEnd - coDate) / 60000
          const tol = ws.tolerance_out ?? 15
          if (diffMin > tol) earlyMinutes = Math.floor(diffMin - tol)
        }

        // Ngưỡng công theo tỉ lệ giờ làm — so với giờ chuẩn của PHẦN NGÀY CÒN LẠI,
        // không phải cả ngày. Nghỉ phép buổi chiều rồi làm đủ buổi sáng thì phải
        // được trọn 0.5 công; nếu so với 8 giờ cả ngày sẽ ra 0 công.
        let logUnits = 0
        const requiredForPortion = requiredHours * remaining
        if (actualHours != null && requiredForPortion > 0) {
          const ratio = actualHours / requiredForPortion
          if (ratio >= 0.8)      logUnits = remaining
          else if (ratio >= 0.5) logUnits = round3(remaining * 0.5)
        }
        workUnits = round3(workUnits + Math.min(logUnits, remaining))

        if (lateMinutes > 0 && earlyMinutes > 0) timeStatus = 'late_and_early'
        else if (lateMinutes > 0)                timeStatus = 'late'
        else if (earlyMinutes > 0)               timeStatus = 'early_leave'
        else                                     timeStatus = 'present'
      }
    }
  }

  // Step 7: chia phần nghỉ theo chính sách hưởng lương
  const paidLeaveUnits   = policy && policy.isPaid ? round3(leaveUnits * policy.paidRate) : 0
  const unpaidLeaveUnits = round3(leaveUnits - paidLeaveUnits)

  // Step 8: status giờ chỉ là NHÃN HIỂN THỊ — mọi phép tính công đọc từ các cột đơn vị.
  //   nghỉ trọn ngày            → nhãn của loại nghỉ
  //   có đi làm (dù nửa ngày)   → nhãn theo giờ chấm công
  //   không làm, có nghỉ một phần → nhãn của loại nghỉ
  //   không làm, không nghỉ     → vắng mặt
  let status
  if (leave && leaveUnits >= 0.999)      status = policy.mapsToStatus
  else if (workUnits > 0)                status = timeStatus ?? 'present'
  else if (leaveUnits > 0)               status = policy.mapsToStatus
  else                                   status = 'absent'

  // Step 9: upsert. is_adjusted đóng băng phần admin đã sửa tay (giờ vào/ra, công
  // thực tế, nhãn) nhưng KHÔNG đóng băng phần nghỉ — đơn nghỉ duyệt sau là thông tin
  // mới hợp lệ, và leave_request_id luôn phải phản ánh đúng thực tế.
  const { rows } = await query(
    `INSERT INTO attendance_records
       (user_id, work_date, shift_id, check_in_time, check_out_time, actual_hours,
        late_minutes, early_minutes, work_units, paid_leave_units, unpaid_leave_units,
        status, leave_request_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id, work_date) DO UPDATE SET
       shift_id       = $3,
       check_in_time  = CASE WHEN attendance_records.is_adjusted THEN attendance_records.check_in_time  ELSE $4  END,
       check_out_time = CASE WHEN attendance_records.is_adjusted THEN attendance_records.check_out_time ELSE $5  END,
       actual_hours   = CASE WHEN attendance_records.is_adjusted THEN attendance_records.actual_hours   ELSE $6  END,
       late_minutes   = CASE WHEN attendance_records.is_adjusted THEN attendance_records.late_minutes   ELSE $7  END,
       early_minutes  = CASE WHEN attendance_records.is_adjusted THEN attendance_records.early_minutes  ELSE $8  END,
       -- Giữ điều chỉnh tay của admin, NHƯNG vẫn phải lọt trần 1.0: nếu ngày đó
       -- sau này được duyệt nghỉ nửa/cả ngày thì phần công thực tế phải co lại,
       -- nếu không CHECK sẽ chặn và cả lần tính lại bị huỷ.
       work_units     = CASE WHEN attendance_records.is_adjusted
                             THEN LEAST(attendance_records.work_units, 1.0 - $10 - $11)
                             ELSE $9 END,
       status         = CASE WHEN attendance_records.is_adjusted THEN attendance_records.status         ELSE $12 END,
       notes          = CASE WHEN attendance_records.is_adjusted THEN attendance_records.notes          ELSE $14 END,
       paid_leave_units   = $10,
       unpaid_leave_units = $11,
       leave_request_id   = $13,
       updated_at         = NOW()
     RETURNING *`,
    [userId, date, ws.shift_id ?? null, checkInTime, checkOutTime, actualHours,
     lateMinutes, earlyMinutes, workUnits, paidLeaveUnits, unpaidLeaveUnits,
     status, leave?.id ?? null, isAdmin && remaining > 0.001 ? 'Tự động - Admin' : null]
  )
  return toRecordDto(rows[0])
}

// ── Check-in / Check-out ──────────────────────────────────────────────────────

async function checkIn({ userId, method = 'web', notes, ip, deviceInfo }) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const { rows: logRows } = await query(
    `INSERT INTO attendance_logs (user_id, log_type, method, device_info, ip_address, notes)
     VALUES ($1, 'check_in', $2, $3, $4, $5)
     RETURNING *`,
    [userId, method, deviceInfo ?? null, ip ?? null, notes ?? null]
  )

  const record = await calculateAttendanceRecord(userId, dateStr)
  return { log: toLogDto(logRows[0]), record }
}

async function checkOut({ userId, method = 'web', notes, ip, deviceInfo }) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const hasCheckIn = await query(
    `SELECT id FROM attendance_logs WHERE user_id = $1 AND log_type = 'check_in' AND logged_at::date = $2 LIMIT 1`,
    [userId, dateStr]
  )
  if (hasCheckIn.rows.length === 0) {
    throw Object.assign(new Error('Chưa có check-in cho ngày hôm nay'), { status: 400 })
  }

  const { rows: logRows } = await query(
    `INSERT INTO attendance_logs (user_id, log_type, method, device_info, ip_address, notes)
     VALUES ($1, 'check_out', $2, $3, $4, $5)
     RETURNING *`,
    [userId, method, deviceInfo ?? null, ip ?? null, notes ?? null]
  )

  const record = await calculateAttendanceRecord(userId, dateStr)
  return { log: toLogDto(logRows[0]), record }
}

async function getToday(userId) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [logsRes, recordRes] = await Promise.all([
    query(
      `SELECT log_type, logged_at, method
       FROM attendance_logs
       WHERE user_id = $1 AND logged_at::date = $2
       ORDER BY logged_at`,
      [userId, dateStr]
    ),
    query(
      `SELECT ar.*, s.name AS shift_name
       FROM attendance_records ar
       LEFT JOIN shifts s ON ar.shift_id = s.id
       WHERE ar.user_id = $1 AND ar.work_date = $2`,
      [userId, dateStr]
    ),
  ])

  const checkIns  = logsRes.rows.filter((l) => l.log_type === 'check_in')
  const checkOuts = logsRes.rows.filter((l) => l.log_type === 'check_out')

  return {
    date:          dateStr,
    hasCheckedIn:  checkIns.length  > 0,
    checkInTime:   checkIns[0]?.logged_at  ?? null,
    hasCheckedOut: checkOuts.length > 0,
    checkOutTime:  checkOuts[checkOuts.length - 1]?.logged_at ?? null,
    checkInCount:  checkIns.length,
    checkOutCount: checkOuts.length,
    record:        recordRes.rows[0] ? toRecordDto(recordRes.rows[0]) : null,
  }
}

// ── List / Summary ────────────────────────────────────────────────────────────

async function listAttendanceRecords({ userId, month, year, from: fromOverride, to: toOverride, status, page = 1, limit = 31 } = {}) {
  let from, to
  if (fromOverride && toOverride) {
    from = fromOverride
    to   = toOverride
  } else {
    const y = parseInt(year, 10)
    const m = parseInt(month, 10)
    from = `${y}-${String(m).padStart(2, '0')}-01`
    const lastDay = new Date(y, m, 0).getDate()
    to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }

  const conditions = ['ar.work_date BETWEEN $1 AND $2']
  const params = [from, to]

  if (userId) { params.push(userId); conditions.push(`ar.user_id = $${params.length}`) }
  if (status) { params.push(status); conditions.push(`ar.status  = $${params.length}`) }

  const where  = conditions.join(' AND ')
  const offset = (page - 1) * limit

  // Single query with window COUNT — eliminates the separate COUNT(*) round-trip
  // LEFT JOIN overtime_requests to surface approved OT per day (ar.ot_hours may be 0)
  const { rows } = await query(
    `SELECT ar.*, u.name AS user_name, s.name AS shift_name,
            COALESCE(ot_day.approved_ot, ar.ot_hours, 0) AS effective_ot_hours,
            COUNT(*) OVER() AS _total
     FROM attendance_records ar
     JOIN  users u ON ar.user_id  = u.id
     LEFT JOIN shifts s ON ar.shift_id = s.id
     LEFT JOIN (
       SELECT user_id, ot_date, SUM(ot_hours) AS approved_ot
       FROM overtime_requests
       WHERE status = 'approved' AND ot_date BETWEEN $1 AND $2
       GROUP BY user_id, ot_date
     ) ot_day ON ot_day.user_id = ar.user_id AND ot_day.ot_date = ar.work_date
     WHERE ${where}
     ORDER BY ar.work_date DESC, u.name
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  const total = parseInt(rows[0]?._total ?? 0, 10)
  return {
    records: rows.map(toRecordDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  }
}

async function getAttendanceSummary({ userId, month, year }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const cutoff    = await getStrictUnpaidFrom()
  const params    = userId ? [from, to, cutoff, userId] : [from, to, cutoff]
  const extraCond = userId ? 'AND ar.user_id = $4' : ''

  const { rows } = await query(
    `SELECT
       u.id         AS user_id,
       u.name       AS user_name,
       u.job_title,
       ${summaryColumns('$3')},
       COUNT(ar.id) AS total_records
     FROM users u
     LEFT JOIN ${DAILY_VIEW} ar
       ON ar.user_id = u.id AND ar.work_date BETWEEN $1 AND $2
       ${extraCond}
     WHERE u.status IN ('active','on_leave')
     GROUP BY u.id, u.name, u.job_title
     ORDER BY u.name`,
    params
  )

  return rows.map((r) => ({
    userId:        r.user_id,
    userName:      r.user_name,
    jobTitle:      r.job_title,
    actualWorkDays:  parseFloat(r.actual_work_days),
    leavePaidDays:   parseFloat(r.leave_paid_days),
    unpaidLeaveDays: parseFloat(r.unpaid_leave_days),
    absentDays:     parseInt(r.absent_days,    10),
    lateCount:      parseInt(r.late_count,     10),
    earlyCount:     parseInt(r.early_count,    10),
    totalOtHours:   parseFloat(r.total_ot_hours),
    totalRecords:   parseInt(r.total_records,  10),
  }))
}

// ── Attendance Confirmation Email ─────────────────────────────────────────────

const STATUS_LABEL = {
  present: 'Có mặt', late: 'Đi muộn', early_leave: 'Về sớm',
  late_and_early: 'Muộn & Sớm', absent: 'Vắng mặt', on_leave: 'Nghỉ phép',
  business_trip: 'Công tác', wfh: 'WFH', holiday: 'Nghỉ lễ', unscheduled: '—',
}

const STATUS_COLOR = {
  present: '#047857', late: '#b45309', early_leave: '#c2410c',
  late_and_early: '#7e22ce', absent: '#dc2626', on_leave: '#4f46e5',
  business_trip: '#0e7490', wfh: '#8b5cf6', holiday: '#be123c', unscheduled: '#64748b',
}

function buildAttendanceTableHtml(records, month, year) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const recMap = {}
  records.forEach((r) => { recMap[String(r.workDate).slice(0, 10)] = r })

  const pad = (n) => String(n).padStart(2, '0')
  const fmtTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

  let rows = ''
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${pad(month)}-${pad(d)}`
    const jsDay  = new Date(dateStr + 'T00:00:00').getDay()
    const rec    = recMap[dateStr]
    const isWeekend = jsDay === 0 || jsDay === 6
    const bgRow  = isWeekend ? '#f8fafc' : '#ffffff'
    const label  = rec ? (STATUS_LABEL[rec.status] ?? '—') : '—'
    const color  = rec ? (STATUS_COLOR[rec.status] ?? '#64748b') : '#94a3b8'
    const checkIn  = rec?.checkInTime  ? fmtTime(rec.checkInTime)  : '—'
    const checkOut = rec?.checkOutTime ? fmtTime(rec.checkOutTime) : '—'
    const late  = rec?.lateMinutes  > 0 ? `+${rec.lateMinutes}p` : ''
    const early = rec?.earlyMinutes > 0 ? `-${rec.earlyMinutes}p` : ''

    rows += `
    <tr style="background:${bgRow}">
      <td style="padding:7px 12px;border:1px solid #e2e8f0;color:#64748b;text-align:center;white-space:nowrap">
        ${d} <span style="font-size:11px;color:#94a3b8">(${dayNames[jsDay]})</span>
      </td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;font-weight:600;color:${color}">${label}</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">${checkIn}</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center">${checkOut}</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#d97706">${late}</td>
      <td style="padding:7px 12px;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#c2410c">${early}</td>
    </tr>`
  }

  return `
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#1e3a8a;color:#fff">
        <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Ngày</th>
        <th style="padding:8px 12px;border:1px solid #1e40af">Trạng thái</th>
        <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Giờ vào</th>
        <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Giờ ra</th>
        <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Muộn</th>
        <th style="padding:8px 12px;border:1px solid #1e40af;text-align:center">Sớm</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

async function sendAttendanceConfirmation({ month, year }) {
  const m = parseInt(month, 10)
  const y = parseInt(year, 10)
  const pad = (n) => String(n).padStart(2, '0')
  const from = `${y}-${pad(m)}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${pad(m)}-${pad(lastDay)}`
  const monthYear = `Tháng ${pad(m)}/${y}`

  // Fetch all active staff with email + attendance summary + approved OT in parallel
  const [
    { rows: users },
    { rows: attSummaryRows },
    { rows: otRows },
  ] = await Promise.all([
    query(
      `SELECT id, name, email FROM users
       WHERE role = 'staff' AND status IN ('active','on_leave')
         AND email IS NOT NULL AND email <> ''
       ORDER BY name`
    ),
    // Summary per user matching the report's logic (work_units sums, not raw counts)
    query(
      `SELECT
         u.id AS user_id,
         ${summaryColumns('$3')}
       FROM users u
       LEFT JOIN ${DAILY_VIEW} ar
         ON ar.user_id = u.id AND ar.work_date BETWEEN $1 AND $2
       WHERE u.role = 'staff' AND u.status IN ('active','on_leave')
       GROUP BY u.id`,
      [from, to, await getStrictUnpaidFrom()]
    ),
    // Approved OT from overtime_requests (same source as Report tab)
    query(
      `SELECT user_id, COALESCE(SUM(ot_hours), 0) AS approved_ot_hours
       FROM overtime_requests
       WHERE ot_date BETWEEN $1 AND $2 AND status = 'approved'
       GROUP BY user_id`,
      [from, to]
    ),
  ])

  if (users.length === 0) return { sent: 0, failed: 0, skipped: 0 }

  // Build lookup maps
  const summaryMap = new Map(attSummaryRows.map((r) => [r.user_id, r]))
  const otMap      = new Map(otRows.map((r) => [r.user_id, parseFloat(r.approved_ot_hours ?? 0)]))

  // Fetch all attendance records for the month (for per-day detail table)
  const { rows: allRows } = await query(
    `SELECT ar.*, u.name AS user_name
     FROM attendance_records ar
     JOIN users u ON ar.user_id = u.id
     WHERE ar.work_date BETWEEN $1 AND $2
     ORDER BY ar.user_id, ar.work_date`,
    [from, to]
  )
  const recsByUser = {}
  allRows.forEach((r) => {
    if (!recsByUser[r.user_id]) recsByUser[r.user_id] = []
    recsByUser[r.user_id].push(toRecordDto(r))
  })

  const tpl = await getTemplate('email_tpl_attendance_confirmation')

  let sent = 0, failed = 0, skipped = 0
  await Promise.all(users.map(async (user) => {
    const records  = recsByUser[user.id] ?? []
    const summary  = summaryMap.get(user.id)
    const workDays   = parseFloat(summary?.actual_work_days  ?? 0)
    const leaveDays  = parseFloat(summary?.leave_paid_days   ?? 0)
    const unpaidDays = parseFloat(summary?.unpaid_leave_days ?? 0)
    // Tổng công hưởng lương KHÔNG gồm nghỉ không lương
    const totalWork = workDays + leaveDays
    const absentDays = parseInt(summary?.absent_days ?? 0, 10)
    const lateCnt    = parseInt(summary?.late_count  ?? 0, 10)
    const earlyCnt   = parseInt(summary?.early_count ?? 0, 10)
    const otHours    = otMap.get(user.id) ?? 0

    const attendanceTable = buildAttendanceTableHtml(records, m, y)
    const html = renderTemplate(tpl, {
      user_name:        user.name,
      month_year:       monthYear,
      work_days:        workDays.toFixed(1),
      leave_days:       leaveDays.toFixed(1),
      unpaid_days:      unpaidDays.toFixed(1),
      total_work:       totalWork.toFixed(1),
      absent_days:      String(absentDays),
      late_count:       String(lateCnt),
      early_count:      String(earlyCnt),
      ot_hours:         otHours.toFixed(1),
      attendance_table: attendanceTable,
    })

    const ok = await sendMail({
      to:      user.email,
      subject: `[Kế Toán Tâm An] Bảng chấm công ${monthYear} — ${user.name}`,
      html,
    })
    if (ok) sent++; else failed++
  }))

  return { sent, failed, skipped, total: users.length }
}

// ── Device Summary (first check-in per user per day for a month) ─────────────
// Returns the FIRST check_in log per user per day, carrying device_info + method + ip.
// Used by admin calendar/table views to show which device was used to check in.

async function getDeviceSummary({ userId, month, year }) {
  const y  = parseInt(year,  10)
  const m  = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const to   = `${y}-${String(m + 1).padStart(2, '0')}-01`  // exclusive upper bound

  const params = [from, to]
  const userCond = userId ? `AND user_id = $3` : ''
  if (userId) params.push(userId)

  const { rows } = await query(
    `SELECT DISTINCT ON (user_id, logged_at::date)
       user_id,
       logged_at::date AS work_date,
       method,
       device_info,
       ip_address
     FROM attendance_logs
     WHERE log_type = 'check_in'
       AND logged_at >= $1::date
       AND logged_at <  $2::date
       ${userCond}
     ORDER BY user_id, logged_at::date, logged_at ASC`,
    params
  )

  return rows.map((r) => ({
    userId:     r.user_id,
    workDate:   String(r.work_date).slice(0, 10),
    method:     r.method,
    deviceInfo: r.device_info,
    ipAddress:  r.ip_address,
  }))
}

// ── Attendance Logs (per user per date) ──────────────────────────────────────

async function getAttendanceLogs(userId, date) {
  const { rows } = await query(
    `SELECT id, log_type, logged_at, method, device_info, ip_address, notes
     FROM attendance_logs
     WHERE user_id = $1 AND logged_at::date = $2
     ORDER BY logged_at ASC`,
    [userId, date]
  )
  return rows.map(toLogDto)
}

module.exports = {
  calculateAttendanceRecord,
  checkIn,
  checkOut,
  getToday,
  listAttendanceRecords,
  getAttendanceSummary,
  sendAttendanceConfirmation,
  getAttendanceLogs,
  getDeviceSummary,
}
