-- Migration 072: convert tasks.source from ENUM (task_source) to TEXT.
-- Task sources become fully metadata-driven via enum_options, so admins can add
-- new sources from Settings without a schema change, and filtering by a new
-- source no longer fails the `::task_source` cast.

ALTER TABLE tasks ALTER COLUMN source DROP DEFAULT;
ALTER TABLE tasks ALTER COLUMN source TYPE TEXT USING source::text;
ALTER TABLE tasks ALTER COLUMN source SET DEFAULT 'manual';

DROP TYPE IF EXISTS task_source;
