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
import { runPilotRollback020 } from "../scripts/pilot-rollback-020.mjs";
import {
  assertRuntimeCatalogContract,
  runtimeCapabilityCatalogDigest,
} from "../dist/database/runtime-capability-contract.js";

let fixture;
before(async () => {
  fixture = await openDocumentsTenantFixture({ migrationLimit: 20 });
  await fixture.admin.query(
    `INSERT INTO ai_admission_user_daily(user_id,budget_day,used_operations)
     VALUES($1,timezone('Asia/Ho_Chi_Minh',clock_timestamp())::date,2)`,
    [people.manager],
  );
  await fixture.admin.query(
    `INSERT INTO ai_admission_operations(
       operation_id,workspace_id,user_id,operation,state,provider_attempts,
       planned_provider_calls,max_provider_calls,started_at,finished_at
     ) VALUES($1,$2,$3,'assistant_question','completed',1,1,1,now(),now())`,
    [fixedId(980), tenants[0].id, people.manager],
  );
  await fixture.admin.query(
    "INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)",
    [fixedId(981), people.manager],
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

async function countSnapshot({ includeAdmission = true } = {}) {
  const values = {};
  for (const table of [
    "workspaces",
    "workspace_memberships",
    "tasks",
    "documents",
    "document_chunks",
    "assistant_answer_receipts",
    "assistant_feedback",
    "auth.users",
    "auth.sessions",
    ...(includeAdmission
      ? ["ai_admission_user_daily", "ai_admission_operations"]
      : []),
  ])
    values[table] = (
      await fixture.admin.query(`SELECT count(*)::int AS count FROM ${table}`)
    ).rows[0].count;
  values.ledger = (
    await fixture.admin.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  return values;
}

const rollback = (client, apply = false) =>
  runPilotRollback020(
    client,
    { apply, ...(apply ? { confirmDatabase: fixture.name } : {}) },
    { databaseName: fixture.name },
  );

test("020 rejects dependency and later-ledger drift in dry-run and apply without writes", async () => {
  const before = await countSnapshot();
  const digest = await runtimeCapabilityCatalogDigest(
    (text, values) => fixture.admin.query(text, values),
    20,
  );
  await fixture.admin.query(
    "CREATE VIEW f04_external_dependency_fixture AS SELECT operation_id FROM ai_admission_operations",
  );
  for (const apply of [false, true])
    await assert.rejects(
      withClient((client) => rollback(client, apply)),
      /external catalog dependencies/,
    );
  assert.deepEqual(await countSnapshot(), before);
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => fixture.admin.query(text, values),
      20,
    ),
    digest,
  );
  await fixture.admin.query("DROP VIEW f04_external_dependency_fixture");

  const source = await loadMigrations();
  await fixture.admin.query(
    "INSERT INTO schema_migrations(name,checksum) VALUES('021_synthetic_later.sql','synthetic-checksum')",
  );
  try {
    await assert.rejects(
      withClient((client) =>
        runPilotRollback020(
          client,
          { apply: false },
          {
            databaseName: fixture.name,
            loadSource: async () => [
              ...source,
              { name: "021_synthetic_later.sql", sql: "-- test-only" },
            ],
          },
        ),
      ),
      /exact 001-020 migration chain/,
    );
  } finally {
    await fixture.admin.query(
      "DELETE FROM schema_migrations WHERE name='021_synthetic_later.sql'",
    );
  }
  assert.deepEqual(await countSnapshot(), before);
});

test("020 dry-run and exact-target guard are read-only; rollback preserves business and Auth data", async () => {
  const before = await countSnapshot();
  const digest = await runtimeCapabilityCatalogDigest(
    (text, values) => fixture.admin.query(text, values),
    20,
  );
  const dry = await withClient((client) => rollback(client));
  assert.equal(dry.dryRun, true);
  assert.equal(dry.applied, false);
  assert.equal(dry.admissionOperationsLostOnApply, 1);
  assert.equal(dry.dailyCounterRowsLostOnApply, 1);
  assert.equal(dry.businessRowsDeleted, 0);
  assert.equal(dry.authRowsDeleted, 0);
  assert.deepEqual(await countSnapshot(), before);

  await assert.rejects(
    withClient((client) =>
      runPilotRollback020(
        client,
        { apply: true, confirmDatabase: "different_test" },
        { databaseName: fixture.name },
      ),
    ),
    /exact disposable database confirmation/,
  );
  assert.deepEqual(await countSnapshot(), before);

  const applied = await withClient((client) => rollback(client, true));
  assert.equal(applied.applied, true);
  const after = await countSnapshot({ includeAdmission: false });
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT to_regclass('public.ai_admission_operations') AS operations,to_regclass('public.ai_admission_user_daily') AS daily",
      )
    ).rows[0].operations,
    null,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT to_regclass('public.ai_admission_user_daily') AS daily",
      )
    ).rows[0].daily,
    null,
  );
  assert.equal(after["workspaces"], before.workspaces);
  assert.equal(after["workspace_memberships"], before.workspace_memberships);
  assert.equal(after.tasks, before.tasks);
  assert.equal(after.documents, before.documents);
  assert.equal(after.document_chunks, before.document_chunks);
  assert.equal(after["auth.users"], before["auth.users"]);
  assert.equal(after["auth.sessions"], before["auth.sessions"]);
  assert.equal(after.ledger.length, 19);
  assert.equal(after.ledger.at(-1).name, "019_ai_usage_telemetry.sql");
  await assertRuntimeCatalogContract(
    (text, values) => fixture.admin.query(text, values),
    19,
  );

  const source = await loadMigrations();
  const through020 = async () => source.slice(0, 20);
  const target = new URL(process.env.TEST_DATABASE_URL);
  target.pathname = "/" + fixture.name;
  fixture.guard(target.href);
  await migrate(target.href, { loadSource: through020 });
  await migrate(target.href, { loadSource: through020 });
  const reapply = await countSnapshot();
  assert.equal(reapply.ledger.length, 20);
  assert.equal(reapply.ledger.at(-1).name, "020_ai_admission.sql");
  assert.equal(
    reapply.ledger.at(-1).checksum,
    migrationChecksum(
      source.find((item) => item.name === "020_ai_admission.sql"),
    ),
  );
  assert.equal(reapply["ai_admission_operations"], 0);
  assert.equal(reapply["ai_admission_user_daily"], 0);
  await assertRuntimeCatalogContract(
    (text, values) => fixture.admin.query(text, values),
    20,
  );
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => fixture.admin.query(text, values),
      20,
    ),
    digest,
  );
  for (const key of [
    "workspaces",
    "workspace_memberships",
    "tasks",
    "documents",
    "document_chunks",
    "assistant_answer_receipts",
    "assistant_feedback",
    "auth.users",
    "auth.sessions",
  ])
    assert.equal(reapply[key], before[key], `${key} remains unchanged`);
});

