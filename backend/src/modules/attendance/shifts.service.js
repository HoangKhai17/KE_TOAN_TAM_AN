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

module.exports = { listShifts, getShift, createShift, updateShift }
