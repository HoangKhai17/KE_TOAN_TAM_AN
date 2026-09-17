-- GĐ2: Đưa "Điều cần lưu ý" (company_important_notes) sang engine bảng cột-động.
--   • Mỗi NHÓM (enum important_note_group + mọi note_group đang có) → 1 def section='important_note',
--     table_key = 'note__<gkey>', dùng chung cho MỌI công ty (allow_company_columns=false).
--   • Mỗi def seed 4 cột: content(text) / resolution(text) / severity(select) / is_pinned(select).
--   • Backfill 39 dòng company_important_notes → company_table_rows (data jsonb theo col_key).
-- GIỮ NGUYÊN bảng company_important_notes (drop ở GĐ6 sau khi nghiệm thu). Idempotent + có .down.

-- ① Tạo def cho từng nhóm (từ enum + phòng khi có note_group lạ trong dữ liệu)
INSERT INTO company_table_defs (table_key, name, section, sort_order, allow_company_columns, is_system, created_by)
SELECT 'note__' || g.gkey, g.gname, 'important_note', g.ord, FALSE, FALSE,
       COALESCE((SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1),
                (SELECT id FROM users ORDER BY created_at LIMIT 1))
FROM (
  SELECT eo.option_key AS gkey, eo.label AS gname, eo.sort_order AS ord
    FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
   WHERE et.type_key = 'important_note_group'
  UNION
  SELECT DISTINCT n.note_group, n.note_group, 900
    FROM company_important_notes n
   WHERE NOT EXISTS (
     SELECT 1 FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
      WHERE et.type_key = 'important_note_group' AND eo.option_key = n.note_group)
) g
WHERE NOT EXISTS (SELECT 1 FROM company_table_defs d WHERE d.table_key = 'note__' || g.gkey);

-- ② Seed 4 cột mặc định cho mỗi def note (guard theo def_id + col_key)
--   content
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, sort_order)
SELECT d.id, 'content', 'Nội dung', 'text', TRUE, 0
  FROM company_table_defs d
 WHERE d.section = 'important_note'
   AND NOT EXISTS (SELECT 1 FROM company_table_columns c WHERE c.def_id = d.id AND c.col_key = 'content');
--   resolution
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, sort_order)
SELECT d.id, 'resolution', 'Hiện trạng / Hướng khắc phục', 'text', FALSE, 1
  FROM company_table_defs d
 WHERE d.section = 'important_note'
   AND NOT EXISTS (SELECT 1 FROM company_table_columns c WHERE c.def_id = d.id AND c.col_key = 'resolution');
--   severity (select — danh mục assignment_priority, lưu LABEL)
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, options, sort_order)
SELECT d.id, 'severity', 'Mức độ', 'select', FALSE,
       (SELECT jsonb_agg(eo.label ORDER BY eo.sort_order)
          FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
         WHERE et.type_key = 'assignment_priority'),
       2
  FROM company_table_defs d
 WHERE d.section = 'important_note'
   AND NOT EXISTS (SELECT 1 FROM company_table_columns c WHERE c.def_id = d.id AND c.col_key = 'severity');
--   is_pinned (select — engine không có kiểu boolean → Có/Không)
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, options, sort_order)
SELECT d.id, 'is_pinned', 'Ghim', 'select', FALSE, '["Có","Không"]'::jsonb, 3
  FROM company_table_defs d
 WHERE d.section = 'important_note'
   AND NOT EXISTS (SELECT 1 FROM company_table_columns c WHERE c.def_id = d.id AND c.col_key = 'is_pinned');

-- ③ Backfill dữ liệu (chỉ khi CHƯA có dòng note nào → idempotent)
INSERT INTO company_table_rows (def_id, company_id, data, position, created_by, created_at, updated_at)
SELECT d.id, n.company_id,
       jsonb_build_object(
         'content',    COALESCE(n.content, ''),
         'resolution', COALESCE(n.resolution, ''),
         'severity',   COALESCE(pri.label, ''),
         'is_pinned',  CASE WHEN n.is_pinned THEN 'Có' ELSE 'Không' END
       ),
       n.sort_order, n.created_by, n.created_at, n.updated_at
  FROM company_important_notes n
  JOIN company_table_defs d
    ON d.section = 'important_note' AND d.table_key = 'note__' || n.note_group
  LEFT JOIN (
    SELECT eo.option_key, eo.label
      FROM enum_options eo JOIN enum_types et ON et.id = eo.type_id
     WHERE et.type_key = 'assignment_priority'
  ) pri ON pri.option_key = n.severity
 WHERE NOT EXISTS (
   SELECT 1 FROM company_table_rows r
     JOIN company_table_defs d2 ON d2.id = r.def_id
    WHERE d2.section = 'important_note' AND d2.table_key LIKE 'note__%');
