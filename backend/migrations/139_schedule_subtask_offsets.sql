-- Offset (ngày bắt đầu + hạn) của TỪNG việc con LIÊN KẾT, đặt theo TỪNG LỊCH của công ty.
-- Nguồn thật khi bộ lịch sinh việc con định kỳ (thay cho việc đọc thẳng due_offset_days ở template).
-- Cấu trúc: { "<subtask_template_id>": { "start": <int>, "deadline": <int> }, ... }
--   start/deadline = số ngày kể từ NGÀY KỲ (occurrence = ngày bắt đầu việc cha), rồi đẩy CN/lễ.
-- Thiếu key nào thì generator lấy mặc định (start 0, deadline = due_offset_days của template ?? 0).
ALTER TABLE customer_task_schedules
  ADD COLUMN IF NOT EXISTS subtask_offsets JSONB NOT NULL DEFAULT '{}';
