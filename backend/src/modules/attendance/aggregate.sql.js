// Mảnh SQL dùng chung cho MỌI chỗ tổng hợp ngày công theo kỳ.
//
// Trước đây cùng một biểu thức FILTER bị copy ở 4 nơi (getAttendanceSummary,
// sendAttendanceConfirmation, getMonthlyReport, syncAttendanceToPayroll) → sửa
// chính sách một chỗ là sót ba chỗ. Toàn bộ tổng hợp nay lấy từ đây.
//
// GĐ2: dữ liệu công đã được tách thành 3 cột độc lập trên attendance_records
// (work_units / paid_leave_units / unpaid_leave_units) + payable_units GENERATED.
// Không còn phải suy ngược loại nghỉ từ `status` hay JOIN leave_requests để đoán —
// chỉ cộng thẳng các cột. `status` từ đây chỉ dùng để ĐẾM SỰ KIỆN (vắng, trễ, sớm),
// không bao giờ dùng để tính công.

const { query } = require('../../config/db')

const STRICT_UNPAID_KEY = 'attendance.strict_unpaid_from'

// View gộp sẵn loại nghỉ + OT đã duyệt (migration 127). Truy vấn phải alias là `ar`.
const DAILY_VIEW = 'v_attendance_daily'

/**
 * Bộ cột tổng hợp chuẩn. Truy vấn gọi phải alias bảng/view là `ar`.
 *
 * @param {string|null} cutoffParam  placeholder mốc ngày (vd '$3') cho quy tắc
 *   nghỉ-không-lương, hoặc null nếu chỗ gọi không cần mốc. Giá trị NULL của tham số
 *   = áp dụng toàn bộ lịch sử; một ngày = chỉ áp dụng từ ngày đó trở đi.
 *
 * Trước mốc, nghỉ không lương vẫn được tính như nghỉ có lương (giữ nguyên số liệu
 * lịch sử đã chốt lương). Từ mốc trở đi thì tách đúng.
 */
function summaryColumns(cutoffParam = null) {
  // Phần nghỉ không lương được "ân xá" vì nằm trước mốc áp dụng
  const graced = cutoffParam
    ? `CASE WHEN ${cutoffParam}::date IS NOT NULL AND ar.work_date < ${cutoffParam}::date
            THEN ar.unpaid_leave_units ELSE 0 END`
    : '0'

  return `
    COALESCE(SUM(ar.work_units), 0)                       AS actual_work_days,
    COALESCE(SUM(ar.paid_leave_units + ${graced}), 0)     AS leave_paid_days,
    COALESCE(SUM(ar.unpaid_leave_units - ${graced}), 0)   AS unpaid_leave_days,
    COALESCE(SUM(ar.payable_units + ${graced}), 0)        AS payable_days,

    COUNT(*) FILTER (WHERE ar.status = 'absent')                          AS absent_days,
    COUNT(*) FILTER (WHERE ar.status IN ('late','late_and_early'))        AS late_count,
    COUNT(*) FILTER (WHERE ar.status IN ('early_leave','late_and_early')) AS early_count,
    COALESCE(SUM(ar.ot_hours), 0)                                         AS total_ot_hours`
}

/**
 * Đọc mốc áp dụng quy tắc nghỉ-không-lương.
 * Trả null khi chưa cấu hình hoặc để trống → áp dụng cho toàn bộ lịch sử.
 */
async function getStrictUnpaidFrom() {
  const { rows } = await query(
    `SELECT value FROM system_configs WHERE key = $1`,
    [STRICT_UNPAID_KEY]
  )
  const v = (rows[0]?.value ?? '').trim()
  return v === '' ? null : v
}

module.exports = {
  STRICT_UNPAID_KEY,
  DAILY_VIEW,
  summaryColumns,
  getStrictUnpaidFrom,
}
