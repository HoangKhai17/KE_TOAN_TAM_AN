CREATE TABLE attendance_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date    DATE NOT NULL,
  check_in     TIME,
  check_out    TIME,
  status       VARCHAR(20) NOT NULL DEFAULT 'present'
               CHECK (status IN ('present', 'absent', 'late', 'half_day', 'holiday', 'remote')),
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ,
  UNIQUE(user_id, work_date)
);

CREATE INDEX idx_attendance_records_user_id   ON attendance_records(user_id);
CREATE INDEX idx_attendance_records_work_date ON attendance_records(work_date);
CREATE INDEX idx_attendance_records_status    ON attendance_records(status);
