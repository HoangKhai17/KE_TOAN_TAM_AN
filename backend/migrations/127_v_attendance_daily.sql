-- GĐ2 Nhóm B — Một nguồn duy nhất cho mọi báo cáo chấm công.
--
-- Gộp sẵn: loại nghỉ gốc (qua FK), thời lượng nghỉ, và giờ OT đã duyệt.
-- OT đặc biệt đáng chú ý: trước đây getAttendanceSummary đọc SUM(ar.ot_hours) còn
-- getMonthlyReport đọc overtime_requests → hai màn hình có thể ra hai số OT khác nhau.
-- View này chốt một nguồn: overtime_requests đã duyệt.

CREATE OR REPLACE VIEW v_attendance_daily AS
SELECT
  ar.id,
  ar.user_id,
  ar.work_date,
  ar.shift_id,
  ar.status,
  ar.check_in_time,
  ar.check_out_time,
  ar.actual_hours,
  ar.late_minutes,
  ar.early_minutes,
  ar.is_adjusted,
  ar.is_holiday,
  ar.notes,

  ar.work_units,
  ar.paid_leave_units,
  ar.unpaid_leave_units,
  ar.payable_units,

  ar.leave_request_id,
  lr.leave_type,
  lr.day_part,
  p.label          AS leave_label,
  p.counts_as_work AS leave_counts_as_work,

  COALESCE(ot.approved_ot, 0) AS ot_hours
FROM attendance_records ar
LEFT JOIN leave_requests lr ON lr.id = ar.leave_request_id
LEFT JOIN leave_policies p  ON p.leave_type = lr.leave_type
LEFT JOIN (
  SELECT user_id, ot_date, SUM(ot_hours) AS approved_ot
  FROM overtime_requests
  WHERE status = 'approved'
  GROUP BY user_id, ot_date
) ot ON ot.user_id = ar.user_id AND ot.ot_date = ar.work_date;

COMMENT ON VIEW v_attendance_daily IS
  'Nguồn DUY NHẤT cho báo cáo chấm công. Dùng payable_units để tính công hưởng lương; KHÔNG dùng status làm nguồn tính công.';
