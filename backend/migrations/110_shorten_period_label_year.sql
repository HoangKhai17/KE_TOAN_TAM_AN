-- Rút NĂM 4 chữ số → 2 chữ số trong nhãn kỳ + tiêu đề của task sinh từ lịch định kỳ.
--   dd/mm/2026 → dd/mm/26 ; T08/2026 → T08/26 ; Q3/2026 → Q3/26 ; 2026 → 26
--
-- period_label là KHÓA CHỐNG TRÙNG của bộ sinh task (schedule_id + period_label).
-- Phải đổi CÙNG LÚC với code, nếu không lần chạy sau sẽ tính nhãn mới (yy) khác nhãn
-- cũ (yyyy) → sinh task TRÙNG cho kỳ đã có. Chỉ áp cho task đã có period_label.
--
-- Chỉ đụng bảng tasks (không đụng client_document_requests — nhãn CDR quản lý riêng).

UPDATE tasks
SET period_label = regexp_replace(period_label, '(\d{2})(\d{2})$', '\2'),
    title        = regexp_replace(title,        '(\d{2})(\d{2})\]', '\2]')
WHERE period_label IS NOT NULL
  AND period_label ~ '\d{4}$';   -- chỉ nhãn còn năm 4 số (chạy lại không đổi tiếp)
