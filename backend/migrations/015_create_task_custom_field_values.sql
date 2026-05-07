CREATE TABLE task_custom_field_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_schema_id UUID NOT NULL REFERENCES task_type_custom_field_schemas(id) ON DELETE CASCADE,
  value_text      TEXT,
  value_number    NUMERIC,
  value_date      DATE,
  value_boolean   BOOLEAN,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_id, field_schema_id)
);

CREATE INDEX idx_tcfv_task  ON task_custom_field_values(task_id);
CREATE INDEX idx_tcfv_field ON task_custom_field_values(field_schema_id);
