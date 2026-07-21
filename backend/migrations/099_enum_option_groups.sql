-- NHÓM LỰA CHỌN TRONG DANH MỤC
--
-- Nhu cầu: bộ lọc "Loại hình" ở danh sách khách hàng cần gom nhóm — Công ty TNHH,
-- Cổ phần, DN tư nhân là "Doanh nghiệp"; Hộ kinh doanh là một nhóm riêng. Sau này
-- thêm loại hình mới thì quản trị tự gán vào nhóm, KHÔNG cần lập trình viên.
--
-- Thiết kế:
--   · enum_option_groups — danh sách nhóm của từng danh mục
--   · enum_options.group_id — mỗi lựa chọn thuộc TỐI ĐA MỘT nhóm (NULL = chưa gán)
--   · enum_types.has_groups — cờ bật tính năng nhóm cho danh mục đó
--
-- Vì sao "một lựa chọn = một nhóm" (không phải nhiều-nhiều): một công ty không thể
-- vừa là doanh nghiệp vừa là hộ kinh doanh. Nếu sau này thật sự cần nhiều nhóm thì
-- nâng lên bảng nối, không phải làm lại từ đầu.
--
-- AN TOÀN với 22 danh mục còn lại: cột mới cho phép NULL, cờ has_groups mặc định
-- FALSE, và không truy vấn nào trong hệ thống dùng SELECT * trên enum_options —
-- nên hành vi hiện tại giữ nguyên 100%.

CREATE TABLE enum_option_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id     UUID NOT NULL REFERENCES enum_types(id) ON DELETE CASCADE,
  group_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (type_id, group_key)
);

CREATE INDEX idx_enum_option_groups_type ON enum_option_groups (type_id, sort_order);

-- Xoá nhóm → các lựa chọn trong nhóm trở về "chưa gán", KHÔNG bị xoá theo.
-- Nhóm chỉ là cách gom lại để lọc; xoá nhóm không được làm mất lựa chọn.
ALTER TABLE enum_options
  ADD COLUMN group_id UUID REFERENCES enum_option_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_enum_options_group ON enum_options (group_id);

ALTER TABLE enum_types
  ADD COLUMN has_groups BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Bật nhóm cho Loại hình doanh nghiệp + tạo 2 nhóm ban đầu ─────────────────
UPDATE enum_types SET has_groups = TRUE WHERE type_key = 'business_type';

INSERT INTO enum_option_groups (type_id, group_key, label, sort_order)
SELECT id, 'doanh_nghiep', 'Doanh nghiệp', 0 FROM enum_types WHERE type_key = 'business_type';

INSERT INTO enum_option_groups (type_id, group_key, label, sort_order)
SELECT id, 'ho_kinh_doanh', 'Hộ kinh doanh', 1 FROM enum_types WHERE type_key = 'business_type';

-- Gán các loại hình đang có vào nhóm tương ứng
UPDATE enum_options eo
   SET group_id = g.id
  FROM enum_option_groups g
  JOIN enum_types t ON t.id = g.type_id
 WHERE eo.type_id = t.id
   AND t.type_key = 'business_type'
   AND g.group_key = 'doanh_nghiep'
   AND eo.option_key IN ('TNHH', 'CP', 'DN_TU_NHAN');

UPDATE enum_options eo
   SET group_id = g.id
  FROM enum_option_groups g
  JOIN enum_types t ON t.id = g.type_id
 WHERE eo.type_id = t.id
   AND t.type_key = 'business_type'
   AND g.group_key = 'ho_kinh_doanh'
   AND eo.option_key = 'HKD';
