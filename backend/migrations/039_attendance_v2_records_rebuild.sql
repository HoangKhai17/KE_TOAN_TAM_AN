-- Attendance module v2: attendance_records with full schema (FK → leave_requests)

CREATE TABLE attendance_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  work_date        DATE NOT NULL,
  shift_id         UUID REFERENCES shifts(id) ON DELETE SET NULL,

  check_in_time    TIMESTAMP,
  check_out_time   TIMESTAMP,
  actual_hours     NUMERIC(4,2),

  late_minutes     INTEGER NOT NULL DEFAULT 0,
  early_minutes    INTEGER NOT NULL DEFAULT 0,

  work_units       NUMERIC(3,1) NOT NULL DEFAULT 0.0,
  status           attendance_status NOT NULL DEFAULT 'absent',

  is_adjusted      BOOLEAN NOT NULL DEFAULT FALSE,
  is_holiday       BOOLEAN NOT NULL DEFAULT FALSE,
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
  ot_hours         NUMERIC(4,2) NOT NULL DEFAULT 0,
  notes            TEXT,

  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX idx_ar_user_date ON attendance_records(user_id, work_date);
CREATE INDEX idx_ar_date      ON attendance_records(work_date);
CREATE INDEX idx_ar_status    ON attendance_records(status);
CREATE INDEX idx_ar_period    ON attendance_records(work_date, user_id)
  WHERE status NOT IN ('holiday');
