-- Attendance module v2: shifts + users alter + work_schedules

CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  shift_type      shift_type NOT NULL DEFAULT 'fixed',
  start_time      TIME,
  end_time        TIME,
  break_minutes   INTEGER NOT NULL DEFAULT 60,
  required_hours  NUMERIC(4,2),
  tolerance_in    INTEGER NOT NULL DEFAULT 15,
  tolerance_out   INTEGER NOT NULL DEFAULT 15,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(4,1) NOT NULL DEFAULT 12.0;

CREATE TABLE IF NOT EXISTS work_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date   DATE NOT NULL,
  shift_id    UUID REFERENCES shifts(id) ON DELETE SET NULL,
  is_day_off  BOOLEAN NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_ws_user_date ON work_schedules(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_ws_date      ON work_schedules(work_date);
CREATE INDEX IF NOT EXISTS idx_ws_shift     ON work_schedules(shift_id);

-- Seed default shift (only if admin user exists)
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM users WHERE role = 'admin' LIMIT 1;
  IF admin_id IS NOT NULL THEN
    INSERT INTO shifts (name, shift_type, start_time, end_time, break_minutes, tolerance_in, tolerance_out, created_by)
    SELECT 'Ca Hành Chính', 'fixed', '08:00:00', '17:00:00', 60, 15, 15, admin_id
    WHERE NOT EXISTS (SELECT 1 FROM shifts WHERE name = 'Ca Hành Chính');
  END IF;
END $$;
