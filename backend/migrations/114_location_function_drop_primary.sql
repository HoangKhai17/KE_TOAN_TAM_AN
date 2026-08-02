-- Địa điểm KD: thêm "Chức năng" (enum động location_function) + bỏ cờ "Trụ sở chính".
ALTER TABLE company_locations
  ADD COLUMN location_function TEXT,        -- enum location_function (option_key)
  DROP COLUMN IF EXISTS is_primary;

-- Enum động cho Chức năng (admin quản lý trong Settings → Danh mục hệ thống).
INSERT INTO enum_types (type_key, label, description) VALUES
  ('location_function', 'Chức năng địa điểm', 'Chức năng/mục đích sử dụng của địa điểm (kinh doanh, kho, sản xuất...)')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('business',      'Kinh doanh',  0),
  ('warehousing',   'Kho bãi',     1),
  ('manufacturing', 'Sản xuất',    2),
  ('office',        'Văn phòng',   3),
  ('showroom',      'Trưng bày',   4),
  ('other',         'Khác',        5)
) AS opt(key, label, ord)
WHERE type_key = 'location_function'
ON CONFLICT DO NOTHING;
