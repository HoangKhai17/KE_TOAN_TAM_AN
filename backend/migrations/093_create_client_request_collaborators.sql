-- Người HỖ TRỢ cho Yêu cầu khách hàng (CDR). Owner vẫn là client_document_requests.requested_by.
-- Collaborator chỉ mở rộng lớp "thấy" (staff nhìn thấy CDR mình được nhờ hỗ trợ) — không siết quyền thao tác.
CREATE TABLE IF NOT EXISTS client_request_collaborators (
  request_id UUID NOT NULL REFERENCES client_document_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  added_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, user_id)
);

-- Tra nhanh "những CDR mà user X đang hỗ trợ" (scope danh sách + bộ lọc CV hỗ trợ).
CREATE INDEX IF NOT EXISTS idx_crc_user ON client_request_collaborators(user_id);
