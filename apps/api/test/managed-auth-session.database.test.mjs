import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";
import {
  openDocumentsTenantFixture,
  people,
} from "./documents-tenant-fixture.mjs";
import { AuthStore } from "../dist/auth/auth-store.js";
import { runtimeCapabilityCatalogSnapshot } from "../dist/database/runtime-capability-contract.js";
import { rollbackManagedAuthSession } from "../scripts/managed-auth-session-rollback.mjs";
import {
  loadMigrations,
  applyMigrationInTransaction,
} from "../scripts/migrate.mjs";

test("managed Auth RLS stays enabled while the runtime verifies only session/user/expiry", async (t) => {
  const f = await openDocumentsTenantFixture(),
    role = `auth_bridge_${randomBytes(8).toString("hex")}`,
    password = randomBytes(24).toString("hex");
  let db;
  t.after(async () => {
    await db?.end();
    await f.admin.query(`REVOKE examate_auth FROM "${role}"`);
    await f.admin.query(`DROP ROLE "${role}"`);
    await f.close();
  });
  await f.admin.query(
    `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE; GRANT examate_auth TO "${role}"`,
  );
  const url = new URL(f.admin.options.connectionString);
  url.username = role;
  url.password = password;
  db = new pg.Pool({ connectionString: f.guard(url.href), max: 1 });
  const sid = randomUUID(),
    expired = randomUUID(),
    uid = Object.values(people)[0],
    other = Object.values(people)[1];
  await f.admin.query("ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY");
  await f.admin.query(
    "INSERT INTO auth.sessions(id,user_id,not_after) VALUES($1,$2,now()+interval '1 hour'),($3,$2,now()-interval '1 hour')",
    [sid, uid, expired],
  );
  const store = new AuthStore(db);
  assert.equal(
    await store.authSessionActive(sid, uid),
    true,
    "valid managed Auth session must not disappear behind RLS",
  );
  assert.equal(await store.authSessionActive(sid, other), false);
  assert.equal(await store.authSessionActive(expired, uid), false);
  assert.equal(await store.authSessionActive(randomUUID(), uid), false);
  assert.equal(
    await store.authSessionActive(sid, uid),
    true,
    "pool reuse after denial remains scoped",
  );
  await assert.rejects(db.query("SELECT id FROM auth.sessions"), {
    code: "42501",
  });
  const flags = (
    await f.admin.query(
      "SELECT relrowsecurity FROM pg_class WHERE oid='auth.sessions'::regclass",
    )
  ).rows[0];
  assert.equal(flags.relrowsecurity, true);
  const denied = (
    await f.admin.query(
      "SELECT has_function_privilege('examate_business','examate_private.auth_session_active(uuid,uuid)','EXECUTE') business,has_function_privilege('anon','examate_private.auth_session_active(uuid,uuid)','EXECUTE') anon,has_function_privilege('authenticated','examate_private.auth_session_active(uuid,uuid)','EXECUTE') authenticated",
    )
  ).rows[0];
  assert.deepEqual(denied, {
    business: false,
    anon: false,
    authenticated: false,
  });
  const acl = (
    await runtimeCapabilityCatalogSnapshot((s, p) => f.admin.query(s, p))
  )[6];
  const compare = (a, b) => {
    for (const field of [
      "relname",
      "attname",
      "grantee",
      "privilege_type",
      "is_grantable",
    ]) {
      const x = String(a[field]),
        y = String(b[field]);
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  };
  assert.deepEqual(
    acl,
    [...acl].sort(compare),
    "ACL fingerprint must not depend on physical column order",
  );
  const dry = await rollbackManagedAuthSession({
    connectionString: f.admin.options.connectionString,
    runtimeUrl: process.env.TEST_DATABASE_URL,
  });
  assert.equal(dry.dryRun, true);
  assert.equal(
    await store.authSessionActive(sid, uid),
    true,
    "dry run changes nothing",
  );
  await rollbackManagedAuthSession({
    connectionString: f.admin.options.connectionString,
    apply: true,
    runtimeUrl: process.env.TEST_DATABASE_URL,
  });
  const source = (await loadMigrations()).find(
    (f) => f.name === "025_managed_auth_session_verifier.sql",
  );
  await f.admin.query("BEGIN");
  await applyMigrationInTransaction(f.admin, source);
  await f.admin.query("COMMIT");
  assert.equal(
    await store.authSessionActive(sid, uid),
    true,
    "reapply restores only bounded verifier",
  );
  assert.equal(
    (
      await f.admin.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid='auth.sessions'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  let commits = 0;
  await assert.rejects(
    rollbackManagedAuthSession({
      connectionString: f.admin.options.connectionString,
      apply: true,
      runtimeUrl: process.env.TEST_DATABASE_URL,
      clientFactory: (target) => {
        const client = new pg.Client({ connectionString: target });
        const query = client.query.bind(client);
        client.query = async (...args) => {
          const result = await query(...args);
          if (args[0] === "COMMIT") {
            commits++;
            throw Object.assign(new Error("synthetic lost acknowledgement"), {
              code: "ECONNRESET",
            });
          }
          return result;
        };
        return client;
      },
    }),
    /AUTH_VERIFIER_ROLLBACK_OUTCOME_UNKNOWN_INSPECT_LEDGER/,
  );
  assert.equal(commits, 1, "lost ACK must not replay the committed rollback");
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int n FROM schema_migrations WHERE name=$1",
        [source.name],
      )
    ).rows[0].n,
    0,
  );
  await f.admin.query("BEGIN");
  await applyMigrationInTransaction(f.admin, source);
  await f.admin.query("COMMIT");
  assert.equal(await store.authSessionActive(sid, uid), true);
});
