DROP INDEX IF EXISTS idx_documents_period;
ALTER TABLE documents DROP COLUMN IF EXISTS period;
