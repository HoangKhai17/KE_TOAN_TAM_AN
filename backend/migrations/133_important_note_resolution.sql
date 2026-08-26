-- "Điều cần lưu ý": thêm cột "Hiện trạng / Hướng khắc phục" (text tự do).
-- (Cột severity/is_pinned được bỏ khỏi giao diện nhưng GIỮ trong DB để không phá dữ liệu cũ.)
ALTER TABLE company_important_notes ADD COLUMN IF NOT EXISTS resolution TEXT;
