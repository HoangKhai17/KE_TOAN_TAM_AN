CREATE TABLE tasks (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                     VARCHAR(300) NOT NULL,
  description               TEXT,
  company_id                UUID NOT NULL REFERENCES companies(id),
  task_type_id              UUID REFERENCES task_types(id) ON DELETE SET NULL,
  customer_task_schedule_id UUID REFERENCES customer_task_schedules(id) ON DELETE SET NULL,
  assigned_to               UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_by               UUID REFERENCES users(id) ON DELETE SET NULL,
  status                    task_status NOT NULL DEFAULT 'pending',
  priority                  task_priority NOT NULL DEFAULT 'medium',
  source                    task_source NOT NULL DEFAULT 'manual',
  due_date                  DATE,
  period_label              VARCHAR(20),
  completed_at              TIMESTAMP,
  on_hold_reason            TEXT,
  sla_days                  INTEGER,
  actual_hours              NUMERIC(6,2),
  created_by                UUID NOT NULL REFERENCES users(id),
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_company      ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to  ON tasks(assigned_to);
CREATE INDEX idx_tasks_status       ON tasks(status);
CREATE INDEX idx_tasks_due_date     ON tasks(due_date);
CREATE INDEX idx_tasks_source       ON tasks(source);
CREATE INDEX idx_tasks_period       ON tasks(period_label);
CREATE INDEX idx_tasks_schedule     ON tasks(customer_task_schedule_id);
CREATE INDEX idx_tasks_staff_status ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_overdue      ON tasks(due_date, status)
  WHERE status NOT IN ('completed') AND due_date IS NOT NULL;
CREATE INDEX idx_tasks_fts          ON tasks
  USING gin(to_tsvector('simple', title || ' ' || coalesce(description, '')));
