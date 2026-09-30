-- Bỏ SLA (ước lượng thời gian hoàn thành) khỏi lịch định kỳ — cột không còn dùng.
-- Giai đoạn 1: phần tạo lịch tự động. (SLA ở task_types/tasks xử lý ở giai đoạn sau.)
ALTER TABLE customer_task_schedules DROP COLUMN IF EXISTS override_sla_days;
