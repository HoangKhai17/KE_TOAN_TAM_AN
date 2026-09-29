-- KPI v2 · Lịch định kỳ TỰ TẠO (thủ công): thêm TÊN RIÊNG cho lịch.
-- NULL = lịch "từ mẫu" (tên task = tên loại CV). Có title = lịch thủ công (tên task = title).
-- Vẫn giữ task_type_id (nhóm/loại để báo cáo).
ALTER TABLE customer_task_schedules
  ADD COLUMN IF NOT EXISTS title VARCHAR(300);
