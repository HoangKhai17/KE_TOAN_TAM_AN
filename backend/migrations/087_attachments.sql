-- File đính kèm DÙNG CHUNG cho mọi module.
-- module = 'internal_doc' (hiện tại); sau này 'task', 'company'… → KHÔNG cần migration mới.
CREATE TABLE attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module       TEXT NOT NULL,                 -- nhóm chức năng sở hữu file
  entity_id    UUID NOT NULL,                 -- bản ghi cụ thể (vd: internal_doc_categories.id)
  file_name    TEXT NOT NULL,                 -- tên gốc (hiển thị + đặt tên khi tải về)
  storage_path TEXT NOT NULL,                 -- đường dẫn tương đối trong volume uploads
  mime_type    TEXT NOT NULL,
  size_bytes   BIGINT NOT NULL,
  title        TEXT,                          -- nhãn tuỳ chọn, mặc định = file_name
  description  TEXT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_module_entity ON attachments (module, entity_id, created_at DESC);
