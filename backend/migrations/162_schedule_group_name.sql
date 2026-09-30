-- Lịch TỰ TẠO (thủ công) gắn theo NHÓM báo cáo (group_name), không phải 1 loại CV mẫu cụ thể.
-- → task_type_id cho phép NULL (lịch/ task thủ công không thuộc mẫu nào),
--   và thêm group_name trực tiếp trên lịch + task để báo cáo gom nhóm đúng.
ALTER TABLE customer_task_schedules ALTER COLUMN task_type_id DROP NOT NULL;
ALTER TABLE customer_task_schedules ADD COLUMN IF NOT EXISTS group_name VARCHAR(200);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_name VARCHAR(200);
