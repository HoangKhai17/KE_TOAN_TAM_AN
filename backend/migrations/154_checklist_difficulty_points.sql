-- KPI v2 · Phase A1 — Độ khó + điểm + cờ QUAN TRỌNG cho từng bước checklist MẪU (theo loại CV).
-- Đây là giá trị GỢI Ý mặc định; lịch định kỳ (Phase A2) sẽ copy xuống rồi cho sửa riêng.
-- Điểm gợi ý theo độ khó (map ở code): Dễ=2, Trung bình=4, Khó=6.

-- Enum động độ khó checklist (nhãn sửa được ở Danh mục hệ thống).
INSERT INTO enum_types (type_key, label, description) VALUES
  ('checklist_difficulty', N'Độ khó checklist', N'Độ khó của một bước checklist — dùng gợi ý điểm KPI')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES
  ('de',         N'Dễ',          0),
  ('trung_binh', N'Trung bình',  1),
  ('kho',        N'Khó',         2)
) AS opt(key, label, ord)
WHERE type_key = 'checklist_difficulty'
ON CONFLICT (type_id, option_key) DO NOTHING;

-- Cột cho bước checklist MẪU. Mặc định Trung bình / 4 điểm / không quan trọng — không phá dữ liệu cũ.
ALTER TABLE task_type_checklist_templates
  ADD COLUMN IF NOT EXISTS difficulty   VARCHAR(20) NOT NULL DEFAULT 'trung_binh',
  ADD COLUMN IF NOT EXISTS points        SMALLINT   NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS is_important  BOOLEAN    NOT NULL DEFAULT FALSE;
