CREATE TABLE scheduler_run_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by         VARCHAR(10)  NOT NULL DEFAULT 'auto',   -- 'auto' | 'manual'
  triggered_by_user_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  started_at           TIMESTAMP    NOT NULL,
  finished_at          TIMESTAMP,
  generated            INTEGER      NOT NULL DEFAULT 0,
  skipped              INTEGER      NOT NULL DEFAULT 0,
  errors               INTEGER      NOT NULL DEFAULT 0,
  duration_ms          INTEGER,
  tasks_created        JSONB        NOT NULL DEFAULT '[]',
  error_message        TEXT,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX scheduler_run_logs_started_at_idx ON scheduler_run_logs (started_at DESC);
