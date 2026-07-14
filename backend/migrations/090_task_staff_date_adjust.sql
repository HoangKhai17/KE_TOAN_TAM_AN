-- Nhân viên chỉ được điều chỉnh Ngày bắt đầu / Ngày hết hạn ĐÚNG 1 LẦN
-- (và chỉ với công việc sinh từ lịch định kỳ). NULL = chưa từng chỉnh.
-- Admin không bị giới hạn và KHÔNG set cột này.
ALTER TABLE tasks ADD COLUMN staff_dates_adjusted_at TIMESTAMP;
