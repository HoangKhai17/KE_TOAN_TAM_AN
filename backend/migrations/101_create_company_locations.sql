-- ĐỊA ĐIỂM CÔNG TY (company_locations)
--
-- Mỗi công ty có thể có NHIỀU địa điểm khác loại: trụ sở chính, chi nhánh,
-- văn phòng đại diện, địa điểm kinh doanh, kho, cơ sở... Mỗi địa điểm có đặc thù
-- riêng (MST phụ thuộc 13 số, hình thức hạch toán, trạng thái, mốc ngày...).
--
-- Phase 1: CHỈ LƯU THÔNG TIN — không nối vào bộ tạo công việc (Tasks). Cột companies.address
-- cũ GIỮ NGUYÊN, không tự di trú, để không phá dữ liệu/giao diện đang dùng.
--
-- location_type / status / accounting_form dùng hệ enum metadata (enum_types +
-- enum_options) giống document_category — lưu dạng TEXT, admin tự thêm/sửa nhãn
-- trong Cài đặt, không cần tạo kiểu ENUM Postgres.

CREATE TABLE company_locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_type    TEXT NOT NULL,                       -- enum location_type
  name             VARCHAR(200),                        -- tên gọi: "Chi nhánh 1", "Kho Bình Dương"
  address          TEXT,                                -- địa chỉ đầy đủ
  tax_code         VARCHAR(20),                         -- MST / mã đơn vị phụ thuộc (13 số)
  accounting_form  TEXT,                                -- enum accounting_form (độc lập/phụ thuộc) — có thể NULL
  tax_authority    VARCHAR(200),                        -- cơ quan thuế quản lý (chi cục thuế)
  status           TEXT NOT NULL DEFAULT 'active',      -- enum location_status
  start_date       DATE,                                -- ngày thành lập / bắt đầu
  end_date         DATE,                                -- ngày chấm dứt
  contact_name     VARCHAR(100),                        -- người phụ trách tại chỗ
  contact_phone    VARCHAR(20),
  is_primary       BOOLEAN NOT NULL DEFAULT FALSE,      -- trụ sở chính (duy nhất 1/công ty)
  sort_order       INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       UUID NOT NULL REFERENCES users(id),
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cl_company ON company_locations(company_id);
CREATE INDEX idx_cl_status  ON company_locations(company_id, status);

-- Mỗi công ty chỉ được 1 trụ sở chính
CREATE UNIQUE INDEX idx_cl_one_primary
  ON company_locations(company_id) WHERE is_primary = TRUE;

-- ── Seed enum metadata ────────────────────────────────────────────────────────

INSERT INTO enum_types (type_key, label, description) VALUES
  ('location_type',    'Loại địa điểm',           'Phân loại địa điểm của công ty (trụ sở, chi nhánh, kho...)'),
  ('location_status',  'Trạng thái địa điểm',     'Tình trạng hoạt động của địa điểm'),
  ('accounting_form',  'Hình thức hạch toán',     'Hạch toán độc lập hay phụ thuộc (áp dụng cho chi nhánh)');

-- location_type
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('head_office',       'Trụ sở chính',          0),
  ('branch',            'Chi nhánh',             1),
  ('rep_office',        'Văn phòng đại diện',    2),
  ('business_location', 'Địa điểm kinh doanh',   3),
  ('warehouse',         'Kho',                   4),
  ('facility',          'Cơ sở',                 5),
  ('other',             'Khác',                  6)
) AS opt(key, label, ord)
WHERE type_key = 'location_type';

-- location_status
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('active',     'Đang hoạt động', 0),
  ('suspended',  'Tạm ngưng',      1),
  ('terminated', 'Đã chấm dứt',    2)
) AS opt(key, label, ord)
WHERE type_key = 'location_status';

-- accounting_form
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('independent', 'Hạch toán độc lập',   0),
  ('dependent',   'Hạch toán phụ thuộc', 1)
) AS opt(key, label, ord)
WHERE type_key = 'accounting_form';
