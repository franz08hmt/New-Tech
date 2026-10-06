-- Stage 1b admission counters; no membership/user seed or business-data backfill.
CREATE TABLE pilot_auth_limits (
 key TEXT NOT NULL CHECK(key ~ '^[0-9a-f]{64}$'),
 window_started TIMESTAMPTZ NOT NULL,
 hits INTEGER NOT NULL CHECK(hits > 0 AND hits <= 10000),
 PRIMARY KEY(key,window_started)
);
-- Durable intent survives an uncertain refresh transaction COMMIT. No tokens stored.
CREATE TABLE pilot_refresh_attempts (
 cookie_hash TEXT NOT NULL CHECK(cookie_hash ~ '^[0-9a-f]{64}$'),
 version INTEGER NOT NULL CHECK(version>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(cookie_hash,version)
);
-- No FK: the independently committed intent must not wait on the session row lock.
ALTER TABLE pilot_auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_refresh_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pilot_auth_limits,pilot_refresh_attempts FROM PUBLIC;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON pilot_auth_limits,pilot_refresh_attempts FROM %I',r);
  END IF;
 END LOOP;
END $$;
