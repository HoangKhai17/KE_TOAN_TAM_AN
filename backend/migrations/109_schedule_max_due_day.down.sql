ALTER TABLE customer_task_schedules DROP COLUMN IF EXISTS max_due_day;
ALTER TABLE companies ADD COLUMN max_task_due_date DATE;
