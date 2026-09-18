-- Hồ sơ lương nhân viên theo MỐC HIỆU LỰC (mỗi lần tăng/giảm = 1 phiên bản).
-- Làm bảng lương chỉ tham chiếu mức hiệu lực đúng kỳ. BH/PIT nhập tay số tiền/người.
CREATE TABLE IF NOT EXISTS employee_salaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL,
  base_salary     NUMERIC(15,0) NOT NULL DEFAULT 0,
  allowance_items JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, project, amount, note}]
  bhxh_employee   NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhyt_employee   NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhtn_employee   NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhxh_employer   NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhyt_employer   NUMERIC(15,0) NOT NULL DEFAULT 0,
  bhtn_employer   NUMERIC(15,0) NOT NULL DEFAULT 0,
  pit_deduction   NUMERIC(15,0) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(15,0) NOT NULL DEFAULT 0,
  change_type     VARCHAR(30) NOT NULL DEFAULT 'initial', -- enum salary_change_type
  reason          TEXT,
  note            TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_salary_user_eff ON employee_salaries (user_id, effective_from DESC);

-- Enum ĐỘNG cho loại thay đổi lương (không hardcode) — chỉnh được trong Settings.
INSERT INTO enum_types (type_key, label, description, is_editable)
VALUES ('salary_change_type', N'Loại điều chỉnh lương', N'Khởi tạo / tăng / giảm / điều chỉnh lương', true)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT et.id, o.k, o.l, o.s FROM enum_types et,
  (VALUES ('initial', N'Khởi tạo', 0), ('raise', N'Tăng lương', 1),
          ('cut', N'Giảm lương', 2), ('adjust', N'Điều chỉnh', 3)) AS o(k, l, s)
WHERE et.type_key = 'salary_change_type' ON CONFLICT (type_id, option_key) DO NOTHING;
