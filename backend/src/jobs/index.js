'use strict'

const cron   = require('node-cron')
const logger = require('../config/logger')
const { query } = require('../config/db')
const { runTaskGenerator }    = require('./taskGenerator.job')
const { runDeadlineReminder } = require('./deadlineReminder.job')
const { runOverdueEscalation } = require('./overdueEscalation.job')
const { runOnHoldReminder }   = require('./onHoldReminder.job')
const { runMorningSummary }        = require('./morningSummary.job')
const { runAdminAttendanceJob }    = require('./adminAttendance.job')
const { runClientDocOverdueJob }   = require('./clientDocOverdue.job')
const { runBirthday }              = require('./birthday.job')

let schedulerTask = null
let lastRunAt     = null
let lastRunResult = null
let isRunning     = false
let currentVnHour = 5  // default: 05:00 Vietnam time

// Cron của 2 job "Cảnh báo deadline" — giữ tham chiếu để đổi giờ mà không cần restart server.
let deadlineTask   = null
let escalationTask = null

const DEFAULT_DEADLINE_TIME   = '07:30'
const DEFAULT_ESCALATION_TIME = '08:00'

// ── Helpers ────────────────────────────────────────────────────────────────────

function vnToUtcHour(vnHour) {
  return (vnHour - 7 + 24) % 24
}

function buildCronExpr(vnHour) {
  return `0 ${vnToUtcHour(vnHour)} * * *`
}

// 'HH:MM' (giờ VN) → cron expr theo UTC. VN lệch số giờ CHẴN nên phút giữ nguyên.
// Giá trị hỏng/ngoài khoảng → dùng fallback.
function vnTimeToUtcCron(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim())
  const [fh, fm] = fallback.split(':').map(Number)
  let h = m ? parseInt(m[1], 10) : fh
  let min = m ? parseInt(m[2], 10) : fm
  if (!(h >= 0 && h <= 23)) h = fh
  if (!(min >= 0 && min <= 59)) min = fm
  const label = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  return { expr: `${min} ${vnToUtcHour(h)} * * *`, label }
}

async function loadTimeConfig(key, fallback) {
  try {
    const { rows: [row] } = await query('SELECT value FROM system_configs WHERE key = $1', [key])
    return row?.value?.trim() || fallback
  } catch {
    return fallback
  }
}

