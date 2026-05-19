const { query } = require('../../config/db')

const SATURDAY_KEY = 'attendance.saturday_shift_id'

async function getAttendanceSettings() {
  const { rows } = await query(
    `SELECT key, value, description, updated_at
     FROM system_configs
     WHERE key = $1`,
    [SATURDAY_KEY]
  )
  const raw = rows[0]?.value ?? ''
  return {
    saturdayShiftId: raw || null,
    saturdayMode:    raw ? 'workday' : 'dayoff',
    description:     rows[0]?.description ?? '',
    updatedAt:       rows[0]?.updated_at ?? null,
  }
}

async function updateAttendanceSettings({ saturdayShiftId, updatedBy }) {
  const value = saturdayShiftId ?? ''

  // Validate shift exists if a UUID is provided
  if (value) {
    const { rows } = await query('SELECT id FROM shifts WHERE id = $1', [value])
    if (!rows[0]) throw Object.assign(new Error('Ca làm việc không tồn tại'), { status: 404 })
  }

  await query(
    `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
     VALUES ($1, $2,
       'UUID của ca làm việc áp dụng cho Thứ 7. Để trống = Thứ 7 là ngày nghỉ.',
       $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [SATURDAY_KEY, value, updatedBy ?? null]
  )

  return getAttendanceSettings()
}

module.exports = { getAttendanceSettings, updateAttendanceSettings }
