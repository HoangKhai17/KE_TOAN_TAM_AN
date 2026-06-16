-- Migration 074: copy data 3 tab bespoke (HĐLĐ / HĐ KH.NCC / Nợ NSNN) sang generic
-- company tables. Defs is_active=FALSE (ẩn) để verify song song; KHÔNG drop bảng cũ.
-- Cutover (activate + drop bảng/code cũ) làm ở migration sau, sau khi QA.

-- ── Fixed def ids ─────────────────────────────────────────────────────────────
-- hdld : 00000000-0000-0000-0000-000000000001
-- csc  : 00000000-0000-0000-0000-000000000002
-- nsnn : 00000000-0000-0000-0000-000000000003

-- ── DEFS (is_active=FALSE, is_system=TRUE, allow_company_columns=TRUE) ─────────
INSERT INTO company_table_defs (id, table_key, name, icon, sort_order, is_active, is_system, allow_company_columns) VALUES
  ('00000000-0000-0000-0000-000000000001','hdld','Theo dõi HĐLĐ','ScrollText',     10, FALSE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000002','csc', 'Theo dõi HĐ KH.NCC','FileSignature',11, FALSE, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000003','nsnn','Nợ NSNN','TrendingDown',          12, FALSE, TRUE, TRUE);

-- ── COLUMNS: HĐLĐ ─────────────────────────────────────────────────────────────
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, sort_order, computed_type, computed_config) VALUES
 ('00000000-0000-0000-0000-000000000001','employee_name','Tên nhân viên','text',TRUE,0,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','tax_code','MST cá nhân','text',FALSE,1,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','contract_type','Loại HĐ','text',FALSE,2,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','contract_number','Số HĐ','text',FALSE,3,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','contract_date','Ngày HĐ','date',FALSE,4,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','end_date','Ngày kết thúc','date',FALSE,5,NULL,NULL),
 ('00000000-0000-0000-0000-000000000001','days_remaining','Ngày còn lại','computed',FALSE,6,'days_until',$j${"source_col":"end_date"}$j$::jsonb),
 ('00000000-0000-0000-0000-000000000001','status','Tình trạng','computed',FALSE,7,'status_threshold',$j${"source_col":"end_date","mode":"days_until","buckets":[{"max":0,"label":"Đã hết hạn","tone":"danger"},{"max":30,"label":"Sắp hết hạn","tone":"warning"},{"max":null,"label":"Còn hiệu lực","tone":"success"}],"null_label":"Không xác định","null_tone":"muted"}$j$::jsonb),
 ('00000000-0000-0000-0000-000000000001','notes','Ghi chú','text',FALSE,8,NULL,NULL);

-- ── COLUMNS: HĐ KH.NCC ────────────────────────────────────────────────────────
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, sort_order, computed_type, computed_config) VALUES
 ('00000000-0000-0000-0000-000000000002','contract_party','Đối tượng HĐ','text',FALSE,0,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','party_name','Tên đối tượng','text',TRUE,1,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','contract_content','Nội dung HĐ','text',FALSE,2,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','contract_number','Số HĐ','text',FALSE,3,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','contract_date','Ngày HĐ','date',FALSE,4,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','end_date','Ngày kết thúc','date',FALSE,5,NULL,NULL),
 ('00000000-0000-0000-0000-000000000002','days_remaining','Ngày còn lại','computed',FALSE,6,'days_until',$j${"source_col":"end_date"}$j$::jsonb),
 ('00000000-0000-0000-0000-000000000002','status','Tình trạng','computed',FALSE,7,'status_threshold',$j${"source_col":"end_date","mode":"days_until","buckets":[{"max":0,"label":"Đã hết hạn","tone":"danger"},{"max":30,"label":"Sắp hết hạn","tone":"warning"},{"max":null,"label":"Còn hiệu lực","tone":"success"}],"null_label":"Không thời hạn","null_tone":"muted"}$j$::jsonb),
 ('00000000-0000-0000-0000-000000000002','notes','Ghi chú','text',FALSE,8,NULL,NULL);

-- ── COLUMNS: Nợ NSNN ──────────────────────────────────────────────────────────
INSERT INTO company_table_columns (def_id, col_key, label, data_type, required, sort_order, computed_type, computed_config) VALUES
 ('00000000-0000-0000-0000-000000000003','document_type','Loại chứng từ / công việc','text',TRUE,0,NULL,NULL),
 ('00000000-0000-0000-0000-000000000003','category','Phạm trù','text',FALSE,1,NULL,NULL),
 ('00000000-0000-0000-0000-000000000003','debt_amount','Số tiền nợ NSNN','number',FALSE,2,NULL,NULL),
 ('00000000-0000-0000-0000-000000000003','update_date','Thời điểm cập nhật','date',FALSE,3,NULL,NULL),
 ('00000000-0000-0000-0000-000000000003','days_late','Số ngày chậm','computed',FALSE,4,'days_since',$j${"source_col":"update_date"}$j$::jsonb),
 ('00000000-0000-0000-0000-000000000003','repeat_count','Số lần lặp lại','number',FALSE,5,NULL,NULL),
 ('00000000-0000-0000-0000-000000000003','notes','Ghi chú','text',FALSE,6,NULL,NULL);

-- ── COPY ROWS: HĐLĐ (custom_fields là MẢNG [{name,value,type}]) ────────────────
INSERT INTO company_table_rows (def_id, company_id, data, position, created_by, created_at)
SELECT '00000000-0000-0000-0000-000000000001', lc.company_id,
  jsonb_strip_nulls(jsonb_build_object(
    'employee_name', lc.employee_name, 'tax_code', lc.tax_code,
    'contract_type', lc.contract_type, 'contract_number', lc.contract_number,
    'contract_date', lc.contract_date, 'end_date', lc.end_date, 'notes', lc.notes
  )) || CASE WHEN jsonb_typeof(lc.custom_fields) = 'array' THEN COALESCE(
    (SELECT jsonb_object_agg(e->>'name', e->>'value')
     FROM jsonb_array_elements(lc.custom_fields) e WHERE e->>'name' IS NOT NULL),
    '{}'::jsonb) ELSE '{}'::jsonb END,
  (ROW_NUMBER() OVER (PARTITION BY lc.company_id ORDER BY lc.created_at))::int - 1,
  lc.created_by, lc.created_at
FROM company_labor_contracts lc;

-- HĐLĐ: company columns từ tên custom field (distinct theo company)
INSERT INTO company_table_company_columns (def_id, company_id, col_key, label, data_type, sort_order)
SELECT '00000000-0000-0000-0000-000000000001', lc.company_id, e->>'name', e->>'name',
       COALESCE(NULLIF(e->>'type',''),'text'), 0
FROM company_labor_contracts lc,
     LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(lc.custom_fields) = 'array' THEN lc.custom_fields ELSE '[]'::jsonb END) e
