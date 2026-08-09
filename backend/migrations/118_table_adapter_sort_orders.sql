ALTER TABLE company_notes ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_task_schedules ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY is_pinned DESC, created_at DESC, id) - 1 AS pos
  FROM company_notes
)
UPDATE company_notes AS target SET sort_order = ranked.pos FROM ranked WHERE target.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC, id) - 1 AS pos
  FROM customer_task_schedules
)
UPDATE customer_task_schedules AS target SET sort_order = ranked.pos FROM ranked WHERE target.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at DESC, id) - 1 AS pos
  FROM documents
)
UPDATE documents AS target SET sort_order = ranked.pos FROM ranked WHERE target.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_company_notes_sort_order ON company_notes(company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_schedules_sort_order ON customer_task_schedules(company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_documents_sort_order ON documents(company_id, sort_order);
