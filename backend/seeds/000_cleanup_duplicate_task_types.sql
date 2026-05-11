-- ─────────────────────────────────────────────────────────────────────────────
-- 000_cleanup_duplicate_task_types.sql
-- Xoá các loại công việc trùng tên, giữ lại bản cũ nhất (created_at nhỏ nhất).
-- Tất cả FK references (tasks, schedules, checklists, custom fields)
-- được chuyển sang bản canonical trước khi xoá bản trùng.
-- Idempotent: nếu không có duplicate thì không làm gì cả.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r              RECORD;
  v_canonical_id UUID;
  v_dup_ids      UUID[];
  v_count        INT := 0;
BEGIN
  RAISE NOTICE '=== Bắt đầu cleanup duplicate task_types ===';

  FOR r IN
    SELECT name, COUNT(*) AS cnt
    FROM task_types
    GROUP BY name
    HAVING COUNT(*) > 1
    ORDER BY name
  LOOP
    -- Lấy ID bản cũ nhất làm canonical
    SELECT id INTO v_canonical_id
    FROM task_types
    WHERE name = r.name
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    -- Danh sách ID cần xoá
    SELECT ARRAY_AGG(id) INTO v_dup_ids
    FROM task_types
    WHERE name = r.name AND id <> v_canonical_id;

    RAISE NOTICE '  [%] % bản trùng — canonical: %, xoá: %',
      r.name, r.cnt - 1, v_canonical_id, v_dup_ids;

    -- Chuyển tasks sang canonical
    UPDATE tasks
    SET task_type_id = v_canonical_id
    WHERE task_type_id = ANY(v_dup_ids);

    -- Chuyển customer_task_schedules sang canonical
    UPDATE customer_task_schedules
    SET task_type_id = v_canonical_id
    WHERE task_type_id = ANY(v_dup_ids);

    -- Chuyển task_type_checklist_templates sang canonical
    -- (nếu canonical đã có cùng step_order thì bỏ qua để tránh conflict)
    UPDATE task_type_checklist_templates AS dup
    SET task_type_id = v_canonical_id
    WHERE dup.task_type_id = ANY(v_dup_ids)
      AND NOT EXISTS (
        SELECT 1 FROM task_type_checklist_templates canon
        WHERE canon.task_type_id = v_canonical_id
          AND canon.step_order = dup.step_order
      );

    -- Xoá checklist items của bản trùng còn sót (đã có canon)
    DELETE FROM task_type_checklist_templates
    WHERE task_type_id = ANY(v_dup_ids);

    -- Chuyển task_type_custom_field_schemas sang canonical
    UPDATE task_type_custom_field_schemas AS dup
    SET task_type_id = v_canonical_id
    WHERE dup.task_type_id = ANY(v_dup_ids)
      AND NOT EXISTS (
        SELECT 1 FROM task_type_custom_field_schemas canon
        WHERE canon.task_type_id = v_canonical_id
          AND canon.field_key = dup.field_key
      );

    DELETE FROM task_type_custom_field_schemas
    WHERE task_type_id = ANY(v_dup_ids);

    -- Xoá các bản trùng
    DELETE FROM task_types
    WHERE id = ANY(v_dup_ids);

    v_count := v_count + array_length(v_dup_ids, 1);
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '  Không tìm thấy duplicate nào. DB đã sạch.';
  ELSE
    RAISE NOTICE '  Đã xoá % bản trùng.', v_count;
  END IF;

  RAISE NOTICE '=== Cleanup hoàn tất ===';
END;
$$;
