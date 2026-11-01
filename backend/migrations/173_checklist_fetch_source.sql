-- "CÁCH LẤY" (fetch_source): mỗi bước checklist lấy chứng từ/dữ liệu ở đâu — enum động.
-- KHÁC task_source (nguồn công việc). Áp cho MỌI bước (cả cha lẫn con). Nullable = chưa đặt.

-- Enum động 'checklist_fetch_source' (nhãn "Cách lấy" — sửa được ở Danh mục hệ thống).
INSERT INTO enum_types (type_key, label, description) VALUES
  ('checklist_fetch_source', 'Cách lấy', 'Cách/nơi lấy chứng từ cho một bước checklist (Tự lấy online / KH gởi / …)')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('tu_lay_online', 'Tự lấy (online)', 0),
  ('kh_goi',        'KH gởi',          1),
  ('khong_can_lay', 'Không cần lấy',   2)
) AS opt(key, label, ord)
WHERE type_key = 'checklist_fetch_source'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- Cột fetch_source cho 5 bảng checklist (nullable).
ALTER TABLE task_type_checklist_templates ADD COLUMN IF NOT EXISTS fetch_source VARCHAR(30);
ALTER TABLE task_type_subtask_steps       ADD COLUMN IF NOT EXISTS fetch_source VARCHAR(30);
ALTER TABLE schedule_checklist_items      ADD COLUMN IF NOT EXISTS fetch_source VARCHAR(30);
ALTER TABLE schedule_subtask_items        ADD COLUMN IF NOT EXISTS fetch_source VARCHAR(30);
ALTER TABLE task_checklist_items          ADD COLUMN IF NOT EXISTS fetch_source VARCHAR(30);
