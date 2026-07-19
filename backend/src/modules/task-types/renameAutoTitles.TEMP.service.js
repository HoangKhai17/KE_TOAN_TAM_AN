'use strict'
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MÃ TẠM THỜI — XOÁ SAU KHI CHẠY XONG TRÊN SERVER                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Bỏ tên công ty khỏi tiêu đề công việc TỰ SINH đã tạo trước đây:
 *   Cũ:  [T07/2026] Lập bảng lương — CÔNG TY TNHH ABC XYZ
 *   Mới: [T07/2026] Lập bảng lương
 *
 * Đây là việc DỌN DỮ LIỆU MỘT LẦN. Bộ sinh task đã sửa từ trước nên công việc
 * phát sinh mới vốn đã đúng định dạng; chỉ dữ liệu cũ cần dọn.
 *
 * Vì sao có API + nút bấm thay vì chỉ chạy script: trên server không gõ được
 * lệnh docker, nên cần bấm từ giao diện. Chạy xong thì XOÁ:
 *   · file này
 *   · 2 route + 2 hàm controller đánh dấu TEMP trong module task-types
 *   · frontend/src/pages/Settings/RenameTitlesModal.TEMP.jsx
 *   · 2 hàm TEMP trong frontend/src/api/taskTypes.js
 *   · nút + state đánh dấu TEMP trong TaskTypesSection.jsx
 *
 * VÌ SAO CẮT CHUỖI chứ không dựng lại từ (period_label + tên mẫu):
 *   Dựng lại sẽ VIẾT LẠI LỊCH SỬ — dữ liệu thật có 30/70 task lệch:
 *     · mẫu đã đổi tên sau khi task phát sinh
 *     · có task tiêu đề ghi [Q2/2026] trong khi period_label là T07/2026
 *   Chỉ cần bỏ tên công ty, giữ nguyên kỳ và tên mẫu lúc phát sinh.
 *
 * AN TOÀN: chỉ đổi khi phần cắt bỏ TRÙNG KHỚP tên công ty (hoặc tên viết tắt)
 * của chính task đó. Không khớp thì bỏ qua và liệt kê ra để người dùng xem lại —
 * tránh cắt nhầm khi dấu ' — ' nằm trong chính tên mẫu.
 */
const { query, getClient } = require('../../config/db')

const SEP = ' — '

// Tính toán thay đổi, KHÔNG ghi gì. Dùng cho cả phần xem trước lẫn lúc chạy thật.
async function tinhThayDoi() {
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

    const khopCty = catBo === r.company_name || (r.short_name && catBo === r.short_name)
    if (!khopCty) {
      boQua.push({ id: r.id, tieuDe: r.title, catBo, lyDo: 'phần cắt bỏ không khớp tên công ty' })
      continue
    }
    if (!giuLai.trim()) {
      boQua.push({ id: r.id, tieuDe: r.title, catBo, lyDo: 'cắt xong không còn gì' })
      continue
    }
    if (giuLai === r.title) continue

    doi.push({ id: r.id, cu: r.title, moi: giuLai, congTy: r.company_name })
  }

  return {
    tongKet: { timThay: rows.length, seDoi: doi.length, boQua: boQua.length },
    doi,
    boQua,
  }
}

// Ghi thật, trong transaction — lỗi giữa chừng thì hoàn tác toàn bộ.
async function ghiThayDoi() {
  const kq = await tinhThayDoi()
  if (!kq.doi.length) return { ...kq, daGhi: 0 }

  const client = await getClient()
  try {
    await client.query('BEGIN')
    for (const d of kq.doi) {
      await client.query('UPDATE tasks SET title = $1, updated_at = NOW() WHERE id = $2', [d.moi, d.id])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  return { ...kq, daGhi: kq.doi.length }
}

module.exports = { tinhThayDoi, ghiThayDoi }
