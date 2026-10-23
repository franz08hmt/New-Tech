// TEST ONLY: isolated cluster with bootstrap OID10 named supabase_admin.
import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import {
  runtimeCapabilityCatalogDigest,
  runtimeCapabilityCatalogSnapshot,
  assertRuntimeCatalogContract,
} from "../dist/database/runtime-capability-contract.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";

test("restricted managed installer is atomic, preserves Auth and accepts only pinned runtime security", async (t) => {
  const rootUrl = assertTestDatabaseTarget(
    process.env.MANAGED_TEST_DATABASE_URL,
    { runtimeUrl: "" },
  );
  const root = new pg.Client({ connectionString: rootUrl });
  await root.connect();
  assert.deepEqual(
    (
      await root.query(
        "SELECT oid,rolsuper,rolname FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0],
    { oid: 10, rolsuper: true, rolname: "supabase_admin" },
  );
  const name = `examate_managed_${randomUUID().replaceAll("-", "")}_test`;
  await root.query(
    "CREATE ROLE postgres LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS PASSWORD 'local-maintenance-fixture-only'",
  );
  await root.query(`CREATE DATABASE "${name}" OWNER postgres`);
  const url = new URL(rootUrl);
  url.pathname = `/${name}`;
  const owner = new pg.Client({
    connectionString: assertTestDatabaseTarget(url.href, { runtimeUrl: "" }),
  });
  await owner.connect();
  const installUrl = new URL(url);
  installUrl.username = "postgres";
  installUrl.password = "local-maintenance-fixture-only";
  const installer = new pg.Client({ connectionString: installUrl.href });
  await installer.connect();
  t.after(async () => {
    await installer.end();
    await owner.end();
    assert.equal(
      (
        await root.query(
          "SELECT pg_get_userbyid(datdba) owner FROM pg_database WHERE datname=$1",
          [name],
        )
      ).rows[0]?.owner,
      "postgres",
    );
    await root.query(`DROP DATABASE "${name}"`);
    await root.query("DROP ROLE IF EXISTS managed_business,managed_auth");
    await root.query(
      "DROP ROLE examate_business,examate_auth,examate_policy_owner",
    );
    await root.query(
      "DROP ROLE postgres,supabase_auth_admin,anon,authenticated,service_role,pgbouncer",
    );
    await root.end();
  });
  await owner.query(`CREATE ROLE pgbouncer LOGIN; CREATE ROLE supabase_auth_admin NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon,authenticated;
    CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
    CREATE TABLE auth.users(id uuid PRIMARY KEY); ALTER TABLE auth.users OWNER TO supabase_auth_admin;
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
    ALTER TABLE auth.sessions OWNER TO supabase_auth_admin; ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;
    GRANT USAGE ON SCHEMA auth TO postgres,anon,authenticated,service_role;
    GRANT SELECT,REFERENCES ON auth.users TO postgres; GRANT SELECT ON auth.sessions TO postgres;
    CREATE EXTENSION vector; CREATE EXTENSION pgcrypto;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  await installer.query(
    await readFile(
      new URL("../../../infra/postgres/runtime-roles.sql", import.meta.url),
      "utf8",
    ),
  );
  const canonical = await loadMigrations();
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    PILOT_WORKSPACE_ID: randomUUID(),
  });
  await migrate(installUrl.href, {
    loadSource: async () => canonical.slice(0, 16),
  });
  const snapshot = async () =>
    (
      await owner.query(`SELECT n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,
    ARRAY(SELECT (a.attname,a.attacl)::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 ORDER BY a.attnum) columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' ORDER BY c.relname`)
    ).rows;
  const before = await snapshot();
  await installer.query(
    "CREATE POLICY unrelated_permissive ON tasks TO examate_business USING(true)",
  );
  await assert.rejects(
    migrate(installUrl.href, { profile: "supabase-managed" }),
    { code: "RUNTIME_POLICY_CONFLICT" },
  );
  assert.equal(
    (await installer.query("SELECT count(*)::int n FROM schema_migrations"))
      .rows[0].n,
    16,
  );
  await installer.query("DROP POLICY unrelated_permissive ON tasks");
  const managed = await loadMigrations(undefined, {
    profile: "supabase-managed",
  });
  await assert.rejects(
    migrate(installUrl.href, {
      profile: "supabase-managed",
      loadSource: async () =>
        managed.map((f, i) =>
          i === 24
            ? {
                ...f,
                sql:
                  f.sql +
                  "\nDO $$ BEGIN RAISE EXCEPTION 'intentional late test failure'; END $$;",
              }
            : f,
        ),
    }),
    /intentional late test failure/,
  );
  assert.equal(
    (await installer.query("SELECT count(*)::int n FROM schema_migrations"))
      .rows[0].n,
    16,
  );
  assert.equal(
    (
      await installer.query(
        "SELECT to_regprocedure('public.examate_workspace_role(uuid)') helper",
      )
    ).rows[0].helper,
    null,
  );
  assert.deepEqual(await snapshot(), before);
  await migrate(installUrl.href, { profile: "supabase-managed" });
  assert.equal(
    (
      await installer.query(
        "SELECT has_database_privilege('pgbouncer',current_database(),'CONNECT') ok",
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await installer.query(
        "SELECT has_database_privilege('anon',current_database(),'CONNECT') ok",
      )
    ).rows[0].ok,
    false,
  );
  assert.deepEqual(
    await snapshot(),
    before,
    "hosted Auth ownership/RLS/ACL unchanged",
  );
  assert.equal(
    (await installer.query("SELECT count(*)::int n FROM schema_migrations"))
      .rows[0].n,
    26,
  );
  await assert.rejects(migrate(installUrl.href), /history|profile/i);
  const digest = await runtimeCapabilityCatalogDigest(
    (s, p) => installer.query(s, p),
    26,
  );
  console.log("INDEPENDENT_MANAGED_DIGEST", digest);
  await assertRuntimeCatalogContract((s, p) => installer.query(s, p), 26);
  await installer.query(
    "CREATE ROLE managed_business LOGIN INHERIT PASSWORD 'local-runtime-fixture-only'; CREATE ROLE managed_auth LOGIN INHERIT PASSWORD 'local-runtime-fixture-only'; GRANT examate_business TO managed_business; GRANT examate_auth TO managed_auth",
  );
  const businessUrl = new URL(installUrl),
    authUrl = new URL(installUrl);
  businessUrl.username = "managed_business";
  businessUrl.password = "local-runtime-fixture-only";
  authUrl.username = "managed_auth";
  authUrl.password = "local-runtime-fixture-only";
  Object.assign(process.env, {
    DATABASE_URL: businessUrl.href,
    AUTH_DATABASE_URL: authUrl.href,
  });
  const business = new DatabaseService(),
    auth = new AuthDatabaseService();
  try {
    await business.assertBusinessCapability();
    await auth.assertCapability("examate_auth");
  } finally {
    await business.onModuleDestroy();
    await auth.onModuleDestroy();
  }
  await installer.query("GRANT examate_auth TO managed_business");
  await assert.rejects(
    assertRuntimeCatalogContract((s, p) => installer.query(s, p), 26),
  );
  await installer.query("REVOKE examate_auth FROM managed_business");
  await assertRuntimeCatalogContract((s, p) => installer.query(s, p), 26);
  const snap = await runtimeCapabilityCatalogSnapshot(
    (s, p) => installer.query(s, p),
    26,
  );
  assert.equal(
    snap[0].every((r) => r.unsafe_members === 0),
    true,
  );
  await installer.query(
    "GRANT examate_policy_owner TO postgres WITH INHERIT TRUE, SET TRUE",
  );
  await assert.rejects(
    assertRuntimeCatalogContract((s, p) => installer.query(s, p), 26),
  );
  await installer.query(
    "REVOKE examate_policy_owner FROM postgres GRANTED BY postgres",
  );
  await assertRuntimeCatalogContract((s, p) => installer.query(s, p), 26);
});
