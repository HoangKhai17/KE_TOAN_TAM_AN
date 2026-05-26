-- Composite indexes for common filter + sort combinations on internal_assignments
CREATE INDEX IF NOT EXISTS idx_ia_status_created
  ON internal_assignments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ia_priority_created
  ON internal_assignments(priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ia_status_deadline
  ON internal_assignments(status, deadline_date);

-- Index for start_date column added in migration 057
CREATE INDEX IF NOT EXISTS idx_ia_start_date
  ON internal_assignments(start_date)
  WHERE start_date IS NOT NULL;
