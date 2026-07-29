const { addDays, getDay, format } = require('date-fns')

// Ngày nghỉ = CHỦ NHẬT (getDay === 0) HOẶC trùng ngày lễ trong public_holidays.
// THỨ 7 vẫn là ngày làm việc (theo yêu cầu nghiệp vụ).
function isOffDay(date, holidaySet) {
  if (getDay(date) === 0) return true
  return holidaySet ? holidaySet.has(format(date, 'yyyy-MM-dd')) : false
}

// Đẩy tới ngày làm việc đầu tiên >= date. Nếu date đã là ngày làm việc → giữ nguyên.
// guard 366 để tránh lặp vô hạn nếu holidaySet lỗi.
function rollForwardToWorkday(date, holidaySet) {
  let d = date
  let guard = 0
  while (isOffDay(d, holidaySet) && guard++ < 366) {
    d = addDays(d, 1)
  }
  return d
}

module.exports = { isOffDay, rollForwardToWorkday }
