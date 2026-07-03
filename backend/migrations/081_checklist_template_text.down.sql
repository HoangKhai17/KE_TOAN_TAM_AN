-- Rollback 081 (có thể lỗi nếu dữ liệu > 300 ký tự)
ALTER TABLE task_type_checklist_templates ALTER COLUMN step_text TYPE VARCHAR(300);
