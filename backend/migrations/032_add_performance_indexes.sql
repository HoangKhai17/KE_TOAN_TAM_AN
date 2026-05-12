-- Migration 032: Add missing indexes for query performance
-- Context:
--   1. users FTS GIN   — for plainto_tsquery search (replacing ILIKE)
--   2. task_activity_logs.user_id — FK not indexed; used in admin queries
--   3. tasks.task_type_id  — FK not indexed; used in JOINs / filters
--   4. tasks(company_id, status) composite — used by LATERAL COUNT per company
--   5. tasks.created_at DESC — common ORDER BY column in list queries

-- 1. Full-text search index on users (name + email)
--    Required by the plainto_tsquery search in users.service.js
CREATE INDEX IF NOT EXISTS idx_users_fts
  ON users USING gin(to_tsvector('simple', name || ' ' || email));

-- 2. user_id FK on task_activity_logs (was missing — only task_id was indexed)
CREATE INDEX IF NOT EXISTS idx_tal_user
  ON task_activity_logs(user_id)
  WHERE user_id IS NOT NULL;

-- 3. task_type_id FK on tasks
CREATE INDEX IF NOT EXISTS idx_tasks_task_type
  ON tasks(task_type_id)
  WHERE task_type_id IS NOT NULL;

-- 4. Composite index for LATERAL COUNT(tasks per company by status)
--    Query pattern: WHERE company_id = $X → filter by status / due_date
CREATE INDEX IF NOT EXISTS idx_tasks_company_status
  ON tasks(company_id, status, due_date);

-- 5. created_at DESC for ORDER BY on list queries
CREATE INDEX IF NOT EXISTS idx_tasks_created_at
  ON tasks(created_at DESC);
