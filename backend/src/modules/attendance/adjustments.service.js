const { query } = require('../../config/db')

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

// ── Inline recalculation after time adjustment ────────────────────────────────

async function recalcTimes(record, checkInTime, checkOutTime) {
  const wsRes = await query(
    `SELECT ws.*, s.start_time, s.end_time, s.break_minutes, s.required_hours,
            s.tolerance_in, s.tolerance_out
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ws.user_id = $1 AND ws.work_date = $2`,
    [record.user_id, record.work_date]
  )
  const ws = wsRes.rows[0]

  let actualHours = null
  const breakHours = ws ? (ws.break_minutes ?? 60) / 60 : 1

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

  let workUnits = 0.0
  if (actualHours != null && requiredHours) {
    const ratio = actualHours / requiredHours
    if (ratio >= 0.8)      workUnits = 1.0
    else if (ratio >= 0.5) workUnits = 0.5
  }

  let status = record.status
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
      await recalcTimes(record, newCheckIn, newCheckOut)

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
    const workUnitsForStatus = {
      on_leave: 1.0, wfh: 1.0, business_trip: 1.0, holiday: 1.0,
      absent: 0.0, unscheduled: 0.0,
    }
    const workUnits = workUnitsForStatus[newValue] ?? record.work_units

    const { rows } = await query(
      `UPDATE attendance_records SET
         status      = $1,
         work_units  = $2,
         is_adjusted = TRUE,
         updated_at  = NOW()
       WHERE id = $3 RETURNING *`,
      [newValue, workUnits, id]
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

module.exports = { adjustAttendanceRecord, listAdjustments }
