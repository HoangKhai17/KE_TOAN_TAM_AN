ALTER TABLE tasks DROP COLUMN IF EXISTS group_name;
ALTER TABLE customer_task_schedules DROP COLUMN IF EXISTS group_name;
-- Không phục hồi NOT NULL cho task_type_id (có thể đã có lịch thủ công task_type_id NULL).
