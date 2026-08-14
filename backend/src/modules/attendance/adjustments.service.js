const { query } = require('../../config/db')
const { calculateAttendanceRecord } = require('./attendance.service')

// ── DTO ───────────────────────────────────────────────────────────────────────

function toRecordDto(r) {
  return {
    id:             r.id,
    userId:         r.user_id,
    workDate:       r.work_date,
    shiftId:        r.shift_id,
    checkInTime:    r.check_in_time,
    checkOutTime:   r.check_out_time,
    actualHours:    r.actual_hours  != null ? parseFloat(r.actual_hours) : null,
    lateMinutes:    r.late_minutes  ?? 0,
    earlyMinutes:   r.early_minutes ?? 0,
    workUnits:      r.work_units    != null ? parseFloat(r.work_units) : 0,
    status:         r.status,
    isAdjusted:     r.is_adjusted,
    isHoliday:      r.is_holiday,
    leaveRequestId: r.leave_request_id,
    otHours:        r.ot_hours != null ? parseFloat(r.ot_hours) : 0,
    notes:          r.notes,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
  }
}

function toAdjDto(r) {
  return {
    id:                  r.id,
    attendanceRecordId:  r.attendance_record_id,
    fieldName:           r.field_name,
    beforeValue:         r.before_value,
    afterValue:          r.after_value,
    reason:              r.reason,
    adjustedBy:          r.adjusted_by,
    adjusterName:        r.adjuster_name ?? undefined,
    adjustedAt:          r.adjusted_at,
  }
}

function toDateStr(d) {
  if (!d) return null
  const obj = d instanceof Date ? d : new Date(d)
  return `${obj.getUTCFullYear()}-${String(obj.getUTCMonth() + 1).padStart(2, '0')}-${String(obj.getUTCDate()).padStart(2, '0')}`
}

// ── Work schedule resolver (override → system config fallback) ────────────────

async function resolveWsForDate(userId, workDate) {
  const dateStr = String(workDate).slice(0, 10)

  // Check per-user override first
  const ovRes = await query(
    `SELECT ws.*, s.start_time, s.end_time, s.break_minutes, s.required_hours,
            s.tolerance_in, s.tolerance_out
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ws.user_id = $1 AND ws.work_date = $2`,
    [userId, dateStr]
  )
  if (ovRes.rows[0]) return ovRes.rows[0]

  // Fall back to system config
  const jsDay = new Date(dateStr + 'T00:00:00').getDay()
  const cfgRes = await query(
    `SELECT key, value FROM system_configs
     WHERE key IN ('attendance.default_shift_id','attendance.saturday_shift_id')`
  )
  const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value ?? '']))
  let shiftId = null
  if (jsDay === 0) return null
  else if (jsDay === 6) shiftId = cfg['attendance.saturday_shift_id'] || null
  else shiftId = cfg['attendance.default_shift_id'] || null
  if (!shiftId) return null

  const shiftRes = await query('SELECT * FROM shifts WHERE id = $1', [shiftId])
  return shiftRes.rows[0] ?? null
}

// ── Inline recalculation after time adjustment ────────────────────────────────

