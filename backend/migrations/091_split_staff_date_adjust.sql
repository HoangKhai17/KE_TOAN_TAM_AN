-- Sửa: quyền chỉnh ngày của nhân viên phải tính RIÊNG cho từng ngày.
-- Cờ chung (090) làm chỉnh 1 ngày lại khoá luôn ngày kia → tách thành 2 cờ độc lập.
--   staff_start_adjusted_at : đã dùng lượt chỉnh NGÀY BẮT ĐẦU
--   staff_due_adjusted_at   : đã dùng lượt chỉnh NGÀY HẾT HẠN
-- Cờ cũ bị bỏ (không xác định được nó ứng với ngày nào) → mọi task được cấp lại
-- lượt cho từng ngày. An toàn vì tính năng chưa phát hành.
ALTER TABLE tasks DROP COLUMN IF EXISTS staff_dates_adjusted_at;

ALTER TABLE tasks
  ADD COLUMN staff_start_adjusted_at TIMESTAMP,
  ADD COLUMN staff_due_adjusted_at   TIMESTAMP;
