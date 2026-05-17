-- Attendance module v2: overtime_requests + attendance_adjustments + public_holidays + seeds

CREATE TABLE overtime_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  ot_date         DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  ot_hours        NUMERIC(4,2) NOT NULL,
  ot_rate         NUMERIC(3,1) NOT NULL,
  reason          TEXT,
  status          request_status NOT NULL DEFAULT 'pending',
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMP,
  rejection_note  TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_or_user   ON overtime_requests(user_id);
CREATE INDEX idx_or_status ON overtime_requests(status);
CREATE INDEX idx_or_date   ON overtime_requests(ot_date);

-- Append-only audit trail for attendance record changes
CREATE TABLE attendance_adjustments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_record_id  UUID NOT NULL REFERENCES attendance_records(id),
  field_name            VARCHAR(80) NOT NULL,
  before_value          TEXT,
  after_value           TEXT,
  reason                TEXT NOT NULL,
  adjusted_by           UUID NOT NULL REFERENCES users(id),
  adjusted_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adj_record ON attendance_adjustments(attendance_record_id);
CREATE INDEX idx_adj_by     ON attendance_adjustments(adjusted_by);

REVOKE UPDATE, DELETE ON attendance_adjustments FROM PUBLIC;

-- Public holidays
CREATE TABLE public_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,
  ot_multiplier NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ph_date ON public_holidays(holiday_date);

-- Seed: Vietnam public holidays 2026
INSERT INTO public_holidays (holiday_date, name, ot_multiplier) VALUES
  ('2026-01-01', 'Tết Dương Lịch',                    3.0),
  ('2026-01-27', 'Tết Nguyên Đán (29 Tháng Chạp)',    3.0),
  ('2026-01-28', 'Tết Nguyên Đán (30 Tháng Chạp)',    3.0),
  ('2026-01-29', 'Tết Nguyên Đán (Mùng 1)',            3.0),
  ('2026-01-30', 'Tết Nguyên Đán (Mùng 2)',            3.0),
  ('2026-01-31', 'Tết Nguyên Đán (Mùng 3)',            3.0),
  ('2026-02-01', 'Tết Nguyên Đán (Mùng 4)',            3.0),
  ('2026-02-02', 'Tết Nguyên Đán (Mùng 5)',            3.0),
  ('2026-04-16', 'Giỗ Tổ Hùng Vương (10/3 AL)',        3.0),
  ('2026-04-30', 'Giải Phóng Miền Nam',                3.0),
  ('2026-05-01', 'Quốc Tế Lao Động',                   3.0),
  ('2026-09-02', 'Quốc Khánh',                         3.0),
  ('2026-09-03', 'Quốc Khánh (nghỉ bù)',               3.0)
ON CONFLICT (holiday_date) DO NOTHING;
