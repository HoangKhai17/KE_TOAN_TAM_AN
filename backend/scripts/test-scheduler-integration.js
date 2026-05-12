/**
 * test-scheduler-integration.js
 * Integration test đầy đủ: tạo schedule → chạy generator → verify task → cleanup
 *
 * Chạy: node scripts/test-scheduler-integration.js
 *
 * ⚠️  Script này GHI VÀO DATABASE rồi xoá sạch sau khi test xong.
 *     Chỉ chạy trên môi trường dev/local, không chạy trên production thật.
 */

'use strict'
require('dotenv').config()

const { query, testConnection } = require('../src/config/db')
const { runTaskGenerator }      = require('../src/jobs/taskGenerator.job')
const { format, addDays }       = require('date-fns')

const TODAY     = format(new Date(), 'yyyy-MM-dd')
const YESTERDAY = format(addDays(new Date(), -1), 'yyyy-MM-dd')
const LAST_MONTH_SECOND_LAST = format(addDays(
  new Date(new Date().getFullYear(), new Date().getMonth(), 0), -1
), 'yyyy-MM-dd') // 2 ngày trước ngày cuối tháng trước

// ── Console helpers ────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
}

let passed = 0; let failed = 0
function ok(msg)   { console.log(`  ${c.green}✅${c.reset} ${msg}`); passed++ }
function fail(msg) { console.log(`  ${c.red}❌${c.reset} ${msg}`); failed++ }
function info(msg) { console.log(`  ${c.cyan}ℹ${c.reset}  ${msg}`) }
function warn(msg) { console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`) }
function header(t) {
  console.log(`\n${c.bold}${'─'.repeat(64)}${c.reset}`)
  console.log(`${c.bold}  ${t}${c.reset}`)
  console.log(`${'─'.repeat(64)}`)
}

// ── Setup: lấy company + task_type từ DB ───────────────────────────────────────

async function getTestAnchors() {
  const { rows: companies } = await query(
    `SELECT id, name FROM companies WHERE status = 'active' LIMIT 1`
  )
  if (!companies.length) throw new Error('Không có company active nào trong DB. Hãy tạo ít nhất 1 company active.')

  const { rows: taskTypes } = await query(
    `SELECT id, name FROM task_types WHERE is_active = TRUE LIMIT 1`
  )
  if (!taskTypes.length) throw new Error('Không có task_type active nào. Hãy tạo ít nhất 1 loại công việc.')

  const { rows: admins } = await query(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  )
  if (!admins.length) throw new Error('Không có user admin nào.')

  return {
    companyId:  companies[0].id,
    companyName: companies[0].name,
    taskTypeId: taskTypes[0].id,
    taskTypeName: taskTypes[0].name,
    createdBy:  admins[0].id,
  }
}

// ── Test schedule configs ──────────────────────────────────────────────────────
// 9 loại, mỗi loại kèm last_generated_at để đảm bảo kích hoạt hôm nay.
// Quy tắc: shouldGenerateToday() = true khi next_occurrence(referenceDate) <= today

function buildTestSchedules(createdBy, companyId, taskTypeId) {
  const d = new Date()
  const todayDate  = d.getDate()
  const todayMonth = d.getMonth() + 1
  const todayDow   = d.getDay()

  // Tính vị trí trong quý
  const qStart        = Math.floor((todayMonth - 1) / 3) * 3 + 1
  const monthInQtr    = todayMonth - qStart + 1

  return [
    {
      _label: 'daily (every 1 day)',
      recurrence_type:   'daily',
      recurrence_config: { every_n_days: 1 },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: `weekly (weekday=${todayDow} = today)`,
      recurrence_type:   'weekly',
      recurrence_config: { weekdays: [todayDow] },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: `monthly_by_date (day=${todayDate})`,
      recurrence_type:   'monthly_by_date',
      recurrence_config: { day: todayDate },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: 'monthly_by_weekday (backdate to force)',
      recurrence_type:   'monthly_by_weekday',
      recurrence_config: { weekday: todayDow, week: 1 }, // 1st occurrence of today's DoW
      last_generated_at: format(addDays(new Date(), -45), 'yyyy-MM-dd'), // 45 ngày trước → next sẽ ≤ hôm nay
    },
    {
      _label: 'monthly_last_day (backdate to prev month)',
      recurrence_type:   'monthly_last_day',
      recurrence_config: {},
      last_generated_at: LAST_MONTH_SECOND_LAST, // 2 ngày trước ngày cuối tháng trước → next = cuối tháng trước ≤ hôm nay
    },
    {
      _label: `quarterly (month_in_quarter=${monthInQtr}, day=${todayDate})`,
      recurrence_type:   'quarterly',
      recurrence_config: { month_in_quarter: monthInQtr, day: todayDate },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: `yearly (month=${todayMonth}, day=${todayDate})`,
      recurrence_type:   'yearly',
      recurrence_config: { month: todayMonth, day: todayDate },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: 'custom_dates (contains today)',
      recurrence_type:   'custom_dates',
      recurrence_config: { dates: [TODAY, format(addDays(new Date(), 60), 'yyyy-MM-dd')] },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
    {
      _label: `once (date=${TODAY})`,
      recurrence_type:   'once',
      recurrence_config: { date: TODAY },
      last_generated_at: YESTERDAY,        // next = today ✅
    },
  ].map(s => ({
    ...s,
    company_id:           companyId,
    task_type_id:         taskTypeId,
    deadline_offset_days: 0,
    is_active:            true,
    created_by:           createdBy,
  }))
}

// ── Insert test schedules ──────────────────────────────────────────────────────

async function insertSchedule(s) {
  const { rows: [row] } = await query(
    `INSERT INTO customer_task_schedules
       (company_id, task_type_id, recurrence_type, recurrence_config,
        deadline_offset_days, is_active, last_generated_at, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::timestamp,$8)
     RETURNING id`,
    [
      s.company_id, s.task_type_id,
      s.recurrence_type, JSON.stringify(s.recurrence_config),
      s.deadline_offset_days, s.is_active,
      s.last_generated_at, s.created_by,
    ]
  )
  return row.id
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

async function cleanup(scheduleIds) {
  if (!scheduleIds.length) return
  // Xoá tasks trước (FK constraint)
  await query(
    `DELETE FROM tasks WHERE customer_task_schedule_id = ANY($1::uuid[])`,
    [scheduleIds]
  )
  await query(
    `DELETE FROM customer_task_schedules WHERE id = ANY($1::uuid[])`,
    [scheduleIds]
  )
  info(`Đã xoá ${scheduleIds.length} test schedules và tasks liên quan.`)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗`)
  console.log(`║   INTEGRATION TEST — Task Auto-Generator (9 loại lặp)       ║`)
  console.log(`╚════════════════════════════════════════════════════════════╝${c.reset}`)
  console.log(`  TODAY = ${TODAY}`)

  await testConnection()

  header('BƯỚC 1: Lấy dữ liệu anchor từ DB')
  const { companyId, companyName, taskTypeId, taskTypeName, createdBy } = await getTestAnchors()
  info(`Company : ${companyName} (${companyId})`)
  info(`TaskType: ${taskTypeName} (${taskTypeId})`)

  header('BƯỚC 2: Tạo 9 test schedules')
  const schedules = buildTestSchedules(createdBy, companyId, taskTypeId)
  const scheduleIds = []

  for (const s of schedules) {
    const id = await insertSchedule(s)
    scheduleIds.push(id)
    info(`[${s.recurrence_type.padEnd(20)}] ${s._label}  → id=${id}`)
  }
  ok(`Đã tạo ${scheduleIds.length}/9 schedules`)

  header('BƯỚC 3: Chạy task generator lần 1 (run-now)')
  let result1
  try {
    result1 = await runTaskGenerator()
    console.log(`  generated: ${c.green}${result1.generated}${c.reset}`)
    console.log(`  skipped  : ${result1.skipped}`)
    console.log(`  errors   : ${result1.errors > 0 ? c.red : ''}${result1.errors}${c.reset}`)
    console.log(`  duration : ${result1.durationMs}ms`)
  } catch (e) {
    fail('runTaskGenerator() ném lỗi: ' + e.message)
    await cleanup(scheduleIds)
    process.exit(1)
  }

  header('BƯỚC 4: Verify — kiểm tra tasks đã được tạo')
  const { rows: createdTasks } = await query(
    `SELECT t.id, t.title, t.period_label, t.due_date, t.source,
            cts.recurrence_type
     FROM tasks t
     JOIN customer_task_schedules cts ON cts.id = t.customer_task_schedule_id
     WHERE t.customer_task_schedule_id = ANY($1::uuid[])
     ORDER BY cts.recurrence_type`,
    [scheduleIds]
  )

  const createdByType = {}
  for (const t of createdTasks) {
    createdByType[t.recurrence_type] = t
    info(`[${t.recurrence_type.padEnd(20)}] "${t.title}"  period=${t.period_label}  due=${t.due_date}`)
  }

  const allTypes = schedules.map(s => s.recurrence_type)
  for (const type of allTypes) {
    if (createdByType[type]) {
      ok(`${type}: task được tạo (period=${createdByType[type].period_label})`)
    } else {
      fail(`${type}: KHÔNG tìm thấy task nào được tạo`)
    }
  }

  // Verify source = 'auto'
  const allAuto = createdTasks.every(t => t.source === 'auto')
  allAuto ? ok('Tất cả tasks có source = "auto"') : fail('Một số task không có source = "auto"')

  // Verify tổng tasks = 9 (hoặc ít hơn nếu some configs fail to fire)
  if (createdTasks.length === 9) {
    ok(`Tổng tasks tạo ra: ${createdTasks.length}/9`)
  } else {
    warn(`Tổng tasks tạo ra: ${createdTasks.length}/9 (một số config chưa kích hoạt hôm nay — xem log phía trên)`)
  }

  header('BƯỚC 5: Idempotency — chạy lại generator lần 2')
  const result2 = await runTaskGenerator()
  info(`Lần 2 → generated: ${result2.generated}, skipped: ${result2.skipped}`)
  result2.generated === 0
    ? ok('Không sinh thêm task trùng (idempotency OK)')
    : fail(`Sinh thêm ${result2.generated} task trùng! Idempotency bị lỗi.`)

  header('BƯỚC 6: Verify checklist được copy (nếu task_type có checklist)')
  const { rows: clItems } = await query(
    `SELECT tci.task_id, COUNT(*) AS cnt
     FROM task_checklist_items tci
     JOIN tasks t ON t.id = tci.task_id
     WHERE t.customer_task_schedule_id = ANY($1::uuid[])
     GROUP BY tci.task_id`,
    [scheduleIds]
  )
  const { rows: [ttInfo] } = await query(
    `SELECT COUNT(*) AS template_count FROM task_type_checklist_templates WHERE task_type_id = $1`,
    [taskTypeId]
  )
  const templateCount = parseInt(ttInfo.template_count, 10)
  if (templateCount === 0) {
    warn(`Task type "${taskTypeName}" không có checklist template — bỏ qua bước này.`)
    warn('Thêm checklist template cho loại công việc để test đầy đủ hơn.')
  } else {
    const tasksWithCL = clItems.filter(r => parseInt(r.cnt, 10) === templateCount)
    tasksWithCL.length === createdTasks.length
      ? ok(`${createdTasks.length} tasks đều có đủ ${templateCount} checklist items`)
      : fail(`Chỉ ${tasksWithCL.length}/${createdTasks.length} tasks có đủ checklist items`)
  }

  header('BƯỚC 7: Cleanup — xoá test data')
  await cleanup(scheduleIds)
  ok('Đã xoá sạch test data')

  header('KẾT QUẢ TỔNG HỢP')
  console.log(`  ${c.green}✅ Passed: ${passed}${c.reset}`)
  if (failed > 0) {
    console.log(`  ${c.red}❌ Failed: ${failed}${c.reset}`)
  } else {
    console.log(`  ${c.dim}❌ Failed: 0${c.reset}`)
  }

  if (failed === 0) {
    console.log(`\n  ${c.bold}${c.green}🎉 TẤT CẢ TEST PASS — Scheduler hoạt động đúng!${c.reset}\n`)
  } else {
    console.log(`\n  ${c.bold}${c.red}⚠️  CÓ ${failed} LỖI — Kiểm tra log bên trên.${c.reset}\n`)
    process.exit(1)
  }
}

main().catch(async (err) => {
  console.error(`\n${c.red}FATAL ERROR:${c.reset}`, err.message)
  process.exit(1)
})
