// TEST ONLY. Never apply this fixture, role or policies to Supabase.
// Server-table policies test SQL with a non-owner, NOT tenant authorization.
export const runtimeRole = "examate_b0d_runtime_fixture";
export const runtimePassword = "local-runtime-fixture-only";
const marker = "ExaMate B0d disposable SQL fixture; NOT Supabase Auth";
export async function prepareAuthFixture(pool) {
  const existing = await pool.query(
    "SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname='auth'",
  );
  if (existing.rows.length && existing.rows[0].marker !== marker)
    throw new Error(
      "Refusing to modify an auth schema not owned by this test fixture",
    );
  await pool.query(`CREATE SCHEMA IF NOT EXISTS auth;
    COMMENT ON SCHEMA auth IS '${marker}';
    CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS auth.sessions (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES auth.users(id), not_after TIMESTAMPTZ);
    REVOKE ALL ON SCHEMA auth FROM PUBLIC;
    REVOKE ALL ON auth.users,auth.sessions FROM PUBLIC;`);
}
export async function prepareRuntimeFixture(pool) {
  // These legacy rollback tests intentionally stop at 013/016. Install only
  // the current AuthStore's boolean verifier as test infrastructure, not a
  // forged migration entry or a production fallback to direct Auth reads.
  const bridge = await pool.query(
    "SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname='examate_private'",
  );
  if (bridge.rows.length && bridge.rows[0].marker !== marker)
    throw new Error("Refusing to modify an unrelated private Auth schema");
  await pool.query(`CREATE SCHEMA IF NOT EXISTS examate_private;
    COMMENT ON SCHEMA examate_private IS '${marker}';
    REVOKE ALL ON SCHEMA examate_private FROM PUBLIC;
    CREATE OR REPLACE FUNCTION examate_private.auth_session_active(session_id uuid, owner_id uuid)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=session_id AND s.user_id=owner_id
        AND (s.not_after IS NULL OR s.not_after>now()));
    $$;
    REVOKE ALL ON FUNCTION examate_private.auth_session_active(uuid,uuid) FROM PUBLIC;`);
  const existing = await pool.query(
    "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
    [runtimeRole],
  );
  if (existing.rows.length && existing.rows[0].marker !== marker)
    throw new Error("Refusing to modify an unrelated runtime role");
  if (!existing.rows.length)
    await pool.query(`CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      COMMENT ON ROLE ${runtimeRole} IS '${marker}';`);
  await pool.query(`GRANT USAGE ON SCHEMA public,auth TO ${runtimeRole};
    GRANT USAGE ON SCHEMA examate_private TO ${runtimeRole};
    GRANT EXECUTE ON FUNCTION examate_private.auth_session_active(uuid,uuid) TO ${runtimeRole};
    GRANT SELECT(id,user_id,not_after) ON auth.sessions TO ${runtimeRole};
    GRANT SELECT ON workspaces,workspace_memberships TO ${runtimeRole};
    GRANT SELECT,INSERT,UPDATE ON pilot_sessions,pilot_auth_limits TO ${runtimeRole};
    GRANT SELECT,INSERT ON pilot_refresh_attempts TO ${runtimeRole};`);
  for (const [table, command] of [
    ["workspaces", "SELECT"],
    ["workspace_memberships", "SELECT"],
    ["pilot_sessions", "ALL"],
    ["pilot_auth_limits", "ALL"],
    ["pilot_refresh_attempts", "ALL"],
  ]) {
    const policy = await pool.query(
      "SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=$1 AND policyname='b0d_backend_fixture'",
      [table],
    );
    if (!policy.rows.length)
      await pool.query(
        `CREATE POLICY b0d_backend_fixture ON ${table} FOR ${command} TO ${runtimeRole} USING (true) ${command === "ALL" ? "WITH CHECK (true)" : ""}`,
      );
  }
}
