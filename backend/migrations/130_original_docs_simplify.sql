-- "KH lưu HS gốc tại Cty": rút gọn cấu trúc.
-- Bỏ 3 cột phân loại (category / frequency / source) vì khách không tổ chức theo các
-- trường này. Chỉ giữ Tên hồ sơ + Ghi chú; Ghi chú chuyển sang dạng RICH-TEXT (HTML).
ALTER TABLE company_original_documents
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS frequency,
  DROP COLUMN IF EXISTS source;
