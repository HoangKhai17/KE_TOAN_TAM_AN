-- Ghi chú nội bộ (company_notes): thêm cột "Kỳ" (text tự do, VD "Quý 2/2026", "Tháng 7").
-- (Cột Ghim/is_pinned được bỏ khỏi giao diện nhưng GIỮ trong DB để không phá dữ liệu cũ.)
ALTER TABLE company_notes ADD COLUMN IF NOT EXISTS period VARCHAR(100);
