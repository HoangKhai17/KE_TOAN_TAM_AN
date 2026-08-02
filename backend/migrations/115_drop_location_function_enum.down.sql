-- Tạo lại enum location_function (rollback) — nếu cần quay về trạng thái có enum.
INSERT INTO enum_types (type_key, label, description) VALUES
  ('location_function', 'Chức năng địa điểm', 'Chức năng/mục đích sử dụng của địa điểm')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('business', 'Kinh doanh', 0),
  ('warehousing', 'Kho bãi', 1),
  ('manufacturing', 'Sản xuất', 2),
  ('office', 'Văn phòng', 3),
  ('showroom', 'Trưng bày', 4),
  ('other', 'Khác', 5)
) AS opt(key, label, ord)
WHERE type_key = 'location_function'
ON CONFLICT DO NOTHING;
