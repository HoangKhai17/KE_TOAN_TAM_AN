-- "Chức năng" địa điểm là TEXT tự do (không dùng enum). Gỡ enum_type location_function
-- đã thêm nhầm ở migration 114. Cột company_locations.location_function GIỮ NGUYÊN (kiểu TEXT).
DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'location_function');
DELETE FROM enum_types WHERE type_key = 'location_function';
