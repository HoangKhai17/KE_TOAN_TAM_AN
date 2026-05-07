CREATE TABLE task_types (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(200) NOT NULL,
  group_name       VARCHAR(100),
  description      TEXT,
  default_sla_days INTEGER NOT NULL DEFAULT 7,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_types_group     ON task_types(group_name);
CREATE INDEX idx_task_types_is_active ON task_types(is_active);