test("020 lost COMMIT acknowledgement is unknown and its connection is discarded, never auto-replayed", async () => {
  const pool = new (await import("pg")).default.Pool({
    connectionString: fixture.admin.options.connectionString,
    max: 1,
  });
  const client = await pool.connect();
  const query = client.query.bind(client);
  let loseCommitAck = true;
  client.query = async (sql, ...args) => {
    const text = typeof sql === "string" ? sql : (sql?.text ?? "");
    const result = await query(sql, ...args);
    if (loseCommitAck && /^COMMIT$/i.test(text)) {
      loseCommitAck = false;
      throw new Error("synthetic post-commit acknowledgement loss");
    }
    return result;
  };
  let discard = false;
  try {
    await assert.rejects(rollback(client, true), (error) => {
      discard = error.discardConnection === true;
      return /outcome unknown/.test(error.message);
    });
    assert.equal(discard, true);
  } finally {
    client.release(discard);
    await pool.end();
  }
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT to_regclass('public.ai_admission_operations') IS NOT NULL AS present",
      )
    ).rows[0].present,
    false,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM schema_migrations WHERE name='020_ai_admission.sql'",
      )
    ).rows[0].count,
    0,
  );
  const source = await loadMigrations();
  const target = new URL(process.env.TEST_DATABASE_URL);
  target.pathname = "/" + fixture.name;
  fixture.guard(target.href);
  await migrate(target.href, {
    loadSource: async () => source.slice(0, 20),
  });
  await assertRuntimeCatalogContract(
    (text, values) => fixture.admin.query(text, values),
    20,
  );
});

test("020 cleans up transaction after lost BEGIN acknowledgement and discards if rollback also fails", async () => {
  const pool = new (await import("pg")).default.Pool({
    connectionString: fixture.admin.options.connectionString,
    max: 1,
  });
  const client = await pool.connect();
  const query = client.query.bind(client);
  let loseBeginAck = true;
  client.query = async (sql, ...args) => {
    const text = typeof sql === "string" ? sql : (sql?.text ?? "");
    const result = await query(sql, ...args);
    if (loseBeginAck && /^BEGIN READ ONLY$/i.test(text)) {
      loseBeginAck = false;
      throw new Error("synthetic lost begin acknowledgement");
    }
    return result;
  };
  await assert.rejects(rollback(client), /refused/);
  assert.equal((await query("SELECT 1 AS ready")).rows[0].ready, 1);
  client.release();
  await pool.end();

  const brokenPool = new (await import("pg")).default.Pool({
    connectionString: fixture.admin.options.connectionString,
    max: 1,
  });
  const broken = await brokenPool.connect();
  const original = broken.query.bind(broken);
  broken.query = async (sql, ...args) => {
    const text = typeof sql === "string" ? sql : (sql?.text ?? "");
    if (/^ROLLBACK$/i.test(text))
      throw new Error("synthetic rollback cleanup failure");
    return original(sql, ...args);
  };
  let discard = false;
  try {
    await assert.rejects(rollback(broken), (error) => {
      discard = error.discardConnection === true;
      return /outcome unknown/.test(error.message);
    });
    assert.equal(discard, true);
  } finally {
    broken.release(discard);
    await brokenPool.end();
  }
});
