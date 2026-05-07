CREATE TABLE task_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  step_order   INTEGER NOT NULL,
  step_text    TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, step_order)
);

CREATE INDEX idx_checklist_task ON task_checklist_items(task_id);
