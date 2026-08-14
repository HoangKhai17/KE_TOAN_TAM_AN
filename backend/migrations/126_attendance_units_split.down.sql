-- Gộp ngược 3 cột về lại một work_units.
-- LƯU Ý: chỉ khôi phục đúng khi mọi paid_rate = 1.0. Nếu có loại nghỉ hưởng < 100%
-- (vd sick 0.75) thì phép nhân đã mất thông tin gốc — phải phục hồi từ bản dump.

ALTER TABLE attendance_records
  DROP CONSTRAINT IF EXISTS chk_ar_units_cap;

DROP INDEX IF EXISTS idx_ar_payable;

ALTER TABLE attendance_records
  DROP COLUMN IF EXISTS payable_units;

UPDATE attendance_records
   SET work_units = work_units + paid_leave_units + unpaid_leave_units
 WHERE paid_leave_units > 0 OR unpaid_leave_units > 0;

ALTER TABLE attendance_records
  DROP COLUMN IF EXISTS paid_leave_units,
  DROP COLUMN IF EXISTS unpaid_leave_units;

ALTER TABLE attendance_records
  ALTER COLUMN work_units TYPE NUMERIC(3,1);
