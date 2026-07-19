'use strict'
/**
 * NHÃN KỲ của công việc tự sinh — phần "[…]" ở đầu tiêu đề.
 *
 * Tiêu đề task tự sinh có dạng:  [Kỳ] Tên mẫu công việc
 *
 * ══ VÌ SAO CẦN ĐỘ LỆCH KỲ (period_offset) ══
 * Ngày làm việc và kỳ nghiệp vụ KHÔNG phải lúc nào cũng trùng nhau. Ví dụ điển
 * hình: bảng lương THÁNG 6 nhưng làm trong THÁNG 7. Task sinh ngày 08/07 nên
 * ngày bắt đầu / hạn chót nằm ở tháng 7 (đúng), nhưng nhãn kỳ phải là T06/2026.
 *
 * Ngược lại, nhiều lịch khác thì kỳ trùng ngày làm (cập nhật dữ liệu tháng 7 làm
 * trong tháng 7) nên KHÔNG được lệch.
 *
 * `period_offset` khai báo trong `recurrence_config` của TỪNG LỊCH của TỪNG CÔNG TY:
 *    0 (hoặc không khai báo) → giữ nguyên, mặc định
 *   -1 → lùi 1 chu kỳ   ·   +1 → tiến 1 chu kỳ
 *
 * Đơn vị lệch khớp ĐỘ MỊN CỦA NHÃN chứ không phải chu kỳ lặp: nhãn theo ngày
 * thì lệch theo ngày; nhãn theo tháng (kể cả lịch HÀNG TUẦN) thì lệch theo tháng;
 * quý→quý; năm→năm.
 *
 * ══ LƯU Ý QUAN TRỌNG ══
 * Nhãn kỳ đồng thời là KHOÁ CHỐNG TRÙNG của bộ sinh task (cặp
 * schedule_id + period_label). Đổi độ lệch → nhãn đổi → lần chạy sau sinh task
 * MỚI thay vì bỏ qua. Task cũ giữ nguyên nhãn cũ, không bị đụng.
 */

// Dịch ngày đi `offset` chu kỳ, đơn vị tuỳ loại lịch
function dichChuKy(date, recurrenceType, offset) {
  const d = new Date(date)
  if (!offset) return d

  switch (recurrenceType) {
    case 'daily':
      d.setDate(d.getDate() + offset)
      break
    case 'quarterly':
      d.setMonth(d.getMonth() + offset * 3)
      break
    case 'yearly':
      d.setFullYear(d.getFullYear() + offset)
      break
    // weekly | monthly_* | custom_dates | once → dịch theo THÁNG.
    // Đơn vị lệch phải khớp với ĐỘ MỊN CỦA NHÃN, không phải chu kỳ lặp: nhãn của
    // lịch hàng tuần là 'Tmm/yyyy' (theo tháng), nên lệch 1 tuần hầu như không
    // đổi nhãn — gây hiểu nhầm. Lệch theo tháng mới có tác dụng thật.
    default:
      // setMonth tự xử lý tràn năm. Đặt về ngày 1 trước khi dịch để tránh
      // trường hợp 31/03 lùi 1 tháng thành 03/03 (vì tháng 2 không có ngày 31).
      d.setDate(1)
      d.setMonth(d.getMonth() + offset)
      break
  }
  return d
}

// Định dạng nhãn theo loại lịch — giữ nguyên quy ước đang dùng trong dữ liệu thật.
// KHÔNG được đổi định dạng: nhãn cũ đã nằm trong CSDL và là khoá chống trùng.
function dinhDangNhan(recurrenceType, d) {
  const ngay  = String(d.getDate()).padStart(2, '0')
  const thang = d.getMonth() + 1
  const nam   = d.getFullYear()
  const T     = `T${String(thang).padStart(2, '0')}/${nam}`

  switch (recurrenceType) {
    case 'daily':
      return `${ngay}/${String(thang).padStart(2, '0')}/${nam}`
    case 'weekly':
    case 'monthly_by_date':
    case 'monthly_by_weekday':
    case 'monthly_last_day':
      return T
    case 'quarterly':
      return `Q${Math.ceil(thang / 3)}/${nam}`
    case 'yearly':
      return `${nam}`
    case 'custom_dates':
    case 'once':
      // Lịch chạy một lần / ngày chỉ định: mốc là NGÀY cụ thể nên ghi rõ ngày
      return `${ngay}/${String(thang).padStart(2, '0')}/${nam}`
    default:
      return `${String(thang).padStart(2, '0')}/${nam}`
  }
}

/**
 * @param {string} recurrenceType  loại lịch lặp
 * @param {Date|string} occurrenceDate  ngày phát sinh thực tế của task
 * @param {number} [periodOffset=0]  số chu kỳ lệch, âm = lùi, dương = tiến
 * @returns {string} nhãn kỳ, ví dụ 'T06/2026'
 */
function buildPeriodLabel(recurrenceType, occurrenceDate, periodOffset = 0) {
  const off = Number.isFinite(Number(periodOffset)) ? Math.trunc(Number(periodOffset)) : 0
  return dinhDangNhan(recurrenceType, dichChuKy(occurrenceDate, recurrenceType, off))
}

// Đọc độ lệch từ recurrence_config, chấp nhận thiếu / hỏng → 0
function docPeriodOffset(recurrenceConfig) {
  const v = recurrenceConfig?.period_offset
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

// Nhãn mô tả cho giao diện / báo cáo
function moTaOffset(recurrenceType, offset) {
  if (!offset) return 'Cùng kỳ'
  const donVi = {
    daily: 'ngày', quarterly: 'quý', yearly: 'năm',
  }[recurrenceType] || 'tháng'
  return offset < 0 ? `Lùi ${Math.abs(offset)} ${donVi}` : `Tiến ${offset} ${donVi}`
}

module.exports = { buildPeriodLabel, docPeriodOffset, moTaOffset }
