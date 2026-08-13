-- ── KH lưu HS gốc tại Cty (company_original_documents) ────────────────────────
--
-- Table "KH lưu HS gốc tại Cty" trong tab Quy trình — cấu trúc GIỐNG HỆT
-- company_document_types (Chứng từ phát sinh): các cột phân loại (category /
-- frequency / source) để user TỰ NHẬP text tự do — KHÔNG dùng enum, vì bảng này
-- tuỳ biến theo từng khách. Hiển thị kế bên tab Chứng từ phát sinh.

CREATE TABLE company_original_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,          -- tên hồ sơ gốc (vd "Giấy phép kinh doanh")
  category    VARCHAR(100),                    -- phân loại (tự nhập)
  frequency   VARCHAR(100),                    -- tần suất (tự nhập)
  source      VARCHAR(100),                    -- nguồn cung cấp (tự nhập)
  note        TEXT,                            -- ghi chú
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID NOT NULL REFERENCES users(id),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cod_company ON company_original_documents(company_id);
