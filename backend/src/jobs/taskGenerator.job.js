const { query } = require('../config/db')
const logger    = require('../config/logger')
const { shouldGenerateToday, getCurrentOccurrence } = require('../utils/recurrence.calculator')
const { buildPeriodLabel, docPeriodOffset } = require('../utils/periodLabel')
const { rollForwardToWorkday } = require('../utils/workday.util')
const { format, addDays } = require('date-fns')

// Nạp toàn bộ ngày lễ (public_holidays) 1 lần/lần chạy → Set 'YYYY-MM-DD' (tránh query mỗi task)
async function loadHolidaySet() {
  const { rows } = await query("SELECT to_char(holiday_date, 'YYYY-MM-DD') AS d FROM public_holidays")
  return new Set(rows.map(r => r.d))
}

// Tiêu đề task tự sinh: CHỈ gồm kỳ + tên mẫu công việc.
// Trước đây ghép thêm tên viết tắt/tên công ty nên tiêu đề rất dài, trong khi
// mọi chỗ hiển thị task đều đã có cột công ty riêng — ghép vào là thừa.
function buildTaskTitle(periodLabel, taskTypeName) {
  return `[${periodLabel}] ${taskTypeName}`
}

// ── Tạo task cho MỘT kỳ (occurrence) của MỘT lịch ────────────────────────────
// Tách riêng từ vòng lặp generator để DÙNG CHUNG cho cả:
//   • bộ sinh tự động (cron / chạy tay)
//   • tính năng "Sinh bù kỳ" trong console Bộ lập lịch (admin)
// Nhờ dùng chung, logic ngày bắt đầu/hạn chót/nhãn kỳ/checklist KHÔNG BAO GIỜ lệch
// giữa 2 đường sinh.
//
// `schedule` phải có: id, company_id, task_type_id, assigned_staff_id,
//   deadline_offset_days, override_sla_days, default_sla_days, task_type_name,
//   created_by, recurrence_type, recurrence_config, excluded_step_ids.
// `forDate`     : Date — ngày phát sinh (occurrence) GỐC (chưa đẩy CN/lễ).
// `holidaySet`  : Set 'YYYY-MM-DD' — ngày nghỉ để đẩy start/due.
// options.force : true → bỏ qua khoá chống trùng, sinh lại kể cả kỳ đã có task.
//
// Trả về:
//   { status:'skipped', periodLabel, existingId }               (đã có task, không force)
//   { status:'created', periodLabel, task:{ id,title,startDate,dueDate } }
async function createTaskForOccurrence(schedule, forDate, holidaySet, options = {}) {
  const { force = false } = options

  // start_date = ngày phát sinh (occurrence); due_date = occurrence + offset hạn chót.
  // Nếu rơi vào CN/lễ → ĐẨY tới ngày làm việc kế (cả start lẫn due).
  // period_label vẫn tính từ occurrence GỐC (forDate) — giữ idempotency, không lệch chu kỳ.
  const startDateStr = format(rollForwardToWorkday(forDate, holidaySet), 'yyyy-MM-dd')
  const dueDateStr = format(
    rollForwardToWorkday(addDays(forDate, schedule.deadline_offset_days || 0), holidaySet),
    'yyyy-MM-dd'
  )
  const periodLabel = buildPeriodLabel(
    schedule.recurrence_type, forDate, docPeriodOffset(schedule.recurrence_config))

  // Khoá chống trùng: (customer_task_schedule_id + period_label). force = bỏ qua.
  if (!force) {
    const { rows: [existing] } = await query(
      `SELECT id FROM tasks WHERE customer_task_schedule_id = $1 AND period_label = $2`,
      [schedule.id, periodLabel]
    )
    if (existing) return { status: 'skipped', periodLabel, existingId: existing.id }
  }

  const sla = schedule.override_sla_days ?? schedule.default_sla_days
  const title = buildTaskTitle(periodLabel, schedule.task_type_name)

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

  // Copy checklist template (đóng băng cây cha-con vào task)
  const { rows: steps } = await query(
    'SELECT id, step_order, step_text, level FROM task_type_checklist_templates WHERE task_type_id = $1 ORDER BY step_order, id',
    [schedule.task_type_id]
  )
  const parentOf = new Map()
  let lastParentId = null
  for (const s of steps) {
    if ((s.level ?? 0) === 0) { lastParentId = s.id; parentOf.set(s.id, null) }
    else parentOf.set(s.id, lastParentId)
  }
  const excluded = new Set(Array.isArray(schedule.excluded_step_ids) ? schedule.excluded_step_ids : [])
  const applied = steps.filter((step) => !excluded.has(step.id))
  if (applied.length && newTask) {
    for (const step of applied) {
      await query(
        `INSERT INTO task_checklist_items
           (task_id, step_order, step_text, level, source_step_id, source_parent_id)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [newTask.id, step.step_order, step.step_text, step.level ?? 0, step.id, parentOf.get(step.id) ?? null]
      )
    }
  }

  return {
    status:    'created',
    periodLabel,
    task: { id: newTask?.id, title, startDate: startDateStr, dueDate: dueDateStr },
  }
}

// Main idempotent generator — called by cron and by manual trigger.
// options.manual = true → chạy tay "Chạy ngay": nhắm KỲ HIỆN TẠI (occurrence ≤ hôm nay)
//   và chỉ dựa vào việc task đã tồn tại hay chưa, KHÔNG dựa last_generated_at.
//   Nhờ vậy xóa task rồi bấm chạy lại sẽ tạo lại được (vẫn không nhân đôi nếu task còn).
async function runTaskGenerator(options = {}) {
  const { manual = false } = options
  const startedAt = new Date()
  logger.info(`[Scheduler] Task generator started${manual ? ' (manual)' : ''}`)

  let generated    = 0
  let skipped      = 0
  let errors       = 0
  const tasksCreated = []

  try {
    // Ngày nghỉ (CN + lễ) áp cho MỌI lịch: đẩy start/due sang ngày làm việc kế.
    const holidaySet = await loadHolidaySet()

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
        let forDate
        if (manual) {
          // Chạy tay: nhắm kỳ hiện tại (bỏ qua watermark last_generated_at).
          forDate = getCurrentOccurrence(
            schedule.recurrence_type,
            schedule.recurrence_config
          )
        } else {
          // Cron: giữ nguyên hành vi cũ (dựa last_generated_at).
          const res = shouldGenerateToday(
            schedule.recurrence_type,
            schedule.recurrence_config,
            schedule.last_generated_at
          )
          forDate = res.shouldGenerate ? res.forDate : null
        }

        if (!forDate) {
          skipped++
          continue
        }

        // Tạo task cho kỳ này (dùng chung với "Sinh bù kỳ") — bao gồm khoá chống trùng,
        // đẩy CN/lễ, nhãn kỳ, copy checklist.
        const result = await createTaskForOccurrence(schedule, forDate, holidaySet)

        // Dù tạo mới hay bỏ qua đều cập nhật watermark last_generated_at.
        await query(
          'UPDATE customer_task_schedules SET last_generated_at = NOW() WHERE id = $1',
          [schedule.id]
        )

        if (result.status === 'skipped') {
          skipped++
          continue
        }

        tasksCreated.push({
          id:           result.task.id,
          title:        result.task.title,
          companyName:  schedule.company_name,
          taskTypeName: schedule.task_type_name,
          periodLabel:  result.periodLabel,
          dueDate:      result.task.dueDate,
        })

        generated++
        logger.info(`[Scheduler] Generated task: ${result.task.title}`)
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

// buildPeriodLabel/buildTaskTitle được xuất ra để kiểm thử ĐƯỢC MÀ KHÔNG phải
// gọi runTaskGenerator — hàm đó quét toàn bộ lịch của mọi công ty và ghi task
// thật, không dùng để test được.
module.exports = {
  runTaskGenerator, buildPeriodLabel, buildTaskTitle,
  createTaskForOccurrence, loadHolidaySet,
}
