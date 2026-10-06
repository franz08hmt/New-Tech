-- Stage 1 access gate only. No workspace/user seed or existing-data backfill.
CREATE TABLE workspaces (
 id UUID PRIMARY KEY, active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE workspace_memberships (
 workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 role TEXT NOT NULL CHECK(role IN ('manager','member','viewer')),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE pilot_sessions (
 cookie_hash TEXT PRIMARY KEY CHECK(cookie_hash ~ '^[0-9a-f]{64}$'),
 kind TEXT NOT NULL CHECK(kind IN ('prelogin','authenticated')),
 user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 auth_session_id UUID,
 csrf_token TEXT NOT NULL CHECK(csrf_token ~ '^[A-Za-z0-9_-]{43}$'),
 tokens JSONB CHECK(tokens IS NULL OR (jsonb_typeof(tokens)='object' AND octet_length(tokens::TEXT)<=65536)),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 idle_expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 CHECK(idle_expires_at<=expires_at),
 CHECK((kind='prelogin' AND user_id IS NULL AND tokens IS NULL AND auth_session_id IS NULL) OR (kind='authenticated' AND tokens IS NOT NULL AND auth_session_id IS NOT NULL))
);
CREATE INDEX pilot_sessions_expiry ON pilot_sessions(expires_at);
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON workspaces,workspace_memberships,pilot_sessions FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON workspaces,workspace_memberships,pilot_sessions FROM %I',r);
  END IF;
 END LOOP;
END $$;
