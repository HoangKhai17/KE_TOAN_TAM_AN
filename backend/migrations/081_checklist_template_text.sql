-- Migration 081: Cho phép checklist mẫu nhiều dòng (dài hơn)
-- step_text: VARCHAR(300) → TEXT (khớp task_checklist_items.step_text đã là TEXT)
ALTER TABLE task_type_checklist_templates ALTER COLUMN step_text TYPE TEXT;
