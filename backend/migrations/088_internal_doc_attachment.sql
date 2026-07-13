-- Tài liệu nội bộ: một mục giờ có thể là LINK (url) HOẶC FILE (attachment_id).
ALTER TABLE internal_doc_links
  ADD COLUMN attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL;

-- url không còn bắt buộc (mục dạng file thì url = NULL)
ALTER TABLE internal_doc_links ALTER COLUMN url DROP NOT NULL;

-- Bắt buộc phải có ĐÚNG một trong hai: url hoặc attachment_id
ALTER TABLE internal_doc_links
  ADD CONSTRAINT internal_doc_links_url_or_file
  CHECK ((url IS NOT NULL AND attachment_id IS NULL)
      OR (url IS NULL AND attachment_id IS NOT NULL));

CREATE INDEX idx_internal_doc_links_attachment ON internal_doc_links (attachment_id);
