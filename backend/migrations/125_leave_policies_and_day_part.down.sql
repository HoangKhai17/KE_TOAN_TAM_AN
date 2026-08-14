ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS chk_lr_day_part,
  DROP CONSTRAINT IF EXISTS chk_lr_halfday_single_day,
  DROP CONSTRAINT IF EXISTS chk_lr_hours;

DROP INDEX IF EXISTS idx_lr_day_part;

ALTER TABLE leave_requests
  DROP COLUMN IF EXISTS day_part,
  DROP COLUMN IF EXISTS hours;

DROP TABLE IF EXISTS leave_policies;

DELETE FROM enum_options
 WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'leave_day_part');
DELETE FROM enum_types WHERE type_key = 'leave_day_part';

-- Trả nhãn enum về bản seed gốc của migration 041
UPDATE enum_options SET label = 'Nghỉ không phép'
 WHERE option_key = 'unpaid'
   AND type_id = (SELECT id FROM enum_types WHERE type_key = 'leave_type');
