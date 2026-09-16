-- Việc con định kỳ (tách RIÊNG khỏi checklist mẫu — đúng logic Tasks: cha có checklist
-- + có chuỗi việc con độc lập). Mỗi dòng = một việc con sẽ được sinh khi tạo định kỳ.
--   title           : tiêu đề việc con
--   due_offset_days : hạn việc con = ngày kỳ + offset (đẩy qua CN/lễ khi sinh)
-- (KHÔNG có "phụ thuộc bước trước" — theo yêu cầu.)
CREATE TABLE IF NOT EXISTS task_type_subtask_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id    UUID NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  title           VARCHAR(300) NOT NULL,
  due_offset_days INTEGER,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ttst_task_type ON task_type_subtask_templates(task_type_id);
