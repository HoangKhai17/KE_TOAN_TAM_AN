'use strict'
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MÃ TẠM THỜI — XOÁ SAU KHI CHẠY XONG TRÊN SERVER                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Bỏ tên công ty khỏi tiêu đề các công việc TỰ SINH đã tạo trước đây.
 *
 *   Cũ:  [T07/2026] Lập bảng lương — CÔNG TY TNHH ABC XYZ
 *   Mới: [T07/2026] Lập bảng lương
 *
 * Logic nằm ở renameAutoTitles.TEMP.service.js — DÙNG CHUNG với nút bấm trong
 * Cài đặt → Loại công việc, để hai đường chạy không thể lệch nhau.
 * Trên server không gõ được lệnh docker thì bấm nút; ở máy dev thì chạy file này.
 *
 * Dùng:
 *   node src/scripts/rename-auto-task-titles.js          # chạy thử, chỉ in ra
 *   node src/scripts/rename-auto-task-titles.js --apply  # ghi thật
 */
const svc = require('../modules/task-types/renameAutoTitles.TEMP.service')

const APPLY = process.argv.includes('--apply')

async function main() {
  const kq = APPLY ? await svc.ghiThayDoi() : await svc.tinhThayDoi()

  console.log(`\nTìm thấy ${kq.tongKet.timThay} công việc tự sinh có tên công ty trong tiêu đề`)
  console.log(`  → sẽ đổi:  ${kq.tongKet.seDoi}`)
  console.log(`  → bỏ qua:  ${kq.tongKet.boQua}`)

  if (kq.boQua.length) {
    console.log('\nBỎ QUA (cần xem lại thủ công):')
    kq.boQua.forEach((b) => console.log(`  · ${b.lyDo}\n      ${b.tieuDe}`))
  }

  if (kq.doi.length) {
    console.log('\nVí dụ thay đổi:')
    kq.doi.slice(0, 5).forEach((d) => console.log(`  - ${d.cu}\n  + ${d.moi}`))
    if (kq.doi.length > 5) console.log(`  … và ${kq.doi.length - 5} công việc nữa`)
  }

  console.log(APPLY
    ? `\n[ĐÃ GHI] Cập nhật ${kq.daGhi} tiêu đề.\n`
    : '\n[CHẠY THỬ] Chưa ghi gì vào CSDL. Thêm --apply để ghi thật.\n')
  process.exit(0)
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
