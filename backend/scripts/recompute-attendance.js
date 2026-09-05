/**
 * recompute-attendance.js
 * Tính lại (recompute) bản ghi chấm công của một hoặc nhiều NGÀY, cho mọi nhân sự
 * đã có bản ghi hoặc log trong ngày đó. Dùng khi cấu hình ngày lễ bị sửa sai
 * (thêm/gỡ ngày lễ) khiến các bản ghi bị kẹt trạng thái, cần dựng lại theo log thật
 * và danh sách ngày lễ hiện hành.
 *
 * An toàn: chỉ gọi lại chính hàm calculateAttendanceRecord dùng khi bấm giờ; KHÔNG
 * đụng bản ghi admin đã sửa tay (is_adjusted) ngoài phần được phép.
 *
 * Chạy:
 *   node scripts/recompute-attendance.js 2026-09-03
 *   node scripts/recompute-attendance.js 2026-09-03 2026-09-01
 */

'use strict'
const { pool, query } = require('../src/config/db')
const { recomputeDate } = require('../src/modules/attendance/attendance.service')

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function snapshot(date) {
  const { rows } = await query(
    `SELECT u.name, r.status, r.is_holiday,
            to_char(r.check_in_time  AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') cin,
            to_char(r.check_out_time AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI') cout,
            r.work_units
     FROM attendance_records r JOIN users u ON u.id = r.user_id
     WHERE r.work_date = $1 ORDER BY u.name`,
    [date]
  )
  return rows
}

function printTable(title, rows) {
  console.log(`  ${title}`)
  if (rows.length === 0) { console.log('    (không có bản ghi)'); return }
  for (const r of rows) {
    console.log(
      `    - ${r.name.padEnd(20)} ${String(r.status).padEnd(14)} ` +
      `hol=${r.is_holiday ? 'T' : 'F'} in=${r.cin ?? '--'} out=${r.cout ?? '--'} công=${r.work_units}`
    )
  }
}

async function main() {
  const dates = process.argv.slice(2)
  if (dates.length === 0 || !dates.every((d) => DATE_RE.test(d))) {
    console.error('Cách dùng: node scripts/recompute-attendance.js <YYYY-MM-DD> [YYYY-MM-DD ...]')
    process.exit(1)
  }

  for (const date of dates) {
    console.log(`\n=== Ngày ${date} ===`)
    printTable('TRƯỚC:', await snapshot(date))
    const res = await recomputeDate(date)
    console.log(`  → recompute: ${res.recomputed}/${res.users} nhân sự`)
    printTable('SAU:', await snapshot(date))
  }

  await pool.end()
  console.log('\n✓ Hoàn tất.')
}

main().catch(async (err) => {
  console.error('Lỗi:', err)
  try { await pool.end() } catch { /* ignore */ }
  process.exit(1)
})
