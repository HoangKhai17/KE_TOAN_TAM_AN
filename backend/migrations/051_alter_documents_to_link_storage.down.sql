ALTER TABLE documents
  RENAME COLUMN name TO file_name;

ALTER TABLE documents
  RENAME COLUMN url TO web_url;

ALTER TABLE documents
  DROP COLUMN IF EXISTS description,
  ADD  COLUMN IF NOT EXISTS onedrive_item_id VARCHAR(200),
  ADD  COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD  COLUMN IF NOT EXISTS mime_type VARCHAR(100);

DROP INDEX IF EXISTS idx_documents_fts;
CREATE INDEX idx_documents_fts ON documents
  USING gin(to_tsvector('simple', file_name));
