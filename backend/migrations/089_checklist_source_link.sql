-- Liên kết bền cho checklist của task → phục vụ báo cáo "Theo quy trình" chính xác.
-- Đóng băng lúc tạo task; là liên kết MỀM (không FK cứng) để sống sót khi bước mẫu bị xoá/đổi.
--   source_step_id   = id bước mẫu gốc của chính bước này (NULL = bước user tự thêm)
--   source_parent_id = id bước mẫu CHA (đóng băng quan hệ cha-con; NULL = bước top-level / tự thêm)
ALTER TABLE task_checklist_items
  ADD COLUMN source_step_id   UUID,
  ADD COLUMN source_parent_id UUID;

CREATE INDEX idx_task_checklist_items_source ON task_checklist_items (task_id, source_step_id);
