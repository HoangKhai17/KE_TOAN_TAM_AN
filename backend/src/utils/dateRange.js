'use strict'
// Tiện ích kiểm tra khoảng ngày (start–end): chặn ngày kết thúc < ngày bắt đầu.
// Dùng chung cho payroll / locations / internal-assignments / leave.

// Chuẩn hoá về 'YYYY-MM-DD' | null (nhận string hoặc Date từ pg).
function toDateStr(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const d = v instanceof Date ? v : new Date(v)
  if (isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Ném lỗi 422 nếu CẢ HAI có giá trị và end < start. (end == start được phép.)
function assertEndNotBeforeStart(startVal, endVal, message = 'Ngày kết thúc không được nhỏ hơn ngày bắt đầu') {
  const s = toDateStr(startVal)
  const e = toDateStr(endVal)
  if (s && e && e < s) {
    throw Object.assign(new Error(message), { status: 422 })
  }
}

module.exports = { toDateStr, assertEndNotBeforeStart }
