-- ============================================================================
-- BACKFILL source_step_id / source_parent_id cho task_checklist_items CŨ.
-- Chạy MỘT LẦN, ngay sau migration 089. Idempotent (chỉ đụng dòng còn NULL).
--
-- Đối chiếu item cũ về mẫu theo (step_order + step_text). step_order là UNIQUE
-- trong mỗi task_type nên khớp tối đa 1 bước mẫu. Item không khớp (mẫu đã đổi tên
-- trước khi backfill) → để NULL, báo cáo coi như "bước riêng".
-- ============================================================================

-- 1) Gán source_step_id: khớp về bước mẫu cùng step_order + step_text
UPDATE task_checklist_items ci
SET source_step_id = tct.id
FROM tasks t
JOIN task_type_checklist_templates tct ON tct.task_type_id = t.task_type_id
WHERE ci.task_id = t.id
  AND ci.source_step_id IS NULL
  AND tct.step_order = ci.step_order
  AND tct.step_text  = ci.step_text;

-- 2) Gán source_parent_id: với bước con (level 1) đã có source_step_id,
--    lấy id bước mẫu level-0 gần nhất phía trước trong cùng task_type.
WITH parent_map AS (
  SELECT c.id AS child_id,
         (SELECT p.id FROM task_type_checklist_templates p
          WHERE p.task_type_id = c.task_type_id
            AND p.level = 0 AND p.step_order < c.step_order
          ORDER BY p.step_order DESC LIMIT 1) AS parent_id
  FROM task_type_checklist_templates c
  WHERE c.level = 1
)
UPDATE task_checklist_items ci
SET source_parent_id = pm.parent_id
FROM parent_map pm
WHERE ci.source_step_id = pm.child_id
  AND ci.source_parent_id IS NULL;
