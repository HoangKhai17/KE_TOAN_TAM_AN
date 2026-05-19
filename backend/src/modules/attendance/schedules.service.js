const { query } = require('../../config/db')

function toDto(r) {
  return {
    id:        r.id,
    userId:    r.user_id,
    workDate:  r.work_date,
    shiftId:   r.shift_id,
    shiftName: r.shift_name ?? undefined,
    isDayOff:  r.is_day_off,
    notes:     r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

async function listWorkSchedules({ userId, month, year }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const params = [from, to]
  const conditions = ['ws.work_date BETWEEN $1 AND $2']
  if (userId) {
    params.push(userId)
    conditions.push(`ws.user_id = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT ws.*, s.name AS shift_name
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ws.user_id, ws.work_date`,
    params
  )
  return rows.map(toDto)
}

async function generateMonthlySchedule({ userId, month, year, createdBy }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)

  const userRes = await query('SELECT default_shift_id FROM users WHERE id = $1', [userId])
  if (!userRes.rows[0]) throw Object.assign(new Error('User not found'), { status: 404 })
  const defaultShiftId = userRes.rows[0].default_shift_id

  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const holidayRes = await query(
    'SELECT holiday_date FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2',
    [from, to]
  )
  const holidays = new Set(
    holidayRes.rows.map((r) => {
      const d = new Date(r.holiday_date)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    })
  )

  // Read Saturday config: empty/null = day off; UUID = use that shift
  const satCfg = await query(
    `SELECT value FROM system_configs WHERE key = 'attendance.saturday_shift_id' LIMIT 1`
  )
  const saturdayShiftId = satCfg.rows[0]?.value || null

  const created = []
  let skipped = 0

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay() // 0=Sun, 6=Sat

    const isSaturday = dayOfWeek === 6
    const isDayOff   = dayOfWeek === 0 || holidays.has(dateStr) || (isSaturday && !saturdayShiftId)
    const shiftId    = isSaturday
      ? (saturdayShiftId ?? null)
      : (isDayOff ? null : (defaultShiftId ?? null))

    const { rows } = await query(
      `INSERT INTO work_schedules (user_id, work_date, shift_id, is_day_off, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, work_date) DO NOTHING
       RETURNING *`,
      [userId, dateStr, shiftId, isDayOff, createdBy]
    )
    if (rows[0]) created.push(toDto(rows[0]))
    else skipped++
  }

  return {
    generated: created.length,
    skipped,
    total: lastDay,
    records: created,
  }
}

module.exports = { listWorkSchedules, generateMonthlySchedule }
