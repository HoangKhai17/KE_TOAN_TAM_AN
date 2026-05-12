/**
 * test-scheduler-integration.js
 * Integration test đầy đủ: tạo schedule → chạy generator → verify task → cleanup
 *
 * Chạy bên trong Docker container:
 *   docker exec ke_toan_tam_an-backend-1 node src/scripts/test-scheduler-integration.js
 *
 * ⚠️  Script này GHI VÀO DATABASE rồi xoá sạch sau khi test xong.
 *     Chỉ chạy trên môi trường dev/local.
 */

'use strict'

// Khi chạy trong Docker, env vars đã được inject bởi docker-compose
// Fallback: load .env nếu có (chạy local)
try { require('dotenv').config() } catch (_) {}

const { query, testConnection } = require('../config/db')
const { runTaskGenerator }      = require('../jobs/taskGenerator.job')
const { format, addDays }       = require('date-fns')

const TODAY     = format(new Date(), 'yyyy-MM-dd')
const YESTERDAY = format(addDays(new Date(), -1), 'yyyy-MM-dd')
const LAST_MONTH_SECOND_LAST = format(
  addDays(new Date(new Date().getFullYear(), new Date().getMonth(), 0), -1),
  'yyyy-MM-dd'
) // 2 ngày trước ngày cuối tháng trước

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
  console.log('─'.repeat(64))
}

// ── Lấy company + task_type từ DB ─────────────────────────────────────────────

async function getTestAnchors() {
  const { rows: companies } = await query(
    `SELECT id, name FROM companies WHERE status = 'active' LIMIT 1`
  )
  if (!companies.length)
    throw new Error('Không có company active. Hãy tạo ít nhất 1 company active trước.')

  const { rows: taskTypes } = await query(
    `SELECT id, name FROM task_types WHERE is_active = TRUE LIMIT 1`
  )
  if (!taskTypes.length)
    throw new Error('Không có task_type active. Hãy tạo ít nhất 1 loại công việc trong Settings.')

  const { rows: admins } = await query(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  )
  if (!admins.length)
    throw new Error('Không có user admin.')

  return {
    companyId:    companies[0].id,
    companyName:  companies[0].name,
    taskTypeId:   taskTypes[0].id,
    taskTypeName: taskTypes[0].name,
    createdBy:    admins[0].id,
  }
}

// ── Configs cho 9 loại lặp ────────────────────────────────────────────────────
// Mỗi config dùng last_generated_at để đảm bảo shouldGenerateToday() = true

