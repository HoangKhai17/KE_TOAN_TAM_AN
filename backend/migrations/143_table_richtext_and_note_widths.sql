-- Thêm kiểu cột 'richtext' (văn bản định dạng — tái dùng RichTextEditor) cho engine bảng cột-động.
ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_data_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select','computed','link','file','formula','richtext'));

-- Cột "Nội dung" của nhóm điều cần lưu ý → richtext.
UPDATE company_table_columns c SET data_type = 'richtext'
FROM company_table_defs d
WHERE c.def_id = d.id AND d.section = 'important_note' AND c.col_key = 'content';

-- Độ rộng mặc định để cột STT không bị table-layout:fixed kéo giãn + layout hợp lý.
UPDATE company_table_columns c
SET width = CASE c.col_key
    WHEN 'content'    THEN 460
    WHEN 'resolution' THEN 340
    WHEN 'severity'   THEN 150
    WHEN 'is_pinned'  THEN 90
    ELSE c.width END
FROM company_table_defs d
WHERE c.def_id = d.id AND d.section = 'important_note'
  AND c.col_key IN ('content', 'resolution', 'severity', 'is_pinned');
