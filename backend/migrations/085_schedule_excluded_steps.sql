-- Phương án A: mỗi lịch định kỳ (theo công ty + loại CV) chọn TẬP CON bước checklist mẫu.
-- excluded_step_ids = mảng id bước (task_type_checklist_templates.id) KHÔNG áp dụng cho công ty này.
-- Rỗng '[]' = dùng ĐỦ mẫu → tương thích ngược với lịch cũ.
ALTER TABLE customer_task_schedules
  ADD COLUMN IF NOT EXISTS excluded_step_ids JSONB NOT NULL DEFAULT '[]';
