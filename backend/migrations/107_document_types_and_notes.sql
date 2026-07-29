-- TAB QUY TRÌNH — 2 mục mới cùng cấp với Quy trình:
--   1) Chứng từ phát sinh (company_document_types)
--   2) Điều cần lưu ý     (company_notes)
--
-- Chứng từ phát sinh: các cột phân loại (category / frequency / source) để user TỰ
-- NHẬP text tự do — KHÔNG dùng enum, vì bảng này tuỳ biến theo quy trình từng khách.
-- Điều cần lưu ý: mức độ (severity) DÙNG LẠI danh mục động assignment_priority có sẵn
-- (Khẩn cấp/Cao/Bình thường/Thấp) — không tạo enum mới.

-- ── 1) Chứng từ phát sinh ─────────────────────────────────────────────────────
CREATE TABLE company_document_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,          -- tên loại chứng từ (vd "Hóa đơn đầu vào")
  category    VARCHAR(100),                    -- phân loại / đầu vào-đầu ra (tự nhập)
  frequency   VARCHAR(100),                    -- tần suất phát sinh (tự nhập)
  source      VARCHAR(100),                    -- nguồn cung cấp (tự nhập)
  note        TEXT,                            -- ghi chú
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID NOT NULL REFERENCES users(id),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cdt_company ON company_document_types(company_id);

-- ── 2) Điều cần lưu ý ─────────────────────────────────────────────────────────
-- LƯU Ý: tên company_notes đã bị tính năng "Ghi chú nhanh" (tab Ghi chú) chiếm →
-- dùng tên riêng company_important_notes để không đụng dữ liệu cũ.
CREATE TABLE company_important_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,                   -- nội dung lưu ý
  severity    VARCHAR(50) NOT NULL DEFAULT 'normal',  -- giá trị lấy từ enum assignment_priority
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,  -- ghim lên đầu
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID NOT NULL REFERENCES users(id),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_cin_company ON company_important_notes(company_id);
-- Không seed enum mới: cột severity dùng lại danh mục assignment_priority có sẵn.
