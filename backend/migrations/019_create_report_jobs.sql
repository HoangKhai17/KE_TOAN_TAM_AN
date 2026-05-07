CREATE TABLE report_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES users(id),
  report_type  report_type_enum NOT NULL,
  params       JSONB NOT NULL DEFAULT '{}',
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  file_url     TEXT,
  file_type    VARCHAR(10),
  error_msg    TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_rj_created_by ON report_jobs(created_by);
CREATE INDEX idx_rj_created_at ON report_jobs(created_at DESC);
