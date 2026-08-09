DROP INDEX IF EXISTS idx_documents_sort_order;
DROP INDEX IF EXISTS idx_schedules_sort_order;
DROP INDEX IF EXISTS idx_company_notes_sort_order;
ALTER TABLE documents DROP COLUMN IF EXISTS sort_order;
ALTER TABLE customer_task_schedules DROP COLUMN IF EXISTS sort_order;
ALTER TABLE company_notes DROP COLUMN IF EXISTS sort_order;
