const { query } = require('../../config/db')
const { calculateAttendanceRecord } = require('../attendance/attendance.service')
const { generateMonthlySchedule } = require('../attendance/schedules.service')

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

  if (scenario === 'perfect') {
    return { checkInTime: shiftStart, checkOutTime: shiftEnd }
  }

  if (scenario === 'normal') {
    // 90% on time, 10% slightly late (5-30 min)
    if (rand < 0.9) return { checkInTime: shiftStart, checkOutTime: shiftEnd }
    return { checkInTime: addMinutes(shiftStart, randomInt(5, 30)), checkOutTime: shiftEnd }
  }

  // mixed: 70% on-time, 20% late, 5% early-leave, 5% absent
  if (rand < 0.70) return { checkInTime: shiftStart, checkOutTime: shiftEnd }
  if (rand < 0.90) return { checkInTime: addMinutes(shiftStart, randomInt(10, 45)), checkOutTime: shiftEnd }
  if (rand < 0.95) return { checkInTime: shiftStart, checkOutTime: subtractMinutes(shiftEnd, randomInt(20, 60)) }
  return { checkInTime: null, checkOutTime: null }
}

async function getSystemUserId() {
  const { rows } = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`)
  if (!rows[0]) throw new Error('No admin user found for simulation createdBy')
  return rows[0].id
}

function dateRangeFor(month, year) {
  const y = parseInt(year, 10)
  const m = parseInt(month, 10)
  const lastDay = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return {
    from: `${y}-${mm}-01`,
    to:   `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ── Core: simulate one day for one user ──────────────────────────────────────

async function simulateDay({ userId, date, checkInTime, checkOutTime }) {
  // Ensure a work_schedule exists for this date; generate the month if not
  const schedCheck = await query(
    `SELECT id FROM work_schedules WHERE user_id = $1 AND work_date = $2`,
    [userId, date]
  )
  if (schedCheck.rows.length === 0) {
    const [year, month] = date.split('-')
    const createdBy = await getSystemUserId()
    await generateMonthlySchedule({ userId, month, year, createdBy })
  }

  // Remove any previous logs for this day (real + sim) to avoid conflicts
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

async function simulateMonth({ userId, month, year, scenario = 'normal' }) {
  const { from, to } = dateRangeFor(month, year)

  // Auto-generate work_schedules if the month has none
  const schedCount = await query(
    `SELECT COUNT(*) FROM work_schedules WHERE user_id = $1 AND work_date BETWEEN $2 AND $3`,
    [userId, from, to]
  )
  if (parseInt(schedCount.rows[0].count, 10) === 0) {
    const createdBy = await getSystemUserId()
    await generateMonthlySchedule({ userId, month, year, createdBy })
  }

  const { rows: schedules } = await query(
    `SELECT ws.work_date, ws.is_day_off, s.start_time, s.end_time
     FROM work_schedules ws
     LEFT JOIN shifts s ON ws.shift_id = s.id
     WHERE ws.user_id = $1 AND ws.work_date BETWEEN $2 AND $3
     ORDER BY ws.work_date`,
    [userId, from, to]
  )

  const results = []
  for (const sched of schedules) {
    if (sched.is_day_off) continue

    const dateStr = String(sched.work_date).slice(0, 10)
    const shiftStart = sched.start_time ? String(sched.start_time).slice(0, 5) : '08:00'
    const shiftEnd   = sched.end_time   ? String(sched.end_time).slice(0, 5)   : '17:00'

    const { checkInTime, checkOutTime } = applyScenario(scenario, shiftStart, shiftEnd)
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
    `DELETE FROM attendance_logs
     WHERE method = 'simulation' AND logged_at::date BETWEEN $1 AND $2 ${userCond}`,
    params
  )
  const recsDel = await query(
    `DELETE FROM attendance_records
     WHERE notes = '[simulation]' AND work_date BETWEEN $1 AND $2 ${userCond}`,
    params
  )

  return { logsDeleted: logsDel.rowCount, recordsDeleted: recsDel.rowCount }
}

// ── Status snapshot ───────────────────────────────────────────────────────────

async function getSimulationStatus({ month, year }) {
  const { from, to } = dateRangeFor(month, year)

  const [logsRes, recsRes] = await Promise.all([
    query(
      `SELECT COUNT(*) FROM attendance_logs
       WHERE method = 'simulation' AND logged_at::date BETWEEN $1 AND $2`,
      [from, to]
    ),
    query(
      `SELECT
         COUNT(*)                                                              AS total,
         COUNT(*) FILTER (WHERE status = 'present')                           AS present,
         COUNT(*) FILTER (WHERE status = 'late')                              AS late,
         COUNT(*) FILTER (WHERE status = 'early_leave')                       AS early_leave,
         COUNT(*) FILTER (WHERE status = 'late_and_early')                    AS late_and_early,
         COUNT(*) FILTER (WHERE status = 'absent')                            AS absent
       FROM attendance_records
       WHERE notes = '[simulation]' AND work_date BETWEEN $1 AND $2`,
      [from, to]
    ),
  ])

  const r = recsRes.rows[0]
  return {
    month: parseInt(month, 10),
    year:  parseInt(year, 10),
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
