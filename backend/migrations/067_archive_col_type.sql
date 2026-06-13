ALTER TABLE company_archive_columns
  ADD COLUMN col_type VARCHAR(10) NOT NULL DEFAULT 'text'
             CHECK (col_type IN ('text', 'number', 'date'));
