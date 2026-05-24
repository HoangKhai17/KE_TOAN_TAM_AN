-- Phase 11 (revised): Replace OneDrive file storage with simple document link storage.
-- file_name → name (display label), web_url → url (cloud link).
-- Dropped: onedrive_item_id, size_bytes, mime_type (no longer needed without file upload).
-- Added: description (optional note about the link).

ALTER TABLE documents
  RENAME COLUMN file_name TO name;

ALTER TABLE documents
  RENAME COLUMN web_url TO url;

ALTER TABLE documents
  DROP COLUMN IF EXISTS onedrive_item_id,
  DROP COLUMN IF EXISTS size_bytes,
  DROP COLUMN IF EXISTS mime_type,
  ADD  COLUMN IF NOT EXISTS description TEXT;

-- Recreate FTS index on new column name
DROP INDEX IF EXISTS idx_documents_fts;
CREATE INDEX idx_documents_fts ON documents
  USING gin(to_tsvector('simple', name));
