-- Ephemeral server-side Google PKCE attempts. No provider tokens or raw code.
CREATE TABLE pilot_oauth_attempts (
 prelogin_hash TEXT PRIMARY KEY REFERENCES pilot_sessions(cookie_hash) ON DELETE CASCADE,
 attempt_hash TEXT NOT NULL UNIQUE CHECK(attempt_hash ~ '^[0-9a-f]{64}$'),
 provider TEXT NOT NULL CHECK(provider='google'),
 origin TEXT NOT NULL CHECK(octet_length(origin)<=2048),
 verifier JSONB CHECK(verifier IS NULL OR (jsonb_typeof(verifier)='object' AND octet_length(verifier::text)<=4096)),
 expires_at TIMESTAMPTZ NOT NULL,
 claimed_at TIMESTAMPTZ,
 CHECK((claimed_at IS NULL AND verifier IS NOT NULL) OR (claimed_at IS NOT NULL AND verifier IS NULL))
);
CREATE INDEX pilot_oauth_attempts_expiry ON pilot_oauth_attempts(expires_at);
ALTER TABLE pilot_oauth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pilot_oauth_attempts FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON pilot_oauth_attempts FROM %I',r);
  END IF;
 END LOOP;
END $$;
