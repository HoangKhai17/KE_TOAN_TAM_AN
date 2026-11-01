-- Thêm MỨC ĐỘ / ƯU TIÊN cho yêu cầu tài liệu KH (đồng bộ Tasks: high/medium/low, mặc định medium)
ALTER TABLE client_document_requests
  ADD COLUMN IF NOT EXISTS priority VARCHAR(10) NOT NULL DEFAULT 'medium';
