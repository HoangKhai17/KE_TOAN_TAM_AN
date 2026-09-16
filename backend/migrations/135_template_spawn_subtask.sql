-- Việc cha–con theo ĐỊNH KỲ: cho phép một bước trong checklist mẫu tự sinh thành VIỆC CON
-- (task độc lập, có hạn riêng) thay vì chỉ là mục checklist của việc cha.
--   • spawn_as_subtask = true → bước này đẻ ra một việc con khi sinh định kỳ (KHÔNG vào checklist cha).
--   • due_offset_days          → hạn việc con = ngày kỳ + offset (đẩy qua CN/lễ như task thường).
--   • depends_on_prev = true   → tự nối phụ thuộc với việc con liền trước trong chuỗi.
ALTER TABLE task_type_checklist_templates
  ADD COLUMN IF NOT EXISTS spawn_as_subtask BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS due_offset_days  INTEGER,
  ADD COLUMN IF NOT EXISTS depends_on_prev  BOOLEAN NOT NULL DEFAULT FALSE;
