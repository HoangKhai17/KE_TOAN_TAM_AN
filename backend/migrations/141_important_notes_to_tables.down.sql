-- Gỡ toàn bộ artefact GĐ2 (chỉ các def note migrate ra — table_key 'note__%').
-- Dữ liệu gốc company_important_notes KHÔNG bị đụng → rollback an toàn.
DELETE FROM company_table_rows r
  USING company_table_defs d
 WHERE r.def_id = d.id AND d.section = 'important_note' AND d.table_key LIKE 'note__%';

DELETE FROM company_table_columns c
  USING company_table_defs d
 WHERE c.def_id = d.id AND d.section = 'important_note' AND d.table_key LIKE 'note__%';

DELETE FROM company_table_defs
 WHERE section = 'important_note' AND table_key LIKE 'note__%';
