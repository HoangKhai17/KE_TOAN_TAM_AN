CREATE TABLE task_type_checklist_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id UUID NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  step_text    VARCHAR(300) NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_type_id, step_order)
);

CREATE INDEX idx_tclt_task_type ON task_type_checklist_templates(task_type_id);