function buildTestSchedules(createdBy, companyId, taskTypeId) {
  const d = new Date()
  const todayDate  = d.getDate()
  const todayMonth = d.getMonth() + 1
  const todayDow   = d.getDay()                          // 0=Sun … 6=Sat
  const qStart     = Math.floor((todayMonth - 1) / 3) * 3 + 1
  const monthInQtr = todayMonth - qStart + 1             // 1-3

  return [
    {
      _label: `daily — every 1 day`,
      recurrence_type:   'daily',
      recurrence_config: { every_n_days: 1 },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `weekly — weekday=${todayDow} (hôm nay)`,
      recurrence_type:   'weekly',
      recurrence_config: { weekdays: [todayDow] },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `monthly_by_date — day=${todayDate}`,
      recurrence_type:   'monthly_by_date',
      recurrence_config: { day: todayDate },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `monthly_by_weekday — 1st weekday=${todayDow} (backdate 45d)`,
      recurrence_type:   'monthly_by_weekday',
      recurrence_config: { weekday: todayDow, week: 1 },
      // 45 ngày trước → next occurrence (1st DoW) sẽ ≤ hôm nay
      last_generated_at: format(addDays(new Date(), -45), 'yyyy-MM-dd'),
    },
    {
      _label: `monthly_last_day — backdate to before prev month-end`,
      recurrence_type:   'monthly_last_day',
      recurrence_config: {},
      // 2 ngày trước ngày cuối tháng trước → next = ngày cuối tháng trước ≤ hôm nay
      last_generated_at: LAST_MONTH_SECOND_LAST,
    },
    {
      _label: `quarterly — month_in_quarter=${monthInQtr}, day=${todayDate}`,
      recurrence_type:   'quarterly',
      recurrence_config: { month_in_quarter: monthInQtr, day: todayDate },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `yearly — month=${todayMonth}, day=${todayDate}`,
      recurrence_type:   'yearly',
      recurrence_config: { month: todayMonth, day: todayDate },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `custom_dates — chứa hôm nay (${TODAY})`,
      recurrence_type:   'custom_dates',
      recurrence_config: {
        dates: [TODAY, format(addDays(new Date(), 60), 'yyyy-MM-dd')],
      },
      last_generated_at: YESTERDAY,   // next = today ✅
    },
    {
      _label: `once — date=${TODAY}`,
      recurrence_type:   'once',
      recurrence_config: { date: TODAY },
      last_generated_at: YESTERDAY,   // next = today ✅
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

// ── Insert / Cleanup ───────────────────────────────────────────────────────────

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

async function cleanup(scheduleIds) {
  if (!scheduleIds.length) return
  await query(
    `DELETE FROM task_checklist_items
     WHERE task_id IN (
       SELECT id FROM tasks WHERE customer_task_schedule_id = ANY($1::uuid[])
     )`,
    [scheduleIds]
  )
  await query(
    `DELETE FROM tasks WHERE customer_task_schedule_id = ANY($1::uuid[])`,
    [scheduleIds]
  )
  await query(
    `DELETE FROM customer_task_schedules WHERE id = ANY($1::uuid[])`,
    [scheduleIds]
  )
  info(`Đã xoá ${scheduleIds.length} test schedules + tasks + checklist items.`)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗`)
  console.log(`║   INTEGRATION TEST — Task Auto-Generator (9 loại lặp)       ║`)
  console.log(`╚════════════════════════════════════════════════════════════╝${c.reset}`)
  console.log(`  TODAY = ${TODAY}  (dayOfWeek=${new Date().getDay()}, date=${new Date().getDate()})`)

  await testConnection()

  // ── Bước 1: Anchor data ──────────────────────────────────────────────────────
  header('BƯỚC 1: Lấy anchor data từ DB')
  const { companyId, companyName, taskTypeId, taskTypeName, createdBy } = await getTestAnchors()
  info(`Company  : ${companyName} (${companyId})`)
  info(`Task type: ${taskTypeName} (${taskTypeId})`)

  // ── Bước 2: Tạo schedules ────────────────────────────────────────────────────
  header('BƯỚC 2: Tạo 9 test schedules trong DB')
  const schedules   = buildTestSchedules(createdBy, companyId, taskTypeId)
  const scheduleIds = []

  for (const s of schedules) {
    const id = await insertSchedule(s)
    scheduleIds.push(id)
    info(`  [${s.recurrence_type.padEnd(20)}] ${s._label}`)
  }
  ok(`Tạo thành công ${scheduleIds.length}/9 schedules`)

  // ── Bước 3: Chạy generator lần 1 ────────────────────────────────────────────
  header('BƯỚC 3: Chạy runTaskGenerator() lần 1')
  let result1
  try {
    result1 = await runTaskGenerator()
  } catch (e) {
    fail('runTaskGenerator() ném lỗi: ' + e.message)
    await cleanup(scheduleIds)
    process.exit(1)
  }
  console.log(`  generated : ${c.green}${result1.generated}${c.reset}`)
  console.log(`  skipped   : ${result1.skipped}`)
  console.log(`  errors    : ${result1.errors > 0 ? c.red : ''}${result1.errors}${c.reset}`)
  console.log(`  duration  : ${result1.durationMs}ms`)

  // ── Bước 4: Verify tasks được tạo ───────────────────────────────────────────
  header('BƯỚC 4: Kiểm tra tasks đã được tạo')
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
    info(`[${t.recurrence_type.padEnd(20)}] period=${t.period_label}  due=${t.due_date}  "${t.title.slice(0, 60)}"`)
  }

  for (const s of schedules) {
    if (createdByType[s.recurrence_type]) {
      ok(`${s.recurrence_type}: task tạo OK (period=${createdByType[s.recurrence_type].period_label})`)
    } else {
      fail(`${s.recurrence_type}: KHÔNG có task nào được tạo`)
    }
  }

  createdTasks.every(t => t.source === 'auto')
    ? ok('Tất cả tasks có source="auto"')
    : fail('Có task không có source="auto"')

  if (createdTasks.length === 9) {
    ok(`Tổng: ${createdTasks.length}/9 tasks`)
  } else {
    warn(`Tổng: ${createdTasks.length}/9 tasks — xem log bên trên để debug`)
  }

  // ── Bước 5: Idempotency ──────────────────────────────────────────────────────
  header('BƯỚC 5: Idempotency — chạy lại lần 2')
  const result2 = await runTaskGenerator()
  info(`Lần 2 → generated=${result2.generated}, skipped=${result2.skipped}`)
  result2.generated === 0
    ? ok('Không sinh task trùng (idempotency OK)')
    : fail(`Sinh thêm ${result2.generated} task trùng! Lỗi idempotency.`)

  // ── Bước 6: Checklist ────────────────────────────────────────────────────────
  header('BƯỚC 6: Kiểm tra checklist được copy')
  const { rows: [ttInfo] } = await query(
    `SELECT COUNT(*) AS cnt FROM task_type_checklist_templates WHERE task_type_id = $1`,
    [taskTypeId]
  )
  const templateCount = parseInt(ttInfo.cnt, 10)
  if (templateCount === 0) {
    warn(`"${taskTypeName}" chưa có checklist template.`)
    warn('→ Thêm checklist steps trong Settings > Loại công việc để test đầy đủ.')
  } else {
    const { rows: clRows } = await query(
      `SELECT tci.task_id, COUNT(*) AS cnt
       FROM task_checklist_items tci
       JOIN tasks t ON t.id = tci.task_id
       WHERE t.customer_task_schedule_id = ANY($1::uuid[])
       GROUP BY tci.task_id`,
      [scheduleIds]
    )
    const correct = clRows.filter(r => parseInt(r.cnt, 10) === templateCount).length
    correct === createdTasks.length
      ? ok(`${createdTasks.length} tasks đều có đủ ${templateCount} checklist items`)
      : fail(`Chỉ ${correct}/${createdTasks.length} tasks có đủ checklist`)
  }

  // ── Bước 7: Cleanup ──────────────────────────────────────────────────────────
  header('BƯỚC 7: Cleanup — xoá test data')
  await cleanup(scheduleIds)
  ok('Đã xoá sạch')

  // ── Tổng kết ─────────────────────────────────────────────────────────────────
  header('KẾT QUẢ')
  console.log(`  ${c.green}✅ Passed: ${passed}${c.reset}`)
  console.log(`  ${failed > 0 ? c.red : c.dim}❌ Failed: ${failed}${c.reset}`)

  if (failed === 0) {
    console.log(`\n  ${c.bold}${c.green}🎉 TẤT CẢ PASS — Scheduler hoạt động đúng với 9 loại lặp!${c.reset}\n`)
  } else {
    console.log(`\n  ${c.bold}${c.red}⚠️  CÓ LỖI — Xem chi tiết bên trên.${c.reset}\n`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`\n${c.red}FATAL:${c.reset}`, err.message)
  process.exit(1)
})
