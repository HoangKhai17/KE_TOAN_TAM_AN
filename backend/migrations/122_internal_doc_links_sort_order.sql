ALTER TABLE internal_doc_links ADD COLUMN IF NOT EXISTS sort_order INTEGER;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id) - 1 AS position
  FROM internal_doc_links
)
UPDATE internal_doc_links AS links
SET sort_order = ranked.position
FROM ranked
WHERE links.id = ranked.id AND links.sort_order IS NULL;

ALTER TABLE internal_doc_links
  ALTER COLUMN sort_order SET DEFAULT 0,
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_doc_links_sort
  ON internal_doc_links(sort_order, created_at DESC);
