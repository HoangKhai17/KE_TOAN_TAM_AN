-- Gỡ "Cỡ việc" (mô hình cũ) — KPI v2 đã chuyển độ khó/điểm xuống từng bước checklist.
-- Bỏ cột size_points ở tasks + task_types và xoá enum 'task_size' khỏi Danh mục hệ thống.
ALTER TABLE tasks      DROP COLUMN IF EXISTS size_points;
ALTER TABLE task_types DROP COLUMN IF EXISTS size_points;

DELETE FROM enum_options WHERE type_id IN (SELECT id FROM enum_types WHERE type_key = 'task_size');
DELETE FROM enum_types  WHERE type_key = 'task_size';
