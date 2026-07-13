DROP INDEX IF EXISTS idx_internal_doc_links_attachment;
ALTER TABLE internal_doc_links DROP CONSTRAINT IF EXISTS internal_doc_links_url_or_file;
DELETE FROM internal_doc_links WHERE url IS NULL;
ALTER TABLE internal_doc_links ALTER COLUMN url SET NOT NULL;
ALTER TABLE internal_doc_links DROP COLUMN IF EXISTS attachment_id;