// GĐ2: ngày có thể đã gánh sẵn phần NGHỈ (nửa ngày phép). Công thực tế chỉ được
// chiếm phần còn lại, nếu không sẽ vi phạm CHECK tổng ≤ 1.0 và báo cáo tính dư công.
// leaveUnits = paid_leave_units + unpaid_leave_units hiện có của bản ghi.
async function recalcTimes(userId, workDate, checkInTime, checkOutTime, currentStatus = 'present', leaveUnits = 0) {
  const ws = await resolveWsForDate(userId, workDate)
  const remaining = Math.max(0, Math.round((1 - leaveUnits) * 1000) / 1000)

  let actualHours = null
  // Nghỉ trưa trừ theo tỉ lệ phần ngày còn phải làm (xem ghi chú cùng chủ đề
  // trong attendance.service.calculateAttendanceRecord).
  const breakHours = (ws ? (ws.break_minutes ?? 60) / 60 : 1) * remaining

  if (checkInTime && checkOutTime) {
    const diffHours = (new Date(checkOutTime) - new Date(checkInTime)) / 3600000
    actualHours = Math.max(0, diffHours - breakHours)
  }

  let requiredHours = ws?.required_hours != null ? parseFloat(ws.required_hours) : null
  if (!requiredHours && ws?.start_time && ws?.end_time) {
    const [sh, sm] = ws.start_time.split(':').map(Number)
    const [eh, em] = ws.end_time.split(':').map(Number)
    requiredHours = (eh * 60 + em - sh * 60 - sm) / 60 - breakHours
  }

  let lateMinutes = 0, earlyMinutes = 0
  if (ws?.start_time && checkInTime) {
    const [sh, sm] = ws.start_time.split(':').map(Number)
    const ciDate = new Date(checkInTime)
    const shiftStart = new Date(ciDate); shiftStart.setHours(sh, sm, 0, 0)
    const diffMin = (ciDate - shiftStart) / 60000
    const tol = ws.tolerance_in ?? 15
    if (diffMin > tol) lateMinutes = Math.floor(diffMin - tol)
  }
  if (ws?.end_time && checkOutTime) {
    const [eh, em] = ws.end_time.split(':').map(Number)
    const coDate = new Date(checkOutTime)
    const shiftEnd = new Date(coDate); shiftEnd.setHours(eh, em, 0, 0)
    const diffMin = (shiftEnd - coDate) / 60000
    const tol = ws.tolerance_out ?? 15
    if (diffMin > tol) earlyMinutes = Math.floor(diffMin - tol)
  }

  // Tỉ lệ so với giờ chuẩn của PHẦN NGÀY CÒN LẠI, và không bao giờ vượt phần đó.
  let workUnits = 0.0
  const requiredForPortion = (requiredHours || 0) * remaining
  if (actualHours != null && requiredForPortion > 0) {
    const ratio = actualHours / requiredForPortion
    if (ratio >= 0.8)      workUnits = remaining
    else if (ratio >= 0.5) workUnits = Math.round(remaining * 0.5 * 1000) / 1000
  }

  let status = currentStatus
  if (!['on_leave','wfh','business_trip','holiday','absent','unscheduled'].includes(status)) {
    if (lateMinutes > 0 && earlyMinutes > 0)  status = 'late_and_early'
    else if (lateMinutes > 0)                  status = 'late'
    else if (earlyMinutes > 0)                 status = 'early_leave'
    else                                       status = 'present'
  }

  return { actualHours, lateMinutes, earlyMinutes, workUnits, status }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function adjustAttendanceRecord(id, { field, newValue, reason, adjustedBy }) {
  const ALLOWED_FIELDS = ['check_in_time', 'check_out_time', 'status', 'notes']
  if (!ALLOWED_FIELDS.includes(field)) {
    throw Object.assign(new Error(`Field '${field}' không được hỗ trợ`), { status: 400 })
  }

  const recordRes = await query('SELECT * FROM attendance_records WHERE id = $1', [id])
  if (!recordRes.rows[0]) throw Object.assign(new Error('Attendance record not found'), { status: 404 })
  const record = recordRes.rows[0]

  const beforeValue = record[field] != null ? String(record[field]) : null

  // Write audit trail
  await query(
    `INSERT INTO attendance_adjustments
       (attendance_record_id, field_name, before_value, after_value, reason, adjusted_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, field, beforeValue, String(newValue), reason, adjustedBy]
  )

  if (field === 'check_in_time' || field === 'check_out_time') {
    const logType = field === 'check_in_time' ? 'check_in' : 'check_out'
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, $2, $3, 'manual', $4)`,
      [record.user_id, logType, newValue, `Admin adjustment: ${reason}`]
    )

    const newCheckIn  = field === 'check_in_time'  ? new Date(newValue) : record.check_in_time
    const newCheckOut = field === 'check_out_time' ? new Date(newValue) : record.check_out_time

    const { actualHours, lateMinutes, earlyMinutes, workUnits, status } =
      await recalcTimes(record.user_id, record.work_date, newCheckIn, newCheckOut, record.status,
        Number(record.paid_leave_units ?? 0) + Number(record.unpaid_leave_units ?? 0))

    const { rows } = await query(
      `UPDATE attendance_records SET
         check_in_time  = $1,
         check_out_time = $2,
         actual_hours   = $3,
         late_minutes   = $4,
         early_minutes  = $5,
         work_units     = $6,
         status         = $7,
         is_adjusted    = TRUE,
         updated_at     = NOW()
       WHERE id = $8 RETURNING *`,
      [newCheckIn, newCheckOut, actualHours, lateMinutes, earlyMinutes, workUnits, status, id]
    )
    return toRecordDto(rows[0])
  }

  if (field === 'status') {
    // GĐ2: đổi status phải ghi vào ĐÚNG cột đơn vị công, không dồn hết vào work_units.
    //   on_leave / holiday  → nghỉ HƯỞNG LƯƠNG (không phải công thực tế)
    //   wfh / business_trip → vẫn là ĐANG LÀM VIỆC
    //   absent / unscheduled→ không công
    // Đặt tay như thế này luôn là NGUYÊN NGÀY; muốn nửa ngày thì dùng đơn nghỉ.
    const UNITS_FOR_STATUS = {
      on_leave:      { work: 0,   paid: 1.0, unpaid: 0 },
      holiday:       { work: 0,   paid: 1.0, unpaid: 0 },
      wfh:           { work: 1.0, paid: 0,   unpaid: 0 },
      business_trip: { work: 1.0, paid: 0,   unpaid: 0 },
      absent:        { work: 0,   paid: 0,   unpaid: 0 },
      unscheduled:   { work: 0,   paid: 0,   unpaid: 0 },
    }
    const u = UNITS_FOR_STATUS[newValue] ?? {
      work:   record.work_units,
      paid:   record.paid_leave_units,
      unpaid: record.unpaid_leave_units,
    }

    const { rows } = await query(
      `UPDATE attendance_records SET
         status             = $1,
         work_units         = $2,
         paid_leave_units   = $3,
         unpaid_leave_units = $4,
         is_adjusted        = TRUE,
         updated_at         = NOW()
       WHERE id = $5 RETURNING *`,
      [newValue, u.work, u.paid, u.unpaid, id]
    )
    return toRecordDto(rows[0])
  }

  if (field === 'notes') {
    const { rows } = await query(
      `UPDATE attendance_records SET notes = $1, is_adjusted = TRUE, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newValue, id]
    )
    return toRecordDto(rows[0])
  }
}

// Adjust both check-in and check-out at once (admin use-case)
async function manualAdjust(recordId, { checkInTime, checkOutTime, reason, adjustedBy }) {
  const recordRes = await query('SELECT * FROM attendance_records WHERE id = $1', [recordId])
  if (!recordRes.rows[0]) throw Object.assign(new Error('Attendance record not found'), { status: 404 })
  const record = recordRes.rows[0]

  const dateStr = String(record.work_date).slice(0, 10)

  // Build timestamps from date + HH:MM inputs
  const toTs = (hhmm) => hhmm ? `${dateStr} ${String(hhmm).slice(0, 5)}:00` : null
  const newCheckIn  = checkInTime  !== undefined ? toTs(checkInTime)  : record.check_in_time
  const newCheckOut = checkOutTime !== undefined ? toTs(checkOutTime) : record.check_out_time

  // Audit trail — log only changed fields
  const auditFields = []
  if (checkInTime !== undefined)  auditFields.push({ field: 'check_in_time',  before: record.check_in_time  ? String(record.check_in_time)  : null, after: newCheckIn })
  if (checkOutTime !== undefined) auditFields.push({ field: 'check_out_time', before: record.check_out_time ? String(record.check_out_time) : null, after: newCheckOut })

  for (const { field, before, after } of auditFields) {
    await query(
      `INSERT INTO attendance_adjustments
         (attendance_record_id, field_name, before_value, after_value, reason, adjusted_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [recordId, field, before, after, reason, adjustedBy]
    )
  }

  // Insert manual logs
  if (checkInTime !== undefined) {
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, 'check_in', $2, 'manual', $3)`,
      [record.user_id, newCheckIn, `Admin điều chỉnh: ${reason}`]
    )
  }
  if (checkOutTime !== undefined) {
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, 'check_out', $2, 'manual', $3)`,
      [record.user_id, newCheckOut, `Admin điều chỉnh: ${reason}`]
    )
  }

  // Recalc using system config
  const { actualHours, lateMinutes, earlyMinutes, workUnits, status } =
    await recalcTimes(record.user_id, record.work_date, newCheckIn, newCheckOut, record.status,
        Number(record.paid_leave_units ?? 0) + Number(record.unpaid_leave_units ?? 0))

  const { rows } = await query(
    `UPDATE attendance_records SET
       check_in_time  = $1,
       check_out_time = $2,
       actual_hours   = $3,
       late_minutes   = $4,
       early_minutes  = $5,
       work_units     = $6,
       status         = $7,
       is_adjusted    = TRUE,
       updated_at     = NOW()
     WHERE id = $8 RETURNING *`,
    [newCheckIn, newCheckOut, actualHours, lateMinutes, earlyMinutes, workUnits, status, recordId]
  )
  return toRecordDto(rows[0])
}

