DROP INDEX IF EXISTS idx_internal_doc_links_sort;
ALTER TABLE internal_doc_links DROP COLUMN IF EXISTS sort_order;
