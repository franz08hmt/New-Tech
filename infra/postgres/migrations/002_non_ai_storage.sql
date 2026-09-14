-- Existing tables/data remain intact. Old metadata is not evidence of a stored PDF.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_status VARCHAR(20) NOT NULL DEFAULT 'legacy';
ALTER TABLE documents ALTER COLUMN storage_status SET DEFAULT 'stored';
ALTER TABLE documents ADD CONSTRAINT documents_storage_status_check CHECK (storage_status IN ('legacy', 'stored', 'deleting'));
ALTER TABLE documents ADD CONSTRAINT documents_size_check CHECK (
  storage_status = 'legacy' OR (size_bytes IS NOT NULL AND size_bytes BETWEEN 5 AND 10485760)
);
ALTER TABLE tasks ADD CONSTRAINT tasks_trimmed_title_check CHECK (char_length(btrim(title)) BETWEEN 3 AND 160) NOT VALID;
-- NOT VALID preserves any bad legacy rows; new INSERT/UPDATE still enforces this rule.
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS tasks_status_due_date_idx ON tasks (status, due_date);

-- No browser access via Supabase Data API. Backend SQL uses its DB role.
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tasks, documents, document_chunks, ai_evaluations FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON tasks, documents, document_chunks, ai_evaluations FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
