CREATE TABLE task_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_links_task_id ON task_links(task_id);
