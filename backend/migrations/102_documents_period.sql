-- TÀI LIỆU: thêm "Kỳ tài liệu" (period)
--
-- Kỳ nghiệp vụ của tài liệu (VD: "2025", "T06/2026", "Q1/2025") — KHÁC với ngày
-- upload (created_at). Tài liệu của kỳ 2025 có thể được nhập vào 2026, nên không
-- thể suy ra kỳ từ ngày tạo. Lưu dạng text tự do cho linh hoạt; NULL nếu không rõ.

ALTER TABLE documents ADD COLUMN period VARCHAR(30);

CREATE INDEX idx_documents_period ON documents (company_id, period);
