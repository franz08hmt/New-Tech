import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { runtimeCapabilityCatalogDigest } from "../dist/database/runtime-capability-contract.js";
import { migrate } from "../scripts/migrate.mjs";
import { runPilotRollback021 } from "../scripts/pilot-rollback-021.mjs";
import {
  fixedId,
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";

const saved = { ...process.env };
const marker = `ExaMate F06 capability disposable ${randomUUID()}`;
const roles = {
  business: `f06biz_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
  auth: `f06auth_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
};
const passwords = {
  business: randomBytes(24).toString("hex"),
  auth: randomBytes(24).toString("hex"),
};
let fixture;
let business;
let authDb;
let client;
let clientPool;
const createdRoles = [];

async function createRuntimeRole(name, password, group) {
  await fixture.admin.query(
    `CREATE ROLE "${name}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`,
  );
  createdRoles.push(name);
  await fixture.admin.query(`COMMENT ON ROLE "${name}" IS '${marker}'`);
  await fixture.admin.query(`GRANT ${group} TO "${name}"`);
}

function loginUrl(name, password) {
  const url = new URL(fixture.admin.options.connectionString);
  url.username = name;
  url.password = password;
  return fixture.guard(url.href);
}

before(async () => {
  fixture = await openDocumentsTenantFixture({ migrationLimit: 20 });
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    PILOT_WORKSPACE_ID: tenants[0].id,
  });
  await createRuntimeRole(
    roles.business,
    passwords.business,
    "examate_business",
  );
  await createRuntimeRole(roles.auth, passwords.auth, "examate_auth");
  Object.assign(process.env, {
    DATABASE_URL: loginUrl(roles.business, passwords.business),
    DATABASE_POOL_MAX: "2",
    AUTH_DATABASE_URL: loginUrl(roles.auth, passwords.auth),
    AUTH_DATABASE_SSL: "false",
    AUTH_DATABASE_CA_CERT_PATH: "",
    AUTH_DATABASE_POOL_MAX: "2",
  });
  business = new DatabaseService();
  authDb = new AuthDatabaseService();
  clientPool = new pg.Pool({
    connectionString: fixture.admin.options.connectionString,
    max: 1,
  });
  client = await clientPool.connect();
});

