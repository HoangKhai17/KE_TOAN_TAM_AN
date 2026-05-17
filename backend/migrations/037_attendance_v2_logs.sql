-- Attendance module v2: raw check-in/out log (append-only)

CREATE TABLE IF NOT EXISTS attendance_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  log_type    attendance_log_type NOT NULL,
  logged_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  method      checkin_method NOT NULL DEFAULT 'web',
  device_info VARCHAR(200),
  ip_address  INET,
  notes       TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_al_user_date ON attendance_logs(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_al_logged_at ON attendance_logs(logged_at DESC);

REVOKE DELETE ON attendance_logs FROM PUBLIC;
