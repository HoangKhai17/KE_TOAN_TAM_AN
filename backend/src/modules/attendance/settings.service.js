const { query } = require('../../config/db')

const DEFAULT_KEY  = 'attendance.default_shift_id'
const SATURDAY_KEY = 'attendance.saturday_shift_id'
const STRICT_UNPAID_KEY = 'attendance.strict_unpaid_from'

async function getAttendanceSettings() {
  const { rows } = await query(
    `SELECT key, value FROM system_configs WHERE key IN ($1, $2, $3)`,
    [DEFAULT_KEY, SATURDAY_KEY, STRICT_UNPAID_KEY]
  )
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']))
  return {
    defaultShiftId:  cfg[DEFAULT_KEY]  || null,
    saturdayShiftId: cfg[SATURDAY_KEY] || null,
    saturdayMode:    cfg[SATURDAY_KEY] ? 'workday' : 'dayoff',
    strictUnpaidFrom: cfg[STRICT_UNPAID_KEY] || null,
  }
}

async function updateAttendanceSettings({ defaultShiftId, saturdayShiftId, strictUnpaidFrom, updatedBy }) {
  // Validate shift UUIDs if provided
  const toValidate = [defaultShiftId, saturdayShiftId].filter(Boolean)
  if (toValidate.length) {
    const { rows } = await query(
      `SELECT id FROM shifts WHERE id = ANY($1)`,
      [toValidate]
    )
    if (rows.length !== toValidate.length) {
      throw Object.assign(new Error('Ca làm việc không tồn tại'), { status: 404 })
    }
  }

  if (defaultShiftId !== undefined) {
    await query(
      `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, 'UUID của ca làm việc mặc định cho ngày thường (Thứ 2–6).', $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [DEFAULT_KEY, defaultShiftId ?? '', updatedBy ?? null]
    )
  }

  if (saturdayShiftId !== undefined) {
    await query(
      `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, 'UUID của ca làm việc áp dụng cho Thứ 7. Để trống = Thứ 7 là ngày nghỉ.', $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [SATURDAY_KEY, saturdayShiftId ?? '', updatedBy ?? null]
    )
  }

  if (strictUnpaidFrom !== undefined) {
    const v = (strictUnpaidFrom ?? '').trim()
    if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw Object.assign(new Error('Mốc áp dụng phải là ngày hợp lệ (YYYY-MM-DD) hoặc để trống'), { status: 400 })
    }
    await query(
      `INSERT INTO system_configs (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, 'Mốc bắt đầu áp dụng quy tắc "nghỉ không lương không tính công". Để trống = áp dụng cho toàn bộ lịch sử.', $3, NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [STRICT_UNPAID_KEY, v, updatedBy ?? null]
    )
  }

  return getAttendanceSettings()
}

module.exports = { getAttendanceSettings, updateAttendanceSettings }
