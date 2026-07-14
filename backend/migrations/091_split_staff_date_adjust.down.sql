ALTER TABLE tasks
  DROP COLUMN IF EXISTS staff_start_adjusted_at,
  DROP COLUMN IF EXISTS staff_due_adjusted_at;

ALTER TABLE tasks ADD COLUMN staff_dates_adjusted_at TIMESTAMP;
