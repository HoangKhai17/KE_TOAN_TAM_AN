-- LUỒNG 2 (sửa lại) — Trần "ngày N hàng tháng" theo TỪNG LỊCH định kỳ.
--
-- Bản trước (migration 108) đặt trần ở cấp CÔNG TY dạng ngày tuyệt đối → SAI logic.
-- Đúng: trần theo từng lịch định kỳ (mỗi loại công việc khác nhau), giá trị là
-- SỐ NGÀY TRONG THÁNG (1–31) lặp lại hàng tháng. NULL = không giới hạn.
ALTER TABLE companies DROP COLUMN IF EXISTS max_task_due_date;
ALTER TABLE customer_task_schedules
  ADD COLUMN max_due_day SMALLINT CHECK (max_due_day BETWEEN 1 AND 31);