// Lên lịch (hoặc lên lại) 2 job của "Cảnh báo deadline" theo giờ trong system_configs.
async function scheduleDeadlineJobs() {
  if (deadlineTask)   { deadlineTask.stop();   deadlineTask = null }
  if (escalationTask) { escalationTask.stop(); escalationTask = null }

  const dl = vnTimeToUtcCron(await loadTimeConfig('deadline_reminder_time', DEFAULT_DEADLINE_TIME), DEFAULT_DEADLINE_TIME)
  const es = vnTimeToUtcCron(await loadTimeConfig('escalation_run_time', DEFAULT_ESCALATION_TIME), DEFAULT_ESCALATION_TIME)

  deadlineTask = cron.schedule(dl.expr, async () => {
    try { await runDeadlineReminder() } catch (err) {
      logger.error('[Jobs] Deadline reminder failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  escalationTask = cron.schedule(es.expr, async () => {
    try { await runOverdueEscalation() } catch (err) {
      logger.error('[Jobs] Overdue escalation failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  logger.info(`[Jobs] Deadline reminder @ ${dl.label} VN · Overdue escalation @ ${es.label} VN`)
}

// Gọi khi admin đổi giờ trong Settings → áp dụng ngay, không cần restart server.
async function restartDeadlineJobs() {
  await scheduleDeadlineJobs()
}

async function saveLog({ triggeredBy, triggeredByUserId, startedAt, finishedAt,
  generated = 0, skipped = 0, errors = 0, durationMs = 0,
  tasksCreated = [], errorMessage = null }) {
  try {
    await query(
      `INSERT INTO scheduler_run_logs
         (triggered_by, triggered_by_user_id, started_at, finished_at,
          generated, skipped, errors, duration_ms, tasks_created, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
      [
        triggeredBy, triggeredByUserId ?? null,
        startedAt, finishedAt,
        generated, skipped, errors, durationMs,
        JSON.stringify(tasksCreated),
        errorMessage,
      ]
    )
  } catch (err) {
    logger.error('[Scheduler] Failed to save run log', { error: err.message })
  }
}

async function runAndLog(triggeredBy, triggeredByUserId = null) {
  const startedAt = new Date()
  try {
    const result = await runTaskGenerator({ manual: triggeredBy === 'manual' })
    await saveLog({ ...result, triggeredBy, triggeredByUserId, startedAt, finishedAt: new Date() })
    lastRunResult = result
    return result
  } catch (err) {
    const errResult = {
      generated: 0, skipped: 0, errors: 1,
      durationMs: Date.now() - startedAt.getTime(),
      tasksCreated: [],
      errorMessage: err.message,
    }
    await saveLog({ ...errResult, triggeredBy, triggeredByUserId, startedAt, finishedAt: new Date() })
    lastRunResult = { error: err.message }
    throw err
  }
}

// ── Scheduler lifecycle ────────────────────────────────────────────────────────

function startScheduler(vnHour = 5) {
  currentVnHour = vnHour
  const expr    = buildCronExpr(vnHour)
  const utcH    = vnToUtcHour(vnHour)

  schedulerTask = cron.schedule(
    expr,
    async () => {
      if (isRunning) {
        logger.warn('[Scheduler] Skipping run — previous run still in progress')
        return
      }
      isRunning = true
      lastRunAt = new Date()
      try {
        await runAndLog('auto')
      } catch (err) {
        logger.error('[Scheduler] Fatal error in cron run', { error: err.message })
      } finally {
        isRunning = false
      }
    },
    { timezone: 'UTC' }
  )

  logger.info(`[Scheduler] Task generator cron started (${vnHour}:00 VN = ${utcH}:00 UTC daily)`)
}

function restartWithNewHour(vnHour) {
  if (schedulerTask) {
    schedulerTask.stop()
    schedulerTask = null
    logger.info('[Scheduler] Stopped old cron job')
  }
  startScheduler(vnHour)
}

// ── Public API ─────────────────────────────────────────────────────────────────

function getStatus() {
  return {
    active:        schedulerTask != null,
    isRunning,
    lastRunAt,
    lastRunResult,
    runHour:       currentVnHour,
  }
}

async function triggerNow(triggeredByUserId = null) {
  if (isRunning) {
    throw Object.assign(new Error('Scheduler is already running'), { status: 409 })
  }
  isRunning = true
  lastRunAt = new Date()
  try {
    return await runAndLog('manual', triggeredByUserId)
  } finally {
    isRunning = false
  }
}

async function getLogs(limit = 20) {
  const { rows } = await query(
    `SELECT srl.id, srl.triggered_by, srl.triggered_by_user_id,
            u.name AS triggered_by_name,
            srl.started_at, srl.finished_at,
            srl.generated, srl.skipped, srl.errors,
            srl.duration_ms, srl.tasks_created, srl.error_message
     FROM scheduler_run_logs srl
     LEFT JOIN users u ON u.id = srl.triggered_by_user_id
     ORDER BY srl.started_at DESC
     LIMIT $1`,
    [limit]
  )
  return rows
}

async function deleteLog(id) {
  await query('DELETE FROM scheduler_run_logs WHERE id = $1', [id])
}

async function clearLogs() {
  await query('TRUNCATE TABLE scheduler_run_logs')
}

// ── Notification & escalation cron jobs (Vietnam timezone offsets) ─────────────
// All times are UTC. Vietnam is UTC+7.
// 07:00 VN = 00:00 UTC | 07:30 VN = 00:30 UTC | 08:00 VN = 01:00 UTC

async function startNotificationJobs() {
  // Morning Summary — 07:00 VN
  cron.schedule('0 0 * * *', async () => {
    try { await runMorningSummary() } catch (err) {
      logger.error('[Jobs] Morning summary failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  // Deadline Reminder + Overdue Escalation — giờ đọc từ system_configs (Settings → Cảnh báo deadline)
  await scheduleDeadlineJobs()

  // On-Hold Reminder — 08:05 VN (after escalation)
  cron.schedule('5 1 * * *', async () => {
    try { await runOnHoldReminder() } catch (err) {
      logger.error('[Jobs] On-hold reminder failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  // Admin Auto Attendance — 06:30 VN = 23:30 UTC (previous UTC day)
  // Creates a full-day 'present' record for every active admin before the workday starts.
  cron.schedule('30 23 * * *', async () => {
    try { await runAdminAttendanceJob() } catch (err) {
      logger.error('[Jobs] Admin attendance job failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  // Client Document Overdue — 08:30 VN = 01:30 UTC
  cron.schedule('30 1 * * *', async () => {
    try { await runClientDocOverdueJob() } catch (err) {
      logger.error('[Jobs] Client doc overdue job failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  // Birthday — 08:00 VN = 01:00 UTC
  cron.schedule('0 1 * * *', async () => {
    try { await runBirthday() } catch (err) {
      logger.error('[Jobs] Birthday job failed', { error: err.message })
    }
  }, { timezone: 'UTC' })

  logger.info('[Jobs] Notification cron jobs scheduled (07:00 morning · 08:05 on-hold · 08:30 client-doc · 08:00 birthday · 06:30 admin attendance — giờ VN)')
}

module.exports = {
  startScheduler, restartWithNewHour, getStatus, triggerNow, getLogs, deleteLog, clearLogs,
  startNotificationJobs, restartDeadlineJobs,
}
