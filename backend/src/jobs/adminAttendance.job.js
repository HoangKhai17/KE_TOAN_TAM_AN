'use strict'

const { query }                       = require('../config/db')
const logger                          = require('../config/logger')
const { calculateAttendanceRecord }   = require('../modules/attendance/attendance.service')

async function runAdminAttendanceJob() {
  const today   = new Date()
  const y       = today.getFullYear()
  const m       = String(today.getMonth() + 1).padStart(2, '0')
  const d       = String(today.getDate()).padStart(2, '0')
  const dateStr = `${y}-${m}-${d}`

  const { rows: admins } = await query(
    `SELECT id, name FROM users WHERE role = 'admin' AND status = 'active'`
  )

  if (admins.length === 0) {
    logger.info('[AdminAttendance] No active admins found')
    return { date: dateStr, processed: 0, errors: 0 }
  }

  let processed = 0
  let errors    = 0

  for (const admin of admins) {
    try {
      await calculateAttendanceRecord(admin.id, dateStr)
      processed++
    } catch (err) {
      logger.error('[AdminAttendance] Failed to create record', {
        adminId: admin.id, name: admin.name, error: err.message,
      })
      errors++
    }
  }

  logger.info('[AdminAttendance] Completed', { date: dateStr, processed, errors })
  return { date: dateStr, processed, errors }
}

module.exports = { runAdminAttendanceJob }
