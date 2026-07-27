-- LOẠI HÌNH DOANH NGHIỆP: cho phép DANH MỤC ĐỘNG (admin tự thêm trong Cài đặt)
--
-- Trước đây `companies.business_type` là ENUM gốc Postgres chỉ có 5 giá trị cứng
-- (TNHH, CP, HKD, DN_TU_NHAN, KHAC). Trong khi hệ danh mục (enum_options) lại cho
-- admin thêm loại mới → thêm xong thì:
--   • lọc theo loại mới → "invalid input value for enum business_type" → 500
--   • không gán được loại mới cho công ty (cột không nhận giá trị ngoài enum)
--
-- Đổi cột sang VARCHAR để nhận BẤT KỲ option_key nào admin thêm. Nguồn danh mục
-- (nhãn, nhóm) vẫn là enum_types/enum_options như các danh mục động khác.
-- Dữ liệu cũ giữ nguyên (USING ::text). Giữ lại KIỂU business_type để down migrate được.

ALTER TABLE companies ALTER COLUMN business_type DROP DEFAULT;
ALTER TABLE companies ALTER COLUMN business_type TYPE VARCHAR(50) USING business_type::text;
ALTER TABLE companies ALTER COLUMN business_type SET DEFAULT 'TNHH';