// Create a record from scratch when none exists (employee forgot to check in)
async function createManualRecord(userId, workDate, { checkInTime, checkOutTime, reason, adjustedBy }) {
  const dateStr = String(workDate).slice(0, 10)
  const toTs = (hhmm) => hhmm ? `${dateStr} ${String(hhmm).slice(0, 5)}:00` : null

  const ciTs = toTs(checkInTime)
  const coTs = toTs(checkOutTime)

  // Insert attendance_logs so calculateAttendanceRecord has data
  if (ciTs) {
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, 'check_in', $2, 'manual', $3)`,
      [userId, ciTs, `Admin tạo thủ công: ${reason}`]
    )
  }
  if (coTs) {
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, 'check_out', $2, 'manual', $3)`,
      [userId, coTs, `Admin tạo thủ công: ${reason}`]
    )
  }

  // Run full calculation (handles shift, status, work_units, etc.)
  const record = await calculateAttendanceRecord(userId, dateStr)
  if (!record) throw Object.assign(new Error('Không thể tạo bản ghi (ngày nghỉ hoặc không có ca)'), { status: 422 })

  // Mark as adjusted + write audit trail
  await query(
    `UPDATE attendance_records SET is_adjusted = TRUE WHERE user_id = $1 AND work_date = $2`,
    [userId, dateStr]
  )
  await query(
    `INSERT INTO attendance_adjustments
       (attendance_record_id, field_name, before_value, after_value, reason, adjusted_by)
     VALUES ($1, 'check_in_time', NULL, $2, $3, $4)`,
    [record.id, ciTs, reason, adjustedBy]
  )
  if (coTs) {
    await query(
      `INSERT INTO attendance_adjustments
         (attendance_record_id, field_name, before_value, after_value, reason, adjusted_by)
       VALUES ($1, 'check_out_time', NULL, $2, $3, $4)`,
      [record.id, coTs, reason, adjustedBy]
    )
  }

  return { ...record, isAdjusted: true }
}

