DROP TABLE IF EXISTS work_schedules;
ALTER TABLE users DROP COLUMN IF EXISTS annual_leave_days;
ALTER TABLE users DROP COLUMN IF EXISTS default_shift_id;
DROP TABLE IF EXISTS shifts;
