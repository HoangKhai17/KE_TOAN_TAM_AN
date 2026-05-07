CREATE TABLE task_activity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  meta       JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tal_task    ON task_activity_logs(task_id);
CREATE INDEX idx_tal_created ON task_activity_logs(created_at DESC);
