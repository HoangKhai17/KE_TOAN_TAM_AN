-- Rollback 080
-- PostgreSQL không hỗ trợ xoá giá trị khỏi enum type → các giá trị enum giữ nguyên.
DELETE FROM enum_options
WHERE option_key = 'birthday'
  AND type_id = (SELECT id FROM enum_types WHERE type_key = 'notification_type');
