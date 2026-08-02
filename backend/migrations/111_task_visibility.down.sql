DROP INDEX IF EXISTS idx_tasks_visibility;
ALTER TABLE tasks DROP COLUMN IF EXISTS visibility;
