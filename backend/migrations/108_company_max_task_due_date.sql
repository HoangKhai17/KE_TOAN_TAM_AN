-- LUỒNG 2 — Trần ngày hoàn thành theo khách hàng.
-- Admin đặt 1 mốc ngày tuyệt đối cho mỗi công ty; khi STAFF sửa Ngày hết hạn của
-- task mà vượt mốc này → chặn (403). Admin miễn trừ; task auto sinh KHÔNG bị kẹp.
-- NULL = không đặt trần (không hạn chế).
ALTER TABLE companies ADD COLUMN max_task_due_date DATE;
