-- Ngày bắt đầu cho Yêu cầu KH (tùy chọn) — song song với deadline_date (hạn nộp).
ALTER TABLE client_document_requests ADD COLUMN IF NOT EXISTS start_date DATE;
