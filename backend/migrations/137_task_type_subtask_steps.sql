-- Checklist RIÊNG cho từng việc con định kỳ (mỗi việc con là task thật → có checklist của nó).
-- Khi sinh định kỳ, các bước này được copy vào checklist của task con tương ứng.
CREATE TABLE IF NOT EXISTS task_type_subtask_steps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_template_id UUID NOT NULL REFERENCES task_type_subtask_templates(id) ON DELETE CASCADE,
  step_order          INTEGER NOT NULL,
  step_text           VARCHAR(300) NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ttss_subtask ON task_type_subtask_steps(subtask_template_id);
