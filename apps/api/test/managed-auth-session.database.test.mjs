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
import {
  assertRuntimeCatalogContract,
  runtimeCapabilityCatalogSnapshot,
} from "../dist/database/runtime-capability-contract.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { rollbackManagedAuthSession } from "../scripts/managed-auth-session-rollback.mjs";
import { runPilotRollback024 } from "../scripts/pilot-rollback-024.mjs";
import {
  loadMigrations,
  applyMigrationInTransaction,
} from "../scripts/migrate.mjs";

test("managed Auth RLS stays enabled while the runtime verifies only session/user/expiry", async (t) => {
  const f = await openDocumentsTenantFixture(),
    role = `auth_bridge_${randomBytes(8).toString("hex")}`,
    password = randomBytes(24).toString("hex"),
    platformRolesCreated = [];
  let db;
  t.after(async () => {
    await db?.end();
    await f.admin.query(`REVOKE examate_auth FROM "${role}"`);
    await f.admin.query(`DROP ROLE "${role}"`);
    for (const platformRole of platformRolesCreated)
      await f.admin.query(`DROP ROLE ${platformRole}`);
    await f.close();
  });
  // A pristine PostgreSQL image has no Supabase API roles. Create only the
  // NOLOGIN identities this fixture needs to prove that the bridge denies them.
  f.guard(f.admin.options.connectionString);
  for (const platformRole of ["anon", "authenticated"]) {
    const existing = await f.admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [platformRole],
    );
    if (!existing.rowCount) {
      await f.admin.query(`CREATE ROLE ${platformRole} NOLOGIN`);
      platformRolesCreated.push(platformRole);
    }
  }
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
      // Hosted API roles are optional on a clean PostgreSQL fixture. Check
      // their effective privileges when present, and always check PUBLIC so
      // absence cannot hide an accidentally public SECURITY DEFINER function.
      `SELECT has_function_privilege('examate_business','examate_private.auth_session_active(uuid,uuid)','EXECUTE') business,
        COALESCE((SELECT has_function_privilege(oid,'examate_private.auth_session_active(uuid,uuid)','EXECUTE') FROM pg_roles WHERE rolname='anon'),false) anon,
        COALESCE((SELECT has_function_privilege(oid,'examate_private.auth_session_active(uuid,uuid)','EXECUTE') FROM pg_roles WHERE rolname='authenticated'),false) authenticated,
        EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
          WHERE p.oid='examate_private.auth_session_active(uuid,uuid)'::regprocedure
            AND a.grantee=0 AND a.privilege_type='EXECUTE') public_execute`,
    )
  ).rows[0];
  assert.deepEqual(denied, {
    business: false,
    anon: false,
    authenticated: false,
    public_execute: false,
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
  const rollbackClient = await f.admin.connect();
  try {
    await assert.rejects(
      runPilotRollback024(
        rollbackClient,
        { apply: false },
        { databaseName: f.name },
      ),
      /exact 001-024 migration chain/,
    );
  } finally {
    rollbackClient.release();
  }
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

test("hosted platform administration does not change runtime data capabilities", async (t) => {
  const f = await openDocumentsTenantFixture();
  f.guard(f.admin.options.connectionString);
  const parentUrl = f.guard(process.env.TEST_DATABASE_URL);
  const suffix = randomBytes(8).toString("hex");
  const roles = {
    business: `platform_biz_${suffix}`,
    auth: `platform_auth_${suffix}`,
    operator: `platform_admin_${suffix}`,
  };
  const passwords = {
    business: randomBytes(24).toString("hex"),
    auth: randomBytes(24).toString("hex"),
  };
  const created = [];
  let business, auth;
  t.after(async () => {
    await business?.onModuleDestroy();
    await auth?.onModuleDestroy();
    for (const role of created) await f.admin.query(`DROP OWNED BY "${role}"`);
    await f.close();
    const parent = new pg.Pool({ connectionString: parentUrl, max: 1 });
    try {
      for (const role of created.reverse())
        await parent.query(`DROP ROLE "${role}"`);
    } finally {
      await parent.end();
    }
  });

  // Keep this reproduction about platform metadata; Windows line endings have
  // their own regression below. Rewriting these fixture-only functions retains
  // their owners and ACLs.
  const definitions = await f.admin.query(
    `SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
     WHERE p.oid IN ('public.examate_workspace_role(uuid)'::regprocedure,
       'examate_private.auth_session_active(uuid,uuid)'::regprocedure)`,
  );
  for (const { definition } of definitions.rows)
    await f.admin.query(definition.replace(/\r\n/g, "\n"));
  const query = (sql, values) => f.admin.query(sql, values);
  await assertRuntimeCatalogContract(query);
  for (const capability of ["business", "auth"]) {
    const role = roles[capability];
    await f.admin.query(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${passwords[capability]}' INHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
    created.push(role);
    await f.admin.query(`GRANT examate_${capability} TO "${role}"`);
    const url = new URL(f.admin.options.connectionString);
    url.username = role;
    url.password = passwords[capability];
    process.env[
      capability === "business" ? "DATABASE_URL" : "AUTH_DATABASE_URL"
    ] = f.guard(url.href);
  }
  business = new DatabaseService();
  auth = new AuthDatabaseService();
  await business.assertBusinessCapability();
  await auth.assertCapability("examate_auth");

  await f.admin.query(
    `CREATE ROLE "${roles.operator}" LOGIN INHERIT NOSUPERUSER BYPASSRLS CREATEDB CREATEROLE REPLICATION`,
  );
  created.push(roles.operator);
  for (const capability of [
    "examate_business",
    "examate_auth",
    "examate_policy_owner",
  ])
    await f.admin.query(
      `GRANT ${capability} TO "${roles.operator}" WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
    );
  for (const role of ["anon", "authenticated"]) {
    const existing = await f.admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (!existing.rowCount) {
      await f.admin.query(`CREATE ROLE ${role} NOLOGIN`);
      created.push(role);
    }
    await f.admin.query(`GRANT USAGE ON SCHEMA public,auth TO ${role}`);
  }
  await f.admin.query(
    `GRANT USAGE ON SCHEMA public,auth TO "${roles.operator}";
     GRANT ALL ON auth.sessions TO "${roles.operator}";
     ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY`,
  );
  const cannotAssumeRuntime = await f.admin.query(
    `SELECT pg_has_role($1,'examate_business','USAGE') AS inherits_business,
      pg_has_role($1,'examate_business','SET') AS sets_business,
      pg_has_role($1,'examate_auth','USAGE') AS inherits_auth,
      pg_has_role($1,'examate_auth','SET') AS sets_auth`,
    [roles.operator],
  );
  assert.deepEqual(cannotAssumeRuntime.rows[0], {
    inherits_business: false,
    sets_business: false,
    inherits_auth: false,
    sets_auth: false,
  });
  await assertRuntimeCatalogContract(query);
  await business.assertBusinessCapability();
  await auth.assertCapability("examate_auth");
  for (const service of [business, auth])
    await assert.rejects(service.query("SELECT id FROM auth.sessions"), {
      code: "42501",
    });
  assert.equal(
    (
      await auth.query(
        "SELECT examate_private.auth_session_active(gen_random_uuid(),gen_random_uuid()) AS active",
      )
    ).rows[0].active,
    false,
  );
  const historic = await runtimeCapabilityCatalogSnapshot(query, 24);
  assert.ok(historic[0].every((role) => role.unsafe_members > 0));
  assert.ok(
    historic[7].some(
      (acl) => acl.grantee === "anon" && acl.privilege_type === "USAGE",
    ),
    "historical catalog contracts retain their original scope",
  );

  const rejectedChanges = [
    [
      "administrator can inherit a runtime group",
      `GRANT examate_business TO "${roles.operator}" WITH INHERIT TRUE`,
    ],
    [
      "administrator can SET a runtime group",
      `GRANT examate_auth TO "${roles.operator}" WITH SET TRUE`,
    ],
    [
      "administrator membership has no ADMIN option",
      `GRANT examate_policy_owner TO "${roles.operator}" WITH ADMIN FALSE`,
    ],
    [
      "ordinary login receives runtime ADMIN",
      `CREATE ROLE "platform_rogue_${suffix}" LOGIN INHERIT;
       GRANT examate_auth TO "platform_rogue_${suffix}" WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
    ],
    [
      "anonymous role can create in managed Auth schema",
      "GRANT CREATE ON SCHEMA auth TO anon",
    ],
    [
      "anonymous schema usage carries grant option",
      "GRANT USAGE ON SCHEMA auth TO anon WITH GRANT OPTION",
    ],
    [
      "anonymous role can read Auth session rows",
      "GRANT SELECT ON auth.sessions TO anon",
    ],
    [
      "authenticated role can read an Auth session column",
      "GRANT SELECT(id) ON auth.sessions TO authenticated",
    ],
    [
      "runtime Auth group can use managed Auth schema directly",
      "GRANT USAGE ON SCHEMA auth TO examate_auth",
    ],
    [
      "anonymous role can execute private session verifier",
      "GRANT EXECUTE ON FUNCTION examate_private.auth_session_active(uuid,uuid) TO anon",
    ],
    [
      "business RLS is disabled",
      "ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY",
    ],
    [
      "an extra public row policy permits reads",
      "CREATE POLICY platform_unsafe ON public.tasks FOR SELECT TO PUBLIC USING(true)",
    ],
  ];
  const client = await f.admin.connect();
  try {
    for (const [name, sql] of rejectedChanges)
      await t.test(name, async () => {
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await assert.rejects(
            assertRuntimeCatalogContract((s, p) => client.query(s, p)),
            { code: "RUNTIME_CAPABILITY_INVALID" },
          );
        } finally {
          await client.query("ROLLBACK");
        }
      });
  } finally {
    client.release();
  }
  await business.assertBusinessCapability();
  await auth.assertCapability("examate_auth");
});

test("managed runtime catalog accepts SQL file line endings without accepting a changed verifier", async (t) => {
  const f = await openDocumentsTenantFixture();
  t.after(() => f.close());
  const definitions = await f.admin.query(
    `SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
     WHERE p.oid IN ('public.examate_workspace_role(uuid)'::regprocedure,
       'examate_private.auth_session_active(uuid,uuid)'::regprocedure)`,
  );
  for (const newline of ["\n", "\r\n"]) {
    for (const { definition } of definitions.rows)
      await f.admin.query(
        definition.replace(/\r\n/g, "\n").replace(/\n/g, newline),
      );
    await assertRuntimeCatalogContract((sql, values) =>
      f.admin.query(sql, values),
    );
  }
  await f.admin.query(
    `CREATE OR REPLACE FUNCTION examate_private.auth_session_active(session_id uuid,owner_id uuid)
     RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT true $$`,
  );
  await assert.rejects(
    assertRuntimeCatalogContract((sql, values) => f.admin.query(sql, values)),
    { code: "RUNTIME_CAPABILITY_INVALID" },
  );
});
