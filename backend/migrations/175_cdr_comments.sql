-- Bình luận cho Yêu cầu KH (client_document_requests) — mirror task_comments.
CREATE TABLE IF NOT EXISTS client_request_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES client_document_requests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  is_edited  BOOLEAN NOT NULL DEFAULT FALSE,
  edited_at  TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdr_comments_request ON client_request_comments(request_id);
CREATE INDEX IF NOT EXISTS idx_cdr_comments_user    ON client_request_comments(user_id);
