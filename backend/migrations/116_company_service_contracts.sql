-- Bảng "Hợp đồng dịch vụ" của công ty (tab cạnh Địa điểm KD trong hồ sơ).
-- Trạng thái: active/renew/expired tự tính từ end_date vs hôm nay (frontend),
-- 'renewed' (Đã gia hạn) & 'stopped' (Ngưng dịch vụ) là CHỌN TAY lưu ở status_override.
CREATE TABLE company_service_contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contract_type   TEXT,                                 -- enum contract_type (Hợp đồng / Bảng thanh lý)
  content         TEXT,                                 -- Nội dung công việc
  start_date      DATE,
  end_date        DATE,
  status_override TEXT CHECK (status_override IN ('renewed', 'stopped')),  -- NULL = tự động tính
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID NOT NULL REFERENCES users(id),
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_csc_company ON company_service_contracts(company_id);

-- Enum động cho cột "Loại" (admin quản lý trong Settings → Danh mục hệ thống).
INSERT INTO enum_types (type_key, label, description) VALUES
  ('contract_type', 'Loại hợp đồng dịch vụ', 'Phân loại dòng trong bảng Hợp đồng dịch vụ (hợp đồng, bảng thanh lý...)')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('contract',    'Hợp đồng',      0),
  ('liquidation', 'Bảng thanh lý', 1)
) AS opt(key, label, ord)
WHERE type_key = 'contract_type'
ON CONFLICT DO NOTHING;