WHERE e->>'name' IS NOT NULL
GROUP BY lc.company_id, e->>'name', e->>'type'
ON CONFLICT (def_id, company_id, col_key) DO NOTHING;

-- ── COPY ROWS: HĐ KH.NCC (custom_fields là OBJECT) ────────────────────────────
INSERT INTO company_table_rows (def_id, company_id, data, position, created_by, created_at)
SELECT '00000000-0000-0000-0000-000000000002', c.company_id,
  jsonb_strip_nulls(jsonb_build_object(
    'contract_party', c.contract_party, 'party_name', c.party_name,
    'contract_content', c.contract_content, 'contract_number', c.contract_number,
    'contract_date', c.contract_date, 'end_date', c.end_date, 'notes', c.notes
  )) || COALESCE(c.custom_fields, '{}'::jsonb),
  (ROW_NUMBER() OVER (PARTITION BY c.company_id ORDER BY c.created_at))::int - 1,
  c.created_by, c.created_at
FROM company_csc_contracts c;

INSERT INTO company_table_company_columns (def_id, company_id, col_key, label, data_type, sort_order)
SELECT '00000000-0000-0000-0000-000000000002', cc.company_id, cc.col_name, cc.col_name, cc.col_type, cc.position
FROM company_csc_columns cc
ON CONFLICT (def_id, company_id, col_key) DO NOTHING;

-- ── COPY ROWS: Nợ NSNN (custom_fields là OBJECT) ──────────────────────────────
INSERT INTO company_table_rows (def_id, company_id, data, position, created_by, created_at)
SELECT '00000000-0000-0000-0000-000000000003', d.company_id,
  jsonb_strip_nulls(jsonb_build_object(
    'document_type', d.document_type, 'category', d.category,
    'debt_amount', d.debt_amount, 'update_date', d.update_date,
    'repeat_count', d.repeat_count, 'notes', d.notes
  )) || COALESCE(d.custom_fields, '{}'::jsonb),
  (ROW_NUMBER() OVER (PARTITION BY d.company_id ORDER BY d.created_at))::int - 1,
  d.created_by, d.created_at
FROM company_nsnn_debts d;

INSERT INTO company_table_company_columns (def_id, company_id, col_key, label, data_type, sort_order)
SELECT '00000000-0000-0000-0000-000000000003', cc.company_id, cc.col_name, cc.col_name, cc.col_type, cc.position
FROM company_nsnn_columns cc
ON CONFLICT (def_id, company_id, col_key) DO NOTHING;
