// Helper ngày dùng chung TOÀN HỆ THỐNG (không gắn với riêng module Companies).
// - fmtDate(iso): 'YYYY-MM-DD' → 'dd/mm/yyyy' (theo vi-VN)
// - parseDateInput(raw): chuỗi người dùng gõ → 'YYYY-MM-DD' | '' | null

export function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Nhận chuỗi ngày người dùng GÕ TAY, trả về:
//   'YYYY-MM-DD' nếu hợp lệ | '' nếu để trống | null nếu sai định dạng / ngày không có thật.
// Chấp nhận: dd/mm/yyyy, d/m/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd/mm/yy, ddmmyyyy, ddmmyy,
//            và cả ISO sẵn yyyy-mm-dd. Có kiểm tra ngày thật (loại 31/02, 30/02…).
export function parseDateInput(raw) {
  const str = String(raw == null ? '' : raw).trim()
  if (!str) return ''
  let d, m, y
  let mt = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) // ISO sẵn
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3] }
  else {
    mt = str.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{2}|\d{4})$/) // dd/mm/yyyy & biến thể
    if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3] }
    else {
      mt = str.match(/^(\d{2})(\d{2})(\d{4})$/) || str.match(/^(\d{2})(\d{2})(\d{2})$/) // liền: ddmmyyyy / ddmmyy
      if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3] }
      else return null
    }
  }
  if (y < 100) y += 2000 // năm 2 chữ số → 20xx
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null // ngày không có thật
  const pad = (n) => String(n).padStart(2, '0')
  return `${y}-${pad(m)}-${pad(d)}`
}
