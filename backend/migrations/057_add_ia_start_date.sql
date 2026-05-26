-- Add start_date column to internal_assignments
ALTER TABLE internal_assignments ADD COLUMN IF NOT EXISTS start_date DATE;
