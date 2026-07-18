-- Kiểu hiển thị riêng của từng hình (nét đứt/liền, sau này thêm màu, độ dày…).
-- Dùng JSONB để mở rộng về sau KHÔNG cần migration mới.
ALTER TABLE company_process_nodes
  ADD COLUMN IF NOT EXISTS style JSONB;
