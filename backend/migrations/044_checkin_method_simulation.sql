-- Add 'simulation' to checkin_method enum for dev simulation API
ALTER TYPE checkin_method ADD VALUE IF NOT EXISTS 'simulation';
