import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openDocumentsTenantFixture } from "./documents-tenant-fixture.mjs";
import {
  loadMigrations,
  migrate,
  migrationChecksum,
} from "../scripts/migrate.mjs";
import { runPilotRollback016 } from "../scripts/pilot-rollback-016.mjs";
import { runPilotRollback017 } from "../scripts/pilot-rollback-017.mjs";
import { runPilotApply018 } from "../scripts/pilot-apply-018.mjs";
import { runPilotRollback018 } from "../scripts/pilot-rollback-018.mjs";
import {
  runtimeCapabilityCatalogDigest,
  runtimeCapabilityCatalogSnapshot,
} from "../dist/database/runtime-capability-contract.js";

let fixture;
before(async () => {
  fixture = await openDocumentsTenantFixture();
});
after(async () => fixture?.close());

async function withClient(work) {
  const client = await fixture.admin.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

async function policySnapshot(client) {
  return (
    await client.query(
      `SELECT c.relname AS relation_name,p.polname AS policy_name,
      p.polcmd::text AS command,p.polpermissive AS permissive,
      ARRAY(SELECT r.rolname::text FROM pg_roles r WHERE r.oid=ANY(p.polroles) ORDER BY r.rolname::text) AS role_names,
      pg_get_expr(p.polqual,p.polrelid) AS using_expression,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND p.polname=ANY($1::text[]) ORDER BY p.polname`,
      [
        [
          "f02_workspace_owner_business_select",
          "f02_membership_owner_business_select",
          "f02_workspace_lock_only",
          "f02_membership_lock_only",
          "f02_chunks_select",
        ],
      ],
    )
  ).rows;
}

test("018 dry-run/apply/rollback preserves 017 then 016 and full reapply", async () => {
  const migrations = await loadMigrations();
  const beforeDigest = await runtimeCapabilityCatalogDigest((text, values) =>
    fixture.admin.query(text, values),
  );
  const beforeCatalog = await runtimeCapabilityCatalogSnapshot((text, values) =>
    fixture.admin.query(text, values),
  );
  const beforeData = await fixture.snapshot();
  const beforePolicies = await policySnapshot(fixture.admin);
  const beforeLedger = (
    await fixture.admin.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;

  const dry = await withClient((client) =>
    runPilotRollback018(
      client,
      { apply: false },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(dry.dryRun, true);
  assert.equal(dry.businessRowsDeleted, 0);
  assert.deepEqual(
    await runtimeCapabilityCatalogSnapshot((text, values) =>
      fixture.admin.query(text, values),
    ),
    beforeCatalog,
    "rollback dry-run must not change grants or policies",
  );
  assert.deepEqual(
    await fixture.admin
      .query("SELECT name,checksum FROM schema_migrations ORDER BY name")
      .then((r) => r.rows),
    beforeLedger,
  );
  assert.deepEqual(await fixture.snapshot(), beforeData);
  assert.deepEqual(await policySnapshot(fixture.admin), beforePolicies);

  await assert.rejects(
    withClient((client) =>
      runPilotRollback018(
        client,
        { apply: true, confirmDatabase: "different_test" },
        { databaseName: fixture.name },
      ),
    ),
    /exact disposable database confirmation/,
  );
  assert.deepEqual(await fixture.snapshot(), beforeData);

  const rollback = await withClient((client) =>
    runPilotRollback018(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(rollback.applied, true);
  assert.equal(
    (
      await fixture.admin.query(
        `SELECT EXISTS(SELECT 1 FROM pg_database d
          CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) acl
          WHERE d.datname=current_database() AND acl.grantee=0
            AND acl.privilege_type='CONNECT') AS allowed`,
      )
    ).rows[0].allowed,
    true,
    "rollback 018 restores the pre-018 PUBLIC CONNECT grant",
  );
  assert.deepEqual(
    await policySnapshot(fixture.admin),
    (
      await fixture.admin.query(
        `SELECT relation_name,policy_name,command::text AS command,
      permissive,role_names,using_expression,check_expression
      FROM f02_runtime_policy_state WHERE policy_name=ANY($1::text[]) ORDER BY policy_name`,
        [
          [
            "f02_workspace_owner_business_select",
            "f02_membership_owner_business_select",
            "f02_workspace_lock_only",
            "f02_membership_lock_only",
            "f02_chunks_select",
          ],
        ],
      )
    ).rows,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM schema_migrations",
      )
    ).rows[0].n,
    17,
  );
  assert.deepEqual(await fixture.snapshot(), beforeData);

  const reapplyDry = await withClient((client) =>
    runPilotApply018(client, { apply: false }, { databaseName: fixture.name }),
  );
  assert.equal(reapplyDry.applied, false);
  const reapplied = await withClient((client) =>
    runPilotApply018(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(reapplied.applied, true);
  assert.equal(
    await runtimeCapabilityCatalogDigest((text, values) =>
      fixture.admin.query(text, values),
    ),
    beforeDigest,
  );
  assert.deepEqual(await fixture.snapshot(), beforeData);

  await withClient((client) =>
    runPilotRollback018(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  const rollback017 = await withClient((client) =>
    runPilotRollback017(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(rollback017.applied, true);
  const rollback016 = await withClient((client) =>
    runPilotRollback016(client, {
      apply: true,
      projectRef: "a1b2c3d4e5f6g7h8i9j0",
      confirmProject: "a1b2c3d4e5f6g7h8i9j0",
    }),
  );
  assert.equal(rollback016.applied, true);
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS n FROM schema_migrations",
      )
    ).rows[0].n,
    15,
  );

  await migrate(fixture.admin.options.connectionString);
  const finalLedger = (
    await fixture.admin.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  assert.equal(finalLedger.length, 18);
  assert.deepEqual(await fixture.snapshot(), beforeData);
  const finalCatalog = await runtimeCapabilityCatalogSnapshot((text, values) =>
    fixture.admin.query(text, values),
  );
  assert.deepEqual(finalCatalog, beforeCatalog);
  assert.equal(
    await runtimeCapabilityCatalogDigest((text, values) =>
      fixture.admin.query(text, values),
    ),
    beforeDigest,
  );
  assert.equal(finalLedger.at(-1).name, "018_runtime_rls_reindex.sql");
  assert.equal(
    finalLedger.at(-1).checksum,
    migrationChecksum(
      migrations.find((file) => file.name === "018_runtime_rls_reindex.sql"),
    ),
  );
});

async function beginAckFault(run) {
  const client = await fixture.admin.connect();
  const query = client.query.bind(client);
  const statements = [];
  let armed = true;
  client.query = async (sql, ...args) => {
    const text = typeof sql === "string" ? sql : (sql?.text ?? "");
    statements.push(text);
    const result = await query(sql, ...args);
    if (armed && /^(BEGIN|BEGIN READ ONLY)$/.test(text)) {
      armed = false;
      throw new Error("synthetic lost BEGIN acknowledgement");
    }
    return result;
  };
  try {
    let failure;
    await assert.rejects(run(client), (error) => {
      failure = error;
      return /refused/.test(error.message);
    });
    assert.equal(failure.discardConnection, undefined);
    assert.ok(statements.includes("ROLLBACK"));
    client.query = query;
    assert.equal(
      (await query("SHOW transaction_read_only")).rows[0].transaction_read_only,
      "off",
    );
  } finally {
    client.query = query;
    client.release(false);
  }
}

test("018 apply cleans a BEGIN whose acknowledgement is lost", () =>
  beginAckFault((client) =>
    runPilotApply018(client, { apply: false }, { databaseName: fixture.name }),
  ));

test("018 rollback cleans a BEGIN whose acknowledgement is lost", () =>
  beginAckFault((client) =>
    runPilotRollback018(
      client,
      { apply: false },
      { databaseName: fixture.name },
    ),
  ));
