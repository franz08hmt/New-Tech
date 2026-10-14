-- Server issuance/ownership only. Deliberately no question or answer content.
CREATE TABLE assistant_answer_receipts (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('general','documents','workspace')),
  request_id UUID NOT NULL,
  snapshot_hash TEXT NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX assistant_answer_receipts_owner_idx
  ON assistant_answer_receipts(workspace_id,user_id,created_at);
ALTER TABLE assistant_feedback
  ADD COLUMN receipt_id UUID REFERENCES assistant_answer_receipts(id) ON DELETE RESTRICT,
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
-- Existing feedback stays unattributed; do not guess its sender.
ALTER TABLE assistant_answer_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON assistant_answer_receipts FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON assistant_answer_receipts FROM %I',r);
    END IF;
  END LOOP;
END $$;
