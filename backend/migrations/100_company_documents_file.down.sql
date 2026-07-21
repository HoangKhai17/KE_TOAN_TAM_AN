ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_url_or_file;
DROP INDEX IF EXISTS idx_documents_attachment;
ALTER TABLE documents DROP COLUMN IF EXISTS attachment_id;
UPDATE documents SET url = '' WHERE url IS NULL;
ALTER TABLE documents ALTER COLUMN url SET NOT NULL;
