import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  fixedId,
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";
import {
  loadMigrations,
  migrate,
  migrationChecksum,
} from "../scripts/migrate.mjs";
import { runPilotRollback019 } from "../scripts/pilot-rollback-019.mjs";
import {
  runtimeCapabilityCatalogDigest,
  assertRuntimeCatalogContract,
} from "../dist/database/runtime-capability-contract.js";

let fixture;
before(async () => {
  fixture = await openDocumentsTenantFixture({ migrationLimit: 19 });
  await fixture.admin.query(
    `INSERT INTO ai_usage_operations(operation_id,request_id,workspace_id,user_id,operation,mode,prompt_id,prompt_version,outcome,provider_call_count,started_at,completed_at,duration_ms)
     VALUES($1,$2,$3,$4,'assistant_question','documents','assistant.documents.question','rag-v1','success',1,NOW(),NOW(),1)`,
    [fixedId(970), fixedId(971), tenants[0].id, people.manager],
  );
  await fixture.admin.query(
    `INSERT INTO ai_usage_provider_calls(call_id,operation_id,workspace_id,user_id,provider,model,call_type,outcome,usage_status,cost_status,duration_ms,started_at,completed_at)
     VALUES($1,$2,$3,$4,'google','gemini-embedding-001','embedding_query','success','missing','unknown_usage',1,NOW(),NOW())`,
    [fixedId(972), fixedId(970), tenants[0].id, people.manager],
  );
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

async function snapshot({ includeUsage = true } = {}) {
  const tables = [
    "workspaces",
    "workspace_memberships",
    "tasks",
    "courses",
    "exams",
    "study_plans",
    "expenses",
    "documents",
    "document_chunks",
    "assistant_answer_receipts",
    "assistant_feedback",
    "auth.users",
    "auth.sessions",
  ];
  const state = {};
  for (const table of tables)
    state[table] = (
      await fixture.admin.query(`SELECT count(*)::int AS count FROM ${table}`)
    ).rows[0].count;
  if (includeUsage) {
    state.operations = (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_usage_operations",
      )
    ).rows[0].count;
    state.providerCalls = (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM ai_usage_provider_calls",
      )
    ).rows[0].count;
  }
  state.ledger = (
    await fixture.admin.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  return state;
}

test("019 rollback dry-run rejects dependencies and schema drift, then apply/reapply changes only F03 metadata", async () => {
  const before = await snapshot();
  assert.equal(before.operations, 1);
  assert.equal(before.providerCalls, 1);
  assert.equal(before.ledger.length, 19);

  await fixture.admin.query(
    "CREATE VIEW f03_usage_external_fixture AS SELECT operation_id FROM ai_usage_operations",
  );
  for (const apply of [false, true])
    await assert.rejects(
      withClient((client) =>
        runPilotRollback019(
          client,
          { apply, ...(apply ? { confirmDatabase: fixture.name } : {}) },
          { databaseName: fixture.name },
        ),
      ),
      /external catalog dependencies/,
    );
  assert.deepEqual(await snapshot(), before);
  await fixture.admin.query("DROP VIEW f03_usage_external_fixture");

  await fixture.admin.query(
    "ALTER TABLE ai_usage_provider_calls ALTER COLUMN duration_ms TYPE bigint",
  );
  await assert.rejects(
    withClient((client) =>
      runPilotRollback019(
        client,
        { apply: false },
        { databaseName: fixture.name },
      ),
    ),
    /capability schema, grants, RLS or policy contract has drifted/,
  );
  await fixture.admin.query(
    "ALTER TABLE ai_usage_provider_calls ALTER COLUMN duration_ms TYPE integer",
  );

  const wrongConfirmationClient = {
    async query() {
      assert.fail("wrong confirmation must be rejected before DB access");
    },
  };
  await assert.rejects(
    runPilotRollback019(
      wrongConfirmationClient,
      { apply: true, confirmDatabase: "other_test" },
      { databaseName: fixture.name },
    ),
    /exact disposable database confirmation/,
  );

  let readOnlyAtInspection = false;
  await withClient(async (client) => {
    const traced = {
      async query(sql, ...args) {
        if (
          sql.includes(
            "SELECT\n      (SELECT count(*)::int FROM public.ai_usage_operations",
          )
        )
          readOnlyAtInspection =
            (await client.query("SHOW transaction_read_only")).rows[0]
              .transaction_read_only === "on";
        return client.query(sql, ...args);
      },
    };
    const dry = await runPilotRollback019(
      traced,
      { apply: false },
      { databaseName: fixture.name },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.operationsLostOnApply, 1);
    assert.equal(dry.providerCallsLostOnApply, 1);
    assert.equal(dry.businessRowsDeleted, 0);
    assert.equal(dry.authRowsDeleted, 0);
  });
  assert.equal(readOnlyAtInspection, true);
  assert.deepEqual(await snapshot(), before);

  const applied = await withClient((client) =>
    runPilotRollback019(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    ),
  );
  assert.equal(applied.applied, true);
  const {
    operations: _operations,
    providerCalls: _providerCalls,
    ...beforeWithoutUsage
  } = before;
  assert.deepEqual(await snapshot({ includeUsage: false }), {
    ...beforeWithoutUsage,
    ledger: before.ledger.slice(0, 18),
  });
  await assertRuntimeCatalogContract(
    (text, values) => fixture.admin.query(text, values),
    18,
  );

  const target = new URL(process.env.TEST_DATABASE_URL);
  target.pathname = "/" + fixture.name;
  fixture.guard(target.href);
  const through019 = async () =>
    (await loadMigrations()).filter(
      (item) => Number(item.name.slice(0, 3)) <= 19,
    );
  await migrate(target.href, { loadSource: through019 });
  await migrate(target.href, { loadSource: through019 });
  const migrations = await loadMigrations();
  const after = await snapshot();
  assert.equal(after.ledger.length, 19);
  assert.equal(after.ledger.at(-1).name, "019_ai_usage_telemetry.sql");
  assert.equal(
    after.ledger.at(-1).checksum,
    migrationChecksum(
      migrations.find((item) => item.name === "019_ai_usage_telemetry.sql"),
    ),
  );
  assert.equal(after.operations, 0);
  assert.equal(after.providerCalls, 0);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(after).filter(
        ([key]) => !["ledger", "operations", "providerCalls"].includes(key),
      ),
    ),
    Object.fromEntries(
      Object.entries(before).filter(
        ([key]) => !["ledger", "operations", "providerCalls"].includes(key),
      ),
    ),
  );
  assert.deepEqual(after.ledger.slice(0, 18), before.ledger.slice(0, 18));
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => fixture.admin.query(text, values),
      19,
    ),
    "c1e686aa68c3fac689544396b9ef29cab16cc93a7e394a89742a9a2a85abf73d",
  );
});
