CREATE TABLE task_dependencies (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_by         UUID NOT NULL REFERENCES users(id),
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX idx_td_task_id    ON task_dependencies(task_id);
CREATE INDEX idx_td_depends_on ON task_dependencies(depends_on_task_id);
