-- Lưu ĐỘ KHÓ của từng bước checklist trên TASK (để hiển thị nhãn ở quickview/chi tiết).
-- Task trước đây chỉ copy điểm; nay mang luôn độ khó từ nguồn (lịch/mẫu) khi sinh.
ALTER TABLE task_checklist_items ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20);

-- Backfill tạm cho dữ liệu cũ: suy ngược từ điểm theo mốc mặc định (de=2, TB=4, khó=6, >6 rất khó).
-- Chỉ áp cho bước CÓ điểm (>0); bước 0đ để trống (không gắn nhãn).
UPDATE task_checklist_items SET difficulty = CASE
  WHEN points <= 2 THEN 'de'
  WHEN points <= 4 THEN 'trung_binh'
  WHEN points <= 6 THEN 'kho'
  ELSE 'rat_kho' END
WHERE difficulty IS NULL AND points > 0;
