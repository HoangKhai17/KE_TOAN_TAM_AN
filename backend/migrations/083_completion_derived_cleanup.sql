-- Phương án B: phân biệt "Hoàn thành trước/trễ hạn" là DẪN XUẤT (completed_at vs due_date),
-- KHÔNG phải giá trị enum riêng. Dọn lại metadata danh mục cho nhất quán:
--   1) Gỡ option 'completed_demurrage' (chỉ là nhãn metadata, không phải giá trị PG enum thật).
--   2) Đưa nhãn 'completed' về trung tính "Hoàn thành" (nhãn trước/trễ hạn được suy ra ở tầng hiển thị).

DELETE FROM enum_options
WHERE option_key = 'completed_demurrage'
  AND type_id = (SELECT id FROM enum_types WHERE type_key = 'task_status');

UPDATE enum_options
SET label = 'Hoàn thành'
WHERE option_key = 'completed'
  AND type_id = (SELECT id FROM enum_types WHERE type_key = 'task_status');
