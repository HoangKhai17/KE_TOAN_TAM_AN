DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_doc_status') THEN
    CREATE TYPE client_doc_status AS ENUM ('pending', 'received', 'not_required', 'overdue');
  END IF;
END
$$;
