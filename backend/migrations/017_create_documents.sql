CREATE TABLE documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  task_id          UUID REFERENCES tasks(id) ON DELETE SET NULL,
  file_name        VARCHAR(300) NOT NULL,
  category         document_category NOT NULL DEFAULT 'khac',
  onedrive_item_id VARCHAR(200) NOT NULL UNIQUE,
  web_url          TEXT NOT NULL,
  size_bytes       BIGINT,
  mime_type        VARCHAR(100),
  uploaded_by      UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_company  ON documents(company_id);
CREATE INDEX idx_documents_task     ON documents(task_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_fts      ON documents
  USING gin(to_tsvector('simple', file_name));
