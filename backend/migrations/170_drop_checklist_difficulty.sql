-- Gỡ ĐỘ KHÓ checklist (enum 'checklist_difficulty') khỏi toàn hệ thống — khách không dùng nữa.
-- Điểm checklist giữ NGUYÊN ở cột `points` (độ khó trước đây chỉ GỢI Ý điểm, không tham gia tính toán).

ALTER TABLE task_type_checklist_templates DROP COLUMN IF EXISTS difficulty;
ALTER TABLE task_type_subtask_steps       DROP COLUMN IF EXISTS difficulty;
ALTER TABLE schedule_checklist_items      DROP COLUMN IF EXISTS difficulty;
ALTER TABLE schedule_subtask_items        DROP COLUMN IF EXISTS difficulty;
ALTER TABLE task_checklist_items          DROP COLUMN IF EXISTS difficulty;

-- Xoá enum động 'checklist_difficulty' (options trước, rồi type).
DELETE FROM enum_options
 WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'checklist_difficulty');
DELETE FROM enum_types WHERE type_key = 'checklist_difficulty';
