const { query } = require('../../config/db')

function toDto(r) {
  return {
    id:            r.id,
    name:          r.name,
    shiftType:     r.shift_type,
    startTime:     r.start_time,
    endTime:       r.end_time,
    breakMinutes:  r.break_minutes,
    requiredHours: r.required_hours != null ? parseFloat(r.required_hours) : null,
    toleranceIn:   r.tolerance_in,
    toleranceOut:  r.tolerance_out,
    isActive:      r.is_active,
    createdBy:     r.created_by,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

async function listShifts({ activeOnly = true } = {}) {
  const where = activeOnly ? 'WHERE is_active = TRUE' : ''
  const { rows } = await query(`SELECT * FROM shifts ${where} ORDER BY name`)
  return rows.map(toDto)
}

async function getShift(id) {
  const { rows } = await query('SELECT * FROM shifts WHERE id = $1', [id])
  if (!rows[0]) throw Object.assign(new Error('Shift not found'), { status: 404 })
  return toDto(rows[0])
}

async function createShift({ name, shiftType = 'fixed', startTime, endTime, breakMinutes = 60, requiredHours, toleranceIn = 15, toleranceOut = 15, createdBy }) {
  const { rows } = await query(
    `INSERT INTO shifts
       (name, shift_type, start_time, end_time, break_minutes, required_hours, tolerance_in, tolerance_out, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [name, shiftType, startTime ?? null, endTime ?? null, breakMinutes, requiredHours ?? null, toleranceIn, toleranceOut, createdBy]
  )
  return toDto(rows[0])
}

async function updateShift(id, { name, shiftType, startTime, endTime, breakMinutes, requiredHours, toleranceIn, toleranceOut, isActive }) {
  const { rows } = await query(
    `UPDATE shifts SET
       name          = COALESCE($1,  name),
       shift_type    = COALESCE($2,  shift_type),
       start_time    = COALESCE($3,  start_time),
       end_time      = COALESCE($4,  end_time),
       break_minutes = COALESCE($5,  break_minutes),
       required_hours= COALESCE($6,  required_hours),
       tolerance_in  = COALESCE($7,  tolerance_in),
       tolerance_out = COALESCE($8,  tolerance_out),
       is_active     = COALESCE($9,  is_active),
       updated_at    = NOW()
     WHERE id = $10
     RETURNING *`,
    [name ?? null, shiftType ?? null, startTime ?? null, endTime ?? null,
     breakMinutes ?? null, requiredHours ?? null, toleranceIn ?? null, toleranceOut ?? null,
     isActive ?? null, id]
  )
  if (!rows[0]) throw Object.assign(new Error('Shift not found'), { status: 404 })
  return toDto(rows[0])
}

async function deleteShift(id) {
  // Block if used as default or saturday shift in system config
  const cfgRes = await query(
    `SELECT key FROM system_configs
     WHERE key IN ('attendance.default_shift_id', 'attendance.saturday_shift_id') AND value = $1`,
    [id]
  )
  if (cfgRes.rows.length > 0) {
    const labels = cfgRes.rows.map((r) =>
      r.key === 'attendance.default_shift_id' ? 'ca mặc định hệ thống' : 'ca làm việc Thứ 7'
    ).join(', ')
    throw Object.assign(
      new Error(`Ca đang được dùng làm ${labels}. Vui lòng đổi cài đặt trước khi xoá.`),
      { status: 409 }
    )
  }

  // Block if used in any work_schedule row
  const schedRes = await query(
    `SELECT 1 FROM work_schedules WHERE shift_id = $1 LIMIT 1`,
    [id]
  )
  if (schedRes.rows.length > 0) {
    throw Object.assign(
      new Error('Ca đang được dùng trong lịch làm việc của nhân viên. Không thể xoá.'),
      { status: 409 }
    )
  }

  const { rowCount } = await query('DELETE FROM shifts WHERE id = $1', [id])
  if (rowCount === 0) throw Object.assign(new Error('Shift not found'), { status: 404 })
}

module.exports = { listShifts, getShift, createShift, updateShift, deleteShift }
