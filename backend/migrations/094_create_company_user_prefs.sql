-- Tùy chọn danh sách khách hàng THEO TỪNG NGƯỜI DÙNG:
--   position  : thứ tự do user tự kéo-thả (NULL = chưa sắp, xếp sau theo created_at DESC)
--   is_pinned : đánh dấu ưu tiên (ghim) — luôn nổi lên đầu danh sách của riêng user đó
-- Mỗi user một bộ tùy chọn riêng, không ảnh hưởng người khác.
CREATE TABLE IF NOT EXISTS company_user_prefs (
  user_id    UUID    NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  company_id UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  position   INTEGER,
  is_pinned  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, company_id)
);

-- Tra nhanh toàn bộ tùy chọn của 1 user khi dựng danh sách
CREATE INDEX IF NOT EXISTS idx_cup_user ON company_user_prefs(user_id);
