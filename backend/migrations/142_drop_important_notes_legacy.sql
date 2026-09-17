-- GĐ6: dọn sạch "Điều cần lưu ý" cũ sau khi đã chuyển sang engine bảng cột-động (GĐ2) và nghiệm thu.
-- Dữ liệu đã nằm ở company_table_rows (section='important_note'); bảng + enum cũ không còn nơi dùng.
DROP TABLE IF EXISTS company_important_notes;

-- Enum nhóm cũ không còn điều khiển gì (nhóm giờ là các def). Gỡ để Danh mục hệ thống gọn.
DELETE FROM enum_options eo USING enum_types et
 WHERE eo.type_id = et.id AND et.type_key = 'important_note_group';
DELETE FROM enum_types WHERE type_key = 'important_note_group';
