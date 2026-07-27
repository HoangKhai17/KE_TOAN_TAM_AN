-- Quay lại ENUM gốc. LƯU Ý: sẽ lỗi nếu đang có công ty mang loại hình ngoài 5 giá
-- trị gốc (TNHH, CP, HKD, DN_TU_NHAN, KHAC) — phải dọn dữ liệu trước khi down.
ALTER TABLE companies ALTER COLUMN business_type DROP DEFAULT;
ALTER TABLE companies ALTER COLUMN business_type TYPE business_type USING business_type::business_type;
ALTER TABLE companies ALTER COLUMN business_type SET DEFAULT 'TNHH';
