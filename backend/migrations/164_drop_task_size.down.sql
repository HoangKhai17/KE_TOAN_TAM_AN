-- Khôi phục "Cỡ việc" (nếu cần quay lại).
ALTER TABLE task_types ADD COLUMN IF NOT EXISTS size_points SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE tasks      ADD COLUMN IF NOT EXISTS size_points SMALLINT;

INSERT INTO enum_types (type_key, label, description) VALUES
  ('task_size', 'Cỡ việc', 'Độ lớn/phức tạp của công việc — dùng tính điểm KPI (mã = điểm)')
ON CONFLICT (type_key) DO NOTHING;
INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES ('1', 'Nhỏ', 0), ('2', 'Vừa', 1), ('3', 'Lớn', 2)) AS opt(key, label, ord)
WHERE type_key = 'task_size'
ON CONFLICT (type_id, option_key) DO NOTHING;
