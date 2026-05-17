-- Attendance module v2: new ENUM types
DO $$ BEGIN CREATE TYPE attendance_status AS ENUM (
  'present','late','early_leave','late_and_early',
  'absent','on_leave','business_trip','wfh','holiday','unscheduled'
); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE shift_type AS ENUM (
  'fixed','flexible'
); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE checkin_method AS ENUM (
  'web','mobile','manual'
); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE attendance_log_type AS ENUM (
  'check_in','check_out'
); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE leave_type AS ENUM (
  'annual','sick','compensatory','unpaid','business_trip','wfh'
); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE request_status AS ENUM (
  'pending','approved','rejected','cancelled'
); EXCEPTION WHEN duplicate_object THEN null; END $$;