// Reset checkout: nhân viên lỡ bấm check-out sớm → admin huỷ để họ chấm ra lại.
// Xoá TẤT CẢ log check_out của ngày đó (kể cả log 'manual' do admin từng chỉnh),
// ghi audit, rồi recompute → check_out_time về NULL (ngày ở trạng thái "đã vào, chưa ra").
// Nhân viên getToday sẽ thấy hasCheckedOut=false → nút Check-out hiện lại.
async function resetCheckout(recordId, { reason, adjustedBy }) {
  if (!reason || !String(reason).trim()) {
    throw Object.assign(new Error('Vui lòng nhập lý do reset check-out'), { status: 422 })
  }
  const recordRes = await query('SELECT * FROM attendance_records WHERE id = $1', [recordId])
  if (!recordRes.rows[0]) throw Object.assign(new Error('Attendance record not found'), { status: 404 })
  const record = recordRes.rows[0]
  if (!record.check_out_time) {
    throw Object.assign(new Error('Ngày này chưa có giờ check-out để reset'), { status: 400 })
  }

  const dateStr = String(record.work_date).slice(0, 10)
  const before  = String(record.check_out_time)

  // 1) Xoá mọi log check_out của user trong ngày (bấm nhầm 1 hay nhiều lần đều sạch)
  await query(
    `DELETE FROM attendance_logs
      WHERE user_id = $1 AND log_type = 'check_out' AND logged_at::date = $2`,
    [record.user_id, dateStr]
  )

  // 2) Audit trail: giờ ra <lúc nhầm> → NULL, kèm lý do + ai thực hiện
  await query(
    `INSERT INTO attendance_adjustments
       (attendance_record_id, field_name, before_value, after_value, reason, adjusted_by)
     VALUES ($1, 'check_out_time', $2, NULL, $3, $4)`,
    [recordId, before, `[Reset check-out] ${String(reason).trim()}`, adjustedBy]
  )

  // 3) Recompute từ log còn lại (chỉ còn check_in) → check_out_time NULL, actual_hours NULL
  return calculateAttendanceRecord(record.user_id, dateStr)
}

async function listAdjustments(attendanceRecordId) {
  const { rows } = await query(
    `SELECT aa.*, u.name AS adjuster_name
     FROM attendance_adjustments aa
     JOIN users u ON aa.adjusted_by = u.id
     WHERE aa.attendance_record_id = $1
     ORDER BY aa.adjusted_at DESC`,
    [attendanceRecordId]
  )
  return rows.map(toAdjDto)
}

module.exports = { adjustAttendanceRecord, manualAdjust, createManualRecord, resetCheckout, listAdjustments }
