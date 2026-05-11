-- 028: Thêm UNIQUE constraint trên task_types.name
-- Trước khi thêm constraint, tự động dọn dẹp bất kỳ duplicate nào còn tồn tại.

DO $$
DECLARE
  r              RECORD;
  v_canonical_id UUID;
  v_dup_ids      UUID[];
BEGIN
  FOR r IN
    SELECT name FROM task_types
    GROUP BY name HAVING COUNT(*) > 1
    ORDER BY name
  LOOP
    SELECT id INTO v_canonical_id
    FROM task_types
    WHERE name = r.name
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    SELECT ARRAY_AGG(id) INTO v_dup_ids
    FROM task_types
    WHERE name = r.name AND id <> v_canonical_id;

    UPDATE tasks
    SET task_type_id = v_canonical_id
    WHERE task_type_id = ANY(v_dup_ids);

    UPDATE customer_task_schedules
    SET task_type_id = v_canonical_id
    WHERE task_type_id = ANY(v_dup_ids);

    UPDATE task_type_checklist_templates AS dup
    SET task_type_id = v_canonical_id
    WHERE dup.task_type_id = ANY(v_dup_ids)
      AND NOT EXISTS (
        SELECT 1 FROM task_type_checklist_templates canon
        WHERE canon.task_type_id = v_canonical_id
          AND canon.step_order = dup.step_order
      );
    DELETE FROM task_type_checklist_templates
    WHERE task_type_id = ANY(v_dup_ids);

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

    DELETE FROM task_types
    WHERE id = ANY(v_dup_ids);
  END LOOP;
END;
$$;

ALTER TABLE task_types
  ADD CONSTRAINT task_types_name_key UNIQUE (name);
