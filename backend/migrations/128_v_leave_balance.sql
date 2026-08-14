-- GĐ2 Nhóm C — Quỹ phép năm.
--
-- users.annual_leave_days đã tồn tại từ migration 036 (mặc định 12.0) nhưng là CỘT
-- CHẾT: grep toàn repo không có dòng code nào đọc nó. Nhân viên xin bao nhiêu ngày
-- phép năm cũng được duyệt, không có gì trừ và không có gì chặn.
--
-- View này gộp: hạn mức của từng người × từng năm, số đã dùng (chỉ tính loại nghỉ
-- có deduct_balance = TRUE, và chỉ đơn ĐÃ DUYỆT), và số còn lại.
--
-- total_days của đơn đã tính sẵn hệ số nửa ngày (0.5) nên trừ quỹ đúng theo thời lượng.

CREATE OR REPLACE VIEW v_leave_balance AS
WITH years AS (
  -- Mọi năm có phát sinh đơn, cộng thêm năm hiện tại để người chưa nghỉ vẫn có dòng
  SELECT DISTINCT EXTRACT(YEAR FROM start_date)::int AS yr FROM leave_requests
  UNION
  SELECT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
SELECT
  u.id                          AS user_id,
  u.name                        AS user_name,
  y.yr                          AS year,
  u.annual_leave_days           AS entitled_days,
  COALESCE(used.days, 0)        AS used_days,
  u.annual_leave_days - COALESCE(used.days, 0) AS remaining_days
FROM users u
CROSS JOIN years y
LEFT JOIN LATERAL (
  SELECT SUM(lr.total_days) AS days
  FROM leave_requests lr
  JOIN leave_policies p ON p.leave_type = lr.leave_type AND p.deduct_balance
  WHERE lr.user_id = u.id
    AND lr.status  = 'approved'
    AND EXTRACT(YEAR FROM lr.start_date)::int = y.yr
) used ON TRUE
WHERE u.status IN ('active', 'on_leave');

COMMENT ON VIEW v_leave_balance IS
  'Quỹ phép năm: hạn mức users.annual_leave_days trừ đi tổng total_days của các đơn đã duyệt thuộc loại nghỉ có deduct_balance.';
