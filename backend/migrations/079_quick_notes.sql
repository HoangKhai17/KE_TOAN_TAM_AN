-- Migration 079: Ghi chú nhanh cá nhân (quick_notes)
-- Mỗi user có sổ ghi chú nhanh RIÊNG TƯ — chỉ chính chủ xem/sửa/xoá.
-- Dùng cho tình huống đang trên đường, khách gọi → note nhanh, về xử lý sau.

CREATE TABLE quick_notes (
  id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT      NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX quick_notes_user_id_idx ON quick_notes (user_id, created_at DESC);
