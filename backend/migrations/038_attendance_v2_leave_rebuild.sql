-- Attendance module v2: rebuild leave_requests with new schema
-- Drop old tables in dependency order (attendance_records references leave_requests in new schema)
DROP TABLE IF EXISTS attendance_records CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;

CREATE TABLE leave_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  leave_type      leave_type NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_days      NUMERIC(4,1) NOT NULL,
  reason          TEXT,
  status          request_status NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMP,
  rejection_note  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

  CHECK (end_date >= start_date)
);

CREATE INDEX idx_lr_user   ON leave_requests(user_id);
CREATE INDEX idx_lr_status ON leave_requests(status);
CREATE INDEX idx_lr_dates  ON leave_requests(start_date, end_date);
