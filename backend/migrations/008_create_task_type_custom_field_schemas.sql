CREATE TABLE task_type_custom_field_schemas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type_id  UUID NOT NULL REFERENCES task_types(id) ON DELETE CASCADE,
  field_key     VARCHAR(80) NOT NULL,
  label         VARCHAR(150) NOT NULL,
  data_type     field_data_type NOT NULL,
  options       JSONB,
  is_required   BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (task_type_id, field_key)
);

CREATE INDEX idx_ttcfs_task_type ON task_type_custom_field_schemas(task_type_id);
