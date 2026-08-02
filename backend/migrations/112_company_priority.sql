-- Ưu tiên công ty: thuộc tính CHUNG của công ty (không còn per-user như cũ).
-- Chỉ admin đặt được; mọi người (kể cả staff phụ trách) đều thấy công ty ưu tiên
-- nổi lên đầu danh sách. "Thứ tự của tôi" (company_user_prefs.position) vẫn per-user.
ALTER TABLE companies
  ADD COLUMN is_priority BOOLEAN NOT NULL DEFAULT false;

-- Lọc/sắp công ty ưu tiên lên đầu.
CREATE INDEX IF NOT EXISTS idx_companies_is_priority ON companies(is_priority) WHERE is_priority;
