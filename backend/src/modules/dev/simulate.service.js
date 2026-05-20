const { query } = require('../../config/db')
const { calculateAttendanceRecord } = require('../attendance/attendance.service')

// ── Time helpers ──────────────────────────────────────────────────────────────

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function subtractMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = Math.max(0, h * 60 + m - minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function applyScenario(scenario, shiftStart = '08:00', shiftEnd = '17:00') {
  const rand = Math.random()
  if (scenario === 'perfect') return { checkInTime: shiftStart, checkOutTime: shiftEnd }
  if (scenario === 'normal') {
    if (rand < 0.9) return { checkInTime: shiftStart, checkOutTime: shiftEnd }
    return { checkInTime: addMinutes(shiftStart, randomInt(5, 30)), checkOutTime: shiftEnd }
  }
  // mixed: 70% on-time, 20% late, 5% early-leave, 5% absent
  if (rand < 0.70) return { checkInTime: shiftStart, checkOutTime: shiftEnd }
  if (rand < 0.90) return { checkInTime: addMinutes(shiftStart, randomInt(10, 45)), checkOutTime: shiftEnd }
  if (rand < 0.95) return { checkInTime: shiftStart, checkOutTime: subtractMinutes(shiftEnd, randomInt(20, 60)) }
  return { checkInTime: null, checkOutTime: null }
}

function dateRangeFor(month, year) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

// ── Core: simulate one day for one user ──────────────────────────────────────

async function simulateDay({ userId, date, checkInTime, checkOutTime }) {
  // Clear previous logs so we start from a clean state
  await query(
    `DELETE FROM attendance_logs WHERE user_id = $1 AND logged_at::date = $2`,
    [userId, date]
  )

  if (checkInTime) {
    await query(
      `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
       VALUES ($1, 'check_in', $2::timestamp, 'simulation', '[simulation]')`,
      [userId, `${date} ${checkInTime}`]
    )
    if (checkOutTime) {
      await query(
        `INSERT INTO attendance_logs (user_id, log_type, logged_at, method, notes)
         VALUES ($1, 'check_out', $2::timestamp, 'simulation', '[simulation]')`,
        [userId, `${date} ${checkOutTime}`]
      )
    }
  }

  const record = await calculateAttendanceRecord(userId, date)
  if (record) {
    await query(
      `UPDATE attendance_records SET notes = '[simulation]' WHERE user_id = $1 AND work_date = $2`,
      [userId, date]
    )
    record.notes = '[simulation]'
  }
  return record
}

// ── Simulate full month for one user ─────────────────────────────────────────
// Derives work days directly from system config — no work_schedules needed.

async function simulateMonth({ userId, month, year, scenario = 'normal' }) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  const from = `${y}-${mm}-01`
  const to   = `${y}-${mm}-${String(lastDay).padStart(2, '0')}`

  // Load config + holidays once
  const [cfgRes, holidayRes] = await Promise.all([
    query(`SELECT key, value FROM system_configs WHERE key IN ('attendance.default_shift_id', 'attendance.saturday_shift_id')`),
    query(`SELECT holiday_date::text FROM public_holidays WHERE holiday_date BETWEEN $1 AND $2`, [from, to]),
  ])
  const cfg = Object.fromEntries(cfgRes.rows.map((r) => [r.key, r.value ?? '']))
  const defaultShiftId  = cfg['attendance.default_shift_id']  || null
  const saturdayShiftId = cfg['attendance.saturday_shift_id'] || null
  const holidays = new Set(holidayRes.rows.map((r) => String(r.holiday_date).slice(0, 10)))

  // Load shift start/end for timing
  const shiftIds = [...new Set([defaultShiftId, saturdayShiftId].filter(Boolean))]
  const shiftMap = {}
  if (shiftIds.length) {
    const { rows } = await query(`SELECT id, start_time, end_time FROM shifts WHERE id = ANY($1)`, [shiftIds])
    rows.forEach((s) => { shiftMap[s.id] = s })
  }

  function shiftTimes(id) {
    const s = id ? shiftMap[id] : null
    return {
      start: s?.start_time ? String(s.start_time).slice(0, 5) : '08:00',
      end:   s?.end_time   ? String(s.end_time).slice(0, 5)   : '17:00',
    }
  }

  const results = []
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${y}-${mm}-${String(d).padStart(2, '0')}`
    const jsDay   = new Date(dateStr + 'T00:00:00').getDay()

    if (jsDay === 0 || holidays.has(dateStr)) continue // Sunday or holiday

    let shiftId
    if (jsDay === 6) {
      if (!saturdayShiftId) continue // Saturday is day off
      shiftId = saturdayShiftId
    } else {
      shiftId = defaultShiftId
    }

    const { start, end } = shiftTimes(shiftId)
    const { checkInTime, checkOutTime } = applyScenario(scenario, start, end)
    const record = await simulateDay({ userId, date: dateStr, checkInTime, checkOutTime })
    results.push({ date: dateStr, record })
  }

  return { simulated: results.length, results }
}

// ── Simulate full month for all active staff ──────────────────────────────────

async function simulateTeamMonth({ month, year, scenario = 'normal' }) {
  const { rows: staff } = await query(
    `SELECT id, name FROM users WHERE status = 'active' AND role != 'admin' ORDER BY name`
  )
  const results = []
  for (const user of staff) {
    const result = await simulateMonth({ userId: user.id, month, year, scenario })
    results.push({ userId: user.id, userName: user.name, simulated: result.simulated })
  }
  return { totalUsers: staff.length, totalDays: results.reduce((s, r) => s + r.simulated, 0), results }
}

// ── Clear simulation data ─────────────────────────────────────────────────────

async function clearSimulation({ userId, month, year }) {
  const { from, to } = dateRangeFor(month, year)
  const userCond = userId ? `AND user_id = $3` : ''
  const params   = userId ? [from, to, userId] : [from, to]

  const logsDel = await query(
    `DELETE FROM attendance_logs WHERE method = 'simulation' AND logged_at::date BETWEEN $1 AND $2 ${userCond}`,
    params
  )
  const recsDel = await query(
    `DELETE FROM attendance_records WHERE notes = '[simulation]' AND work_date BETWEEN $1 AND $2 ${userCond}`,
    params
  )
  return { logsDeleted: logsDel.rowCount, recordsDeleted: recsDel.rowCount }
}

// ── Status snapshot ───────────────────────────────────────────────────────────

async function getSimulationStatus({ month, year }) {
  const { from, to } = dateRangeFor(month, year)
  const [logsRes, recsRes] = await Promise.all([
    query(`SELECT COUNT(*) FROM attendance_logs WHERE method = 'simulation' AND logged_at::date BETWEEN $1 AND $2`, [from, to]),
    query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'present')      AS present,
              COUNT(*) FILTER (WHERE status = 'late')         AS late,
              COUNT(*) FILTER (WHERE status = 'early_leave')  AS early_leave,
              COUNT(*) FILTER (WHERE status = 'late_and_early') AS late_and_early,
              COUNT(*) FILTER (WHERE status = 'absent')       AS absent
       FROM attendance_records WHERE notes = '[simulation]' AND work_date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ])
  const r = recsRes.rows[0]
  return {
    month: parseInt(month, 10), year: parseInt(year, 10),
    simulatedLogs:    parseInt(logsRes.rows[0].count, 10),
    simulatedRecords: parseInt(r.total, 10),
    breakdown: {
      present:      parseInt(r.present, 10),
      late:         parseInt(r.late, 10),
      earlyLeave:   parseInt(r.early_leave, 10),
      lateAndEarly: parseInt(r.late_and_early, 10),
      absent:       parseInt(r.absent, 10),
    },
  }
}

module.exports = { simulateDay, simulateMonth, simulateTeamMonth, clearSimulation, getSimulationStatus }
