-- Đưa mọi cột richtext về text (để khôi phục CHECK cũ không lỗi), bỏ width mặc định của cột note.
UPDATE company_table_columns SET data_type = 'text' WHERE data_type = 'richtext';

UPDATE company_table_columns c SET width = NULL
FROM company_table_defs d
WHERE c.def_id = d.id AND d.section = 'important_note'
  AND c.col_key IN ('content', 'resolution', 'severity', 'is_pinned');

ALTER TABLE company_table_columns DROP CONSTRAINT IF EXISTS company_table_columns_data_type_check;
ALTER TABLE company_table_columns ADD CONSTRAINT company_table_columns_data_type_check
  CHECK (data_type IN ('text','number','date','select','computed','link','file','formula'));
