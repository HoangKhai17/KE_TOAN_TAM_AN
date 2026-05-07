CREATE TABLE customer_task_schedules (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_type_id         UUID NOT NULL REFERENCES task_types(id),
  assigned_staff_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  recurrence_type      recurrence_type NOT NULL,
  recurrence_config    JSONB NOT NULL DEFAULT '{}',
  deadline_offset_days INTEGER NOT NULL DEFAULT 0,
  override_sla_days    INTEGER,
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at    TIMESTAMP,
  created_by           UUID NOT NULL REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cts_company   ON customer_task_schedules(company_id);
CREATE INDEX idx_cts_task_type ON customer_task_schedules(task_type_id);
CREATE INDEX idx_cts_is_active ON customer_task_schedules(is_active);
