-- THƯỞNG / PHẠT nhân viên (GĐ1 — nhập tay). Danh mục dùng ENUM ĐỘNG (Settings → Danh mục),
-- KHÔNG hardcode: cột lưu VARCHAR (option_key), app validate qua lib/enums (getValues).

-- ① Enum động ─────────────────────────────────────────────────────────────────
INSERT INTO enum_types (type_key, label, description, is_editable) VALUES
  ('reward_penalty_kind',   N'Loại thưởng/phạt',        N'Phân loại: vi phạm hay thưởng',            true),
  ('reward_penalty_detect', N'Nguồn phát hiện',          N'Cách phát hiện: thủ công hay tự động rà',  false),
  ('reward_penalty_source', N'Nguồn ghi nhận',           N'Dòng do người ghi tay hay hệ thống sinh',   false),
  ('reward_penalty_status', N'Trạng thái duyệt',         N'Nháp (chờ duyệt) / đã duyệt',               false)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, o.k, o.l, o.s FROM enum_types et,
  (VALUES ('violation', N'Vi phạm', 0), ('reward', N'Thưởng', 1)) AS o(k, l, s)
WHERE et.type_key = 'reward_penalty_kind' ON CONFLICT (type_id, option_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, o.k, o.l, o.s FROM enum_types et,
  (VALUES ('manual', N'Thủ công', 0), ('auto_attendance', N'Tự động · Chấm công', 1),
          ('auto_task', N'Tự động · Công việc', 2), ('auto_checklist', N'Tự động · Checklist', 3)) AS o(k, l, s)
WHERE et.type_key = 'reward_penalty_detect' ON CONFLICT (type_id, option_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, o.k, o.l, o.s FROM enum_types et,
  (VALUES ('manual', N'Thủ công', 0), ('auto', N'Tự động', 1)) AS o(k, l, s)
WHERE et.type_key = 'reward_penalty_source' ON CONFLICT (type_id, option_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, o.k, o.l, o.s FROM enum_types et,
  (VALUES ('draft', N'Nháp — chờ duyệt', 0), ('approved', N'Đã duyệt', 1)) AS o(k, l, s)
WHERE et.type_key = 'reward_penalty_status' ON CONFLICT (type_id, option_key) DO NOTHING;

-- ② Bảng QUY TẮC (catalog) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(40) UNIQUE,
  label          VARCHAR(200) NOT NULL,
  kind           VARCHAR(40)  NOT NULL DEFAULT 'violation',   -- enum reward_penalty_kind
  default_points NUMERIC      NOT NULL DEFAULT 0,             -- âm = phạt, dương = thưởng
  default_amount NUMERIC,                                     -- tiền gợi ý (tùy chọn)
  detect_source  VARCHAR(40)  NOT NULL DEFAULT 'manual',      -- enum reward_penalty_detect
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ③ SỔ GHI (ledger) ───────────────────────────────────────────────────────────
-- kind/category_label ĐÓNG BĂNG lúc ghi (đổi quy tắc sau không ảnh hưởng dòng cũ).
-- Kỳ = period_year/period_month (suy từ occurred_on) → payroll đọc theo tháng, không FK cứng.
CREATE TABLE IF NOT EXISTS staff_reward_penalty (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_year    SMALLINT NOT NULL,
  period_month   SMALLINT NOT NULL,
  occurred_on    DATE NOT NULL,
  rule_id        UUID REFERENCES kpi_rules(id) ON DELETE SET NULL,
  kind           VARCHAR(40)  NOT NULL,                       -- enum reward_penalty_kind (đóng băng)
  category_label VARCHAR(200) NOT NULL,                       -- nhãn danh mục lúc ghi (đóng băng)
  points         NUMERIC      NOT NULL DEFAULT 0,
  amount         NUMERIC,
  note           TEXT,
  source         VARCHAR(40)  NOT NULL DEFAULT 'manual',      -- enum reward_penalty_source
  status         VARCHAR(40)  NOT NULL DEFAULT 'approved',    -- enum reward_penalty_status
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_srp_user_period ON staff_reward_penalty (user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_srp_period      ON staff_reward_penalty (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_srp_status      ON staff_reward_penalty (status);
