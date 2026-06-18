const { query } = require('../config/db')
const logger    = require('../config/logger')
const { shouldGenerateToday, getNextOccurrences } = require('../utils/recurrence.calculator')
const { format, addDays } = require('date-fns')

// Generate period label for a task (T06/2026 for monthly, Q2/2026 for quarterly, etc.)
function buildPeriodLabel(recurrenceType, dueDate) {
  const d = new Date(dueDate)
  const month = d.getMonth() + 1
  const year  = d.getFullYear()

  switch (recurrenceType) {
    case 'daily':
      return `${String(d.getDate()).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
    case 'weekly':
      return `T${String(month).padStart(2, '0')}/${year}`
    case 'monthly_by_date':
    case 'monthly_by_weekday':
    case 'monthly_last_day':
      return `T${String(month).padStart(2, '0')}/${year}`
    case 'quarterly':
      return `Q${Math.ceil(month / 3)}/${year}`
    case 'yearly':
      return `${year}`
    default:
      return `${String(month).padStart(2, '0')}/${year}`
  }
}

// Main idempotent generator — called by cron and by manual trigger
async function runTaskGenerator() {
  const startedAt = new Date()
  logger.info('[Scheduler] Task generator started')

  let generated    = 0
  let skipped      = 0
  let errors       = 0
  const tasksCreated = []

  try {
    const { rows: schedules } = await query(
      `SELECT cts.*,
              c.name AS company_name,
              tt.name AS task_type_name,
              tt.default_sla_days
       FROM customer_task_schedules cts
       JOIN companies c  ON c.id  = cts.company_id
       JOIN task_types tt ON tt.id = cts.task_type_id
       WHERE cts.is_active = TRUE AND c.status = 'active'`
    )

    for (const schedule of schedules) {
      try {
        const { shouldGenerate, forDate } = shouldGenerateToday(
          schedule.recurrence_type,
          schedule.recurrence_config,
          schedule.last_generated_at
        )

        if (!shouldGenerate || !forDate) {
          skipped++
          continue
        }

        // start_date = ngày phát sinh (occurrence) của kỳ; due_date = start + offset hạn chót
        const startDateStr = format(forDate, 'yyyy-MM-dd')
        const dueDateStr = format(
          addDays(forDate, schedule.deadline_offset_days || 0),
          'yyyy-MM-dd'
        )

        // Idempotency check: don't create a duplicate task for same schedule + period
        const periodLabel = buildPeriodLabel(schedule.recurrence_type, forDate)
        const { rows: [existing] } = await query(
          `SELECT id FROM tasks
           WHERE customer_task_schedule_id = $1
             AND period_label = $2`,
          [schedule.id, periodLabel]
        )

        if (existing) {
          // Already generated — just update last_generated_at if needed
          await query(
            'UPDATE customer_task_schedules SET last_generated_at = NOW() WHERE id = $1',
            [schedule.id]
          )
          skipped++
          continue
        }

        const sla = schedule.override_sla_days ?? schedule.default_sla_days
        const title = `[${periodLabel}] ${schedule.task_type_name} — ${schedule.company_name}`

        const { rows: [newTask] } = await query(
          `INSERT INTO tasks
             (title, company_id, task_type_id, customer_task_schedule_id,
              assigned_to, start_date, due_date, period_label, source, sla_days, priority, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'auto',$9,'medium',$10)
           RETURNING id`,
          [
            title,
            schedule.company_id,
            schedule.task_type_id,
            schedule.id,
            schedule.assigned_staff_id ?? null,
            startDateStr,
            dueDateStr,
            periodLabel,
            sla,
            schedule.created_by,
          ]
        )

        // Copy checklist template
        const { rows: steps } = await query(
          'SELECT step_order, step_text FROM task_type_checklist_templates WHERE task_type_id = $1 ORDER BY step_order',
          [schedule.task_type_id]
        )
        if (steps.length && newTask) {
          for (const step of steps) {
            await query(
              'INSERT INTO task_checklist_items (task_id, step_order, step_text) VALUES ($1,$2,$3)',
              [newTask.id, step.step_order, step.step_text]
            )
          }
        }

        tasksCreated.push({
          id:           newTask?.id,
          title,
          companyName:  schedule.company_name,
          taskTypeName: schedule.task_type_name,
          periodLabel,
          dueDate:      dueDateStr,
        })

        // Mark schedule as generated
        await query(
          'UPDATE customer_task_schedules SET last_generated_at = NOW() WHERE id = $1',
          [schedule.id]
        )

        generated++
        logger.info(`[Scheduler] Generated task: ${title}`)
      } catch (scheduleErr) {
        errors++
        logger.error(`[Scheduler] Error processing schedule ${schedule.id}`, {
          error: scheduleErr.message,
        })
      }
    }
  } catch (err) {
    logger.error('[Scheduler] Fatal error in task generator', { error: err.message })
    throw err
  }

  const durationMs = Date.now() - startedAt.getTime()
  const summary = { generated, skipped, errors, durationMs, tasksCreated }
  logger.info('[Scheduler] Task generator finished', { generated, skipped, errors, durationMs })
  return summary
}

module.exports = { runTaskGenerator }
