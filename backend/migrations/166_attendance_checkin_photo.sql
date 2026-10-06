-- Ảnh selfie xác minh khi chấm công bằng điện thoại (Mức A).
-- Lưu đường dẫn TƯƠNG ĐỐI trong kho file dùng chung (lib/storage.js, module='attendance').
-- NULL = lần chấm đó không kèm ảnh (NV từ chối camera / máy lỗi / chấm bằng desktop).
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS photo_path VARCHAR(300);
