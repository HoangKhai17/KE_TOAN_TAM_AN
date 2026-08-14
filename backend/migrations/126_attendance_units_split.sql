-- GĐ2 Nhóm B — Tách một cột work_units thành BA nguồn công độc lập.
--
-- Vấn đề gốc: mỗi ngày chỉ có MỘT cột work_units và MỘT status, nên không thể biểu
-- diễn "0.5 công làm việc + 0.5 ngày nghỉ", và không phân biệt được nghỉ có lương với
-- nghỉ không lương (GĐ1 phải JOIN ngược leave_requests để đoán lại).
--
-- Sau migration này:
--   work_units          = công THỰC TẾ từ check-in/check-out
--   paid_leave_units    = phần nghỉ CÓ hưởng lương (đã nhân paid_rate)
--   unpaid_leave_units  = phần nghỉ KHÔNG hưởng lương
--   payable_units       = GENERATED, luôn = work_units + paid_leave_units
--
-- status từ đây chỉ còn là NHÃN HIỂN THỊ, không còn là nguồn tính công.

-- ── 1. Nới kiểu số ───────────────────────────────────────────────────────────
-- NUMERIC(4,3) chứ không phải (3,1): paid_rate 0.75 × nửa ngày = 0.375.
-- Kiểu cũ làm tròn thành 0.4 và sai âm thầm, không có cảnh báo nào.
ALTER TABLE attendance_records
  ALTER COLUMN work_units TYPE NUMERIC(4,3);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS paid_leave_units   NUMERIC(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_leave_units NUMERIC(4,3) NOT NULL DEFAULT 0;

-- ── 2. BACKFILL — phải chạy TRƯỚC khi thêm CHECK ─────────────────────────────
-- Dữ liệu cũ đang để work_units = 1.0 trên mọi ngày nghỉ; nếu thêm CHECK trước thì
-- ràng buộc vẫn qua (1.0 <= 1.0) nhưng ngữ nghĩa sai và các cột mới đều bằng 0.

-- 2a. Ngày gắn đơn nghỉ THẬT SỰ LÀ NGHỈ (không phải wfh/công tác):
--     chuyển toàn bộ work_units sang cột nghỉ tương ứng theo chính sách.
UPDATE attendance_records ar
   SET work_units         = 0,
       paid_leave_units   = CASE WHEN p.is_paid THEN ROUND(ar.work_units * p.paid_rate, 3) ELSE 0 END,
       unpaid_leave_units = CASE WHEN p.is_paid THEN 0 ELSE ar.work_units END,
       updated_at         = NOW()
  FROM leave_requests lr
  JOIN leave_policies p ON p.leave_type = lr.leave_type
 WHERE ar.leave_request_id = lr.id
   AND p.counts_as_work = FALSE;

-- 2b. wfh / business_trip (counts_as_work = TRUE) GIỮ NGUYÊN work_units
--     → tự động chuyển từ "nghỉ có lương" sang "công thực tế", đúng bản chất.

-- 2c. Ngày lễ: là nghỉ hưởng lương, không phải công thực tế.
UPDATE attendance_records
   SET work_units = 0, paid_leave_units = 1.0, updated_at = NOW()
 WHERE status = 'holiday';

-- 2d. Ngày status nghỉ nhưng KHÔNG có FK về đơn (dữ liệu mồ côi do lỗi ghi đè cũ):
--     không phân loại được → xếp vào nghỉ CÓ lương, giữ nguyên cách hiểu trước đây.
--     Kiểm tra số lượng trước khi chạy migration:
--       SELECT COUNT(*) FROM attendance_records
--        WHERE status IN ('on_leave') AND leave_request_id IS NULL;
UPDATE attendance_records
   SET work_units = 0, paid_leave_units = work_units, updated_at = NOW()
 WHERE status = 'on_leave'
   AND leave_request_id IS NULL
   AND work_units > 0;

-- ── 3. Cột dẫn xuất + ràng buộc trần ─────────────────────────────────────────
-- GENERATED: không thể ghi sai, không thể quên cập nhật. Đây là cột DUY NHẤT mà
-- báo cáo và bảng lương được phép đọc để tính công hưởng lương.
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS payable_units NUMERIC(5,3)
    GENERATED ALWAYS AS (work_units + paid_leave_units) STORED;

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS chk_ar_units_cap,
  ADD  CONSTRAINT chk_ar_units_cap
       CHECK (work_units + paid_leave_units + unpaid_leave_units <= 1.0);

CREATE INDEX IF NOT EXISTS idx_ar_payable ON attendance_records(work_date, payable_units);