after(async () => {
  try {
    await business?.onModuleDestroy();
    await authDb?.onModuleDestroy();
    client?.release();
    await clientPool?.end();
    if (fixture) {
      for (const role of createdRoles) {
        assert.equal(
          (
            await fixture.admin.query(
              "SELECT shobj_description(oid,'pg_authid') AS marker FROM pg_roles WHERE rolname=$1",
              [role],
            )
          ).rows[0]?.marker,
          marker,
        );
        await fixture.admin.query(
          `REVOKE examate_business,examate_auth FROM "${role}"`,
        );
        await fixture.admin.query(`DROP ROLE "${role}"`);
      }
      await fixture.close();
    }
  } finally {
    for (const key of Object.keys(process.env))
      if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("021 preflight, manager RLS, rollback preservation and reapply are verified on PG17", async () => {
  const databaseName = fixture.name;
  const target = fixture.admin.options.connectionString;
  const beforeLedger = (
    await fixture.admin.query(
      "SELECT count(*)::int AS n FROM schema_migrations WHERE name='021_ai_usage_dashboard.sql'",
    )
  ).rows[0].n;
  assert.equal(beforeLedger, 0);

  await fixture.admin.query(
    "CREATE POLICY f06_fixture_public_read ON public.ai_usage_operations FOR SELECT TO PUBLIC USING (true)",
  );
  try {
    await assert.rejects(
      migrate(target),
      /Unmanaged policy affects a protected runtime capability/,
    );
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT count(*)::int AS n FROM schema_migrations WHERE name='021_ai_usage_dashboard.sql'",
        )
      ).rows[0].n,
      0,
      "an unsafe pre-existing PUBLIC policy blocks 021 before ledger write",
    );
  } finally {
    await fixture.admin.query(
      "DROP POLICY f06_fixture_public_read ON public.ai_usage_operations",
    );
  }

  await migrate(target);
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => fixture.admin.query(text, values),
      21,
    ),
    "a1d78d4abffa234b14fb58ecff790a096b1c14439f79330de325bd255934fa45",
  );
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT has_table_privilege($1,'public.ai_usage_operations','SELECT') AS whole_table, has_column_privilege($1,'public.ai_usage_operations','operation_id','SELECT') AS allowed_column, has_column_privilege($1,'public.ai_usage_operations','request_id','SELECT') AS denied_column",
        [roles.business],
      )
    ).rows[0].whole_table,
    false,
  );
  const grants = (
    await fixture.admin.query(
      "SELECT has_column_privilege($1,'public.ai_usage_operations','operation_id','SELECT') AS allowed, has_column_privilege($1,'public.ai_usage_operations','request_id','SELECT') AS denied",
      [roles.business],
    )
  ).rows[0];
  assert.deepEqual(grants, { allowed: true, denied: false });

  const operationIds = [randomUUID(), randomUUID(), randomUUID()];
  const workspaces = [tenants[0], tenants[0], tenants[1]];
  const users = [people.manager, people.member, people.manager];
  for (let index = 0; index < operationIds.length; index++) {
    await fixture.admin.query(
      `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,
        operation,mode,outcome,provider_call_count,started_at,completed_at,duration_ms,expires_at)
       VALUES($1,$2,$3,$4,'assistant_question','general','success',0,NOW(),NOW(),0,$5)`,
      [
        operationIds[index],
        randomUUID(),
        workspaces[index].id,
        users[index],
        index === 1 ? "2026-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
      ],
    );
  }

  const manager = {
    workspaceId: tenants[0].id,
    userId: people.manager,
    role: "manager",
  };
  const member = {
    workspaceId: tenants[0].id,
    userId: people.member,
    role: "member",
  };
  const tenantBManager = {
    workspaceId: tenants[1].id,
    userId: people.manager,
    role: "manager",
  };
  const visible = await business.workspaceTransaction(manager, (tx) =>
    tx.query(
      "SELECT operation_id::text FROM ai_usage_operations ORDER BY operation_id",
    ),
  );
  assert.deepEqual(
    visible.rows.map((row) => row.operation_id).sort(),
    [operationIds[0], operationIds[1]].sort(),
  );
  const invisible = await business.workspaceTransaction(member, (tx) =>
    tx.query("SELECT operation_id::text FROM ai_usage_operations"),
  );
  assert.deepEqual(invisible.rows, []);
  const otherTenant = await business.workspaceTransaction(
    tenantBManager,
    (tx) => tx.query("SELECT operation_id::text FROM ai_usage_operations"),
  );
  assert.deepEqual(
    otherTenant.rows.map((row) => row.operation_id),
    [operationIds[2]],
  );
  assert.deepEqual(
    (await business.query("SELECT operation_id FROM ai_usage_operations")).rows,
    [],
  );
  await assert.rejects(
    authDb.query("SELECT operation_id FROM ai_usage_operations"),
    { code: "42501" },
  );

  const beforeRollback = (
    await fixture.admin.query(
      "SELECT count(*)::text AS operations FROM ai_usage_operations",
    )
  ).rows[0].operations;
  const dryRun = await runPilotRollback021(
    client,
    { apply: false },
    { databaseName },
  );
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.businessRowsDeleted, 0);
  const rollback = await runPilotRollback021(
    client,
    { apply: true, confirmDatabase: databaseName },
    { databaseName },
  );
  assert.equal(rollback.applied, true);
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::text AS operations FROM ai_usage_operations",
      )
    ).rows[0].operations,
    beforeRollback,
    "rollback preserves logged telemetry rows",
  );
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => fixture.admin.query(text, values),
      20,
    ),
    "b14a19fb148904116b166da9bbd5c4bf3649fd2b27e6947a525d5589a14a9986",
    "rollback restores the exact F04 schema/ACL/RLS contract",
  );
  await assert.rejects(
    business.workspaceTransaction(manager, (tx) =>
      tx.query("SELECT operation_id FROM ai_usage_operations"),
    ),
    { code: "42501" },
  );

  await migrate(target);
  await business.assertBusinessCapability();
  await authDb.assertCapability("examate_auth");
  const restored = await business.workspaceTransaction(manager, (tx) =>
    tx.query("SELECT operation_id::text FROM ai_usage_operations"),
  );
  assert.deepEqual(
    restored.rows.map((row) => row.operation_id).sort(),
    [operationIds[0], operationIds[1]].sort(),
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM schema_migrations WHERE name='021_ai_usage_dashboard.sql'",
      )
    ).rows[0].n,
    1,
  );
});
