-- Khôi phục 3 cột phân loại (dữ liệu cũ không tái tạo được).
ALTER TABLE company_original_documents
  ADD COLUMN IF NOT EXISTS category  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS frequency VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source    VARCHAR(100);
