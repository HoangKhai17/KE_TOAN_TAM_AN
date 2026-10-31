-- Rollback: khôi phục cột độ khó + enum 'checklist_difficulty'.
-- Lưu ý: dữ liệu độ khó cũ KHÔNG khôi phục được (đã xoá) — cột trở về mặc định 'trung_binh'.

ALTER TABLE task_type_checklist_templates ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'trung_binh';
ALTER TABLE task_type_subtask_steps       ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'trung_binh';
ALTER TABLE schedule_checklist_items      ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'trung_binh';
ALTER TABLE schedule_subtask_items        ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) NOT NULL DEFAULT 'trung_binh';
ALTER TABLE task_checklist_items          ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20);

INSERT INTO enum_types (type_key, label, description) VALUES
  ('checklist_difficulty', 'Độ khó checklist', 'Độ khó của một bước checklist — dùng gợi ý điểm KPI')
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO enum_options (type_id, option_key, label, sort_order)
SELECT id, opt.key, opt.label, opt.ord FROM enum_types,
(VALUES ('de', 'Dễ', 0), ('trung_binh', 'Trung bình', 1), ('kho', 'Khó', 2)) AS opt(key, label, ord)
WHERE type_key = 'checklist_difficulty'
ON CONFLICT (type_id, option_key) DO NOTHING;
