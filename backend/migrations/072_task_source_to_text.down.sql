-- Rollback 072: recreate the task_source ENUM and convert the column back.
-- NOTE: this fails if any task.source holds a value outside ('auto','manual')
-- — clean up custom sources before rolling back.

CREATE TYPE task_source AS ENUM ('auto', 'manual');

ALTER TABLE tasks ALTER COLUMN source DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN source TYPE task_source USING source::task_source;
ALTER TABLE tasks ALTER COLUMN source SET DEFAULT 'manual';
