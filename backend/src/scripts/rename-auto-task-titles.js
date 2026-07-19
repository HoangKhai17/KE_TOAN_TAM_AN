'use strict'
/**
 * Bỏ tên công ty khỏi tiêu đề các công việc TỰ SINH đã tạo trước đây.
 *
 *   Cũ:  [T07/2026] Lập bảng lương — CÔNG TY TNHH ABC XYZ
 *   Mới: [T07/2026] Lập bảng lương
 *
 * VÌ SAO CẮT CHUỖI chứ không dựng lại từ (period_label + task_types.name):
 *   Dựng lại nghe có vẻ "sạch" hơn nhưng nó VIẾT LẠI LỊCH SỬ — khảo sát dữ liệu
 *   thật thấy 30/70 task bị lệch:
 *     · mẫu công việc đã được đổi tên sau khi task phát sinh
 *       ("Lập bảng lương" → "Quy trình bảng lương KH doanh nghiệp")
 *     · có task tiêu đề ghi [Q2/2026] trong khi period_label lại là T07/2026
 *   Người dùng chỉ muốn bỏ tên công ty, KHÔNG muốn đổi kỳ hay tên mẫu lúc phát
 *   sinh. Nên chỉ cắt phần đuôi, giữ nguyên phần đầu y như cũ.
 *
 * AN TOÀN:
 *   · Chỉ đụng tới task source='auto' và tiêu đề có đúng dấu ' — '
 *   · Chỉ đổi khi phần cắt bỏ TRÙNG KHỚP tên công ty (hoặc tên viết tắt) của
 *     chính task đó — không khớp thì bỏ qua và liệt kê ra để xem lại
 *   · Chạy trong transaction, mặc định là CHẠY THỬ (không ghi)
 *
 * Dùng:
 *   node src/scripts/rename-auto-task-titles.js          # chạy thử, chỉ in ra
 *   node src/scripts/rename-auto-task-titles.js --apply  # ghi thật
 */
const { query, getClient } = require('../config/db')

const APPLY = process.argv.includes('--apply')
const SEP = ' — '

async function main() {
  const { rows } = await query(
    `SELECT t.id, t.title, c.name AS company_name, c.short_name
       FROM tasks t
       JOIN companies c ON c.id = t.company_id
      WHERE t.source = 'auto'
        AND position($1 in t.title) > 0
      ORDER BY t.created_at`,
    [SEP]
  )

  const doi = []
  const boQua = []

  for (const r of rows) {
    const i = r.title.indexOf(SEP)
    const giuLai = r.title.slice(0, i)
    const catBo  = r.title.slice(i + SEP.length)

    // Phần cắt bỏ phải đúng là tên công ty — nếu không, rất có thể dấu — nằm
    // trong chính tên mẫu, cắt vào là mất chữ.
    const khopCty = catBo === r.company_name || (r.short_name && catBo === r.short_name)
    if (!khopCty)      { boQua.push({ ...r, catBo, lyDo: 'phần cắt bỏ không khớp tên công ty' }); continue }
    if (!giuLai.trim()) { boQua.push({ ...r, catBo, lyDo: 'cắt xong không còn gì' }); continue }
    if (giuLai === r.title) continue

    doi.push({ id: r.id, cu: r.title, moi: giuLai })
  }

  console.log(`\nTìm thấy ${rows.length} công việc tự sinh có tên công ty trong tiêu đề`)
  console.log(`  → sẽ đổi:  ${doi.length}`)
  console.log(`  → bỏ qua:  ${boQua.length}`)

  if (boQua.length) {
    console.log('\nBỎ QUA (cần xem lại thủ công):')
    boQua.forEach((b) => console.log(`  · ${b.lyDo}\n      ${b.cu ?? b.title}`))
  }

  console.log('\nVí dụ thay đổi:')
  doi.slice(0, 5).forEach((d) => console.log(`  - ${d.cu}\n  + ${d.moi}`))
  if (doi.length > 5) console.log(`  … và ${doi.length - 5} công việc nữa`)

  if (!APPLY) {
    console.log('\n[CHẠY THỬ] Chưa ghi gì vào CSDL. Thêm --apply để ghi thật.\n')
    process.exit(0)
  }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    for (const d of doi) {
      await client.query('UPDATE tasks SET title = $1, updated_at = NOW() WHERE id = $2', [d.moi, d.id])
    }
    await client.query('COMMIT')
    console.log(`\n[ĐÃ GHI] Cập nhật ${doi.length} tiêu đề.\n`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('\n[LỖI] Đã hoàn tác toàn bộ:', err.message, '\n')
    process.exit(1)
  } finally {
    client.release()
  }
  process.exit(0)
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
