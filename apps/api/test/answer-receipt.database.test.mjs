import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";

const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const entry = "015_assistant_answer_receipts.sql";
const projectRef = "a1b2c3d4e5f6g7h8i9j0";
const options = { apply: true, projectRef, confirmProject: projectRef };
const sourceThrough = async (number) =>
  (await loadMigrations()).filter((f) => Number(f.name.slice(0, 3)) <= number);
const hash = (f) =>
  createHash("sha256").update(f.sql.replace(/\r\n/g, "\n")).digest("hex");

async function schema(pool) {
  return {
    columns: (
      await pool.query(
        "SELECT table_name,column_name,ordinal_position,is_nullable,data_type,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
      )
    ).rows,
    constraints: (
      await pool.query(
        "SELECT c.relname,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname",
      )
    ).rows,
    indexes: (
      await pool.query(
        "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
      )
    ).rows,
    security: (
      await pool.query(
        "SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname",
      )
    ).rows,
  };
}
async function fixture(t) {
  const name = `examate_phase8_${randomUUID().replaceAll("-", "")}_test`;
  const target = new URL(parentUrl);
  target.pathname = "/" + name;
  const url = assertTestDatabaseTarget(target.href);
  const parent = new pg.Pool({ connectionString: parentUrl, ssl: false });
  let pool,
    created = false;
  const saved = Object.fromEntries(
    ["DATABASE_SSL", "DATABASE_CA_CERT_PATH", "PILOT_WORKSPACE_ID"].map((k) => [
      k,
      process.env[k],
    ]),
  );
  process.env.DATABASE_SSL = "false";
  process.env.DATABASE_CA_CERT_PATH = "";
  const workspaceId = randomUUID();
  process.env.PILOT_WORKSPACE_ID = workspaceId;
  t.after(async () => {
    try {
      await pool?.end();
      if (created) {
        assertTestDatabaseTarget(url);
        assert.match(name, /^examate_phase8_[a-f0-9]{32}_test$/);
        assert.equal(
          (
            await parent.query(
              "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
              [name],
            )
          ).rows[0].owned,
          true,
        );
        await parent.query(`DROP DATABASE "${name}"`);
      }
    } finally {
      await parent.end();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
  await parent.query(`CREATE DATABASE "${name}"`);
  created = true;
  pool = new pg.Pool({ connectionString: url, ssl: false });
  await prepareAuthFixture(pool);
  await migrate(url, { loadSource: () => sourceThrough(14) });
  return { pool, url, workspaceId };
}

test("015 adds private text-free receipts and rollback preserves schema/legacy rows with replayable chain", async (t) => {
  // This historical rollback chain deliberately stops at 015. Newer migrations
  // have independent apply/rollback guards and tests (OAuth 016 included).
  const source = await sourceThrough(15);
  assert.ok(
    source.some((f) => f.name === entry),
    "server answer receipt migration must exist",
  );
  const { pool, url, workspaceId } = await fixture(t);
  const before = await schema(pool);
  const oldRows = (await pool.query("SELECT id FROM tasks ORDER BY id")).rows;
  await migrate(url, { loadSource: () => sourceThrough(15) });
  await migrate(url, { loadSource: () => sourceThrough(15) });
  const ledger = (
    await pool.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    )
  ).rows;
  assert.equal(ledger.length, 15);
  for (const f of source)
    assert.equal(ledger.find((r) => r.name === f.name).checksum, hash(f));
  const columns = (
    await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='assistant_answer_receipts' ORDER BY ordinal_position",
    )
  ).rows.map((r) => r.column_name);
  assert.deepEqual(columns, [
    "id",
    "workspace_id",
    "user_id",
    "mode",
    "request_id",
    "snapshot_hash",
    "created_at",
  ]);
  assert.equal(
    (
      await pool.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid='assistant_answer_receipts'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  const { runPilotRollback015 } =
    await import("../scripts/pilot-rollback-015.mjs");
  const state = await schema(pool);
  const client = await pool.connect();
  try {
    const dry = await runPilotRollback015(client, { projectRef });
    assert.equal(dry.dryRun, true);
    assert.deepEqual(await schema(pool), state);
    await assert.rejects(
      runPilotRollback015(client, {
        ...options,
        confirmProject: "z".repeat(20),
      }),
      /confirmation/,
    );
    await pool.query(
      "CREATE INDEX phase8_external_index ON assistant_feedback(receipt_id)",
    );
    await assert.rejects(runPilotRollback015(client, options), /dependent/);
    await pool.query("DROP INDEX phase8_external_index");
    await pool.query("DROP INDEX assistant_answer_receipts_owner_idx");
    await pool.query(
      "CREATE UNIQUE INDEX assistant_answer_receipts_owner_idx ON assistant_answer_receipts(snapshot_hash)",
    );
    await assert.rejects(
      runPilotRollback015(client, { projectRef }),
      /schema|index/,
    );
    await pool.query("DROP INDEX assistant_answer_receipts_owner_idx");
    await pool.query(
      "CREATE INDEX assistant_answer_receipts_owner_idx ON assistant_answer_receipts(workspace_id,user_id,created_at)",
    );
    await pool.query(
      "ALTER TABLE assistant_answer_receipts ALTER COLUMN created_at SET DEFAULT '2000-01-01'::timestamptz",
    );
    await assert.rejects(
      runPilotRollback015(client, { projectRef }),
      /schema|default/,
    );
    await pool.query(
      "ALTER TABLE assistant_answer_receipts ALTER COLUMN created_at SET DEFAULT NOW()",
    );
    const future = { name: "016_future.sql", sql: "SELECT 1;" };
    await pool.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES('016_future.sql',$1)",
      [hash(future)],
    );
    await assert.rejects(
      runPilotRollback015(client, options, {
        loadSource: async () => [...source, future],
      }),
      /later/,
    );
    await pool.query(
      "DELETE FROM schema_migrations WHERE name='016_future.sql'",
    );
    const originalChecksum = ledger.find((r) => r.name === entry).checksum;
    await pool.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", [
      "b".repeat(64),
      entry,
    ]);
    await assert.rejects(runPilotRollback015(client, options), /checksum/);
    await pool.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", [
      originalChecksum,
      entry,
    ]);
    // Lost acknowledgement after COMMIT must report uncertainty, not retry.
    await assert.rejects(
      runPilotRollback015(
        {
          query: async (sql, values) => {
            const result = await client.query(sql, values);
            if (sql === "COMMIT")
              throw new Error("synthetic lost commit acknowledgement");
            return result;
          },
        },
        options,
      ),
      /outcome unknown/,
    );
    assert.deepEqual(await schema(pool), before);
    assert.deepEqual(
      (await pool.query("SELECT id FROM tasks ORDER BY id")).rows,
      oldRows,
    );
    const { runPilotRollback014 } =
      await import("../scripts/pilot-rollback-014.mjs");
    const { runPilotRollback } =
      await import("../scripts/pilot-rollback-012-013.mjs");
    await runPilotRollback014(client, options);
    await runPilotRollback(client, options);
    assert.equal(
      (await pool.query("SELECT count(*)::int AS n FROM schema_migrations"))
        .rows[0].n,
      11,
    );
  } finally {
    client.release();
  }
  await migrate(url, { loadSource: () => sourceThrough(15) });
  assert.equal(
    (await pool.query("SELECT count(*)::int AS n FROM schema_migrations"))
      .rows[0].n,
    15,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM workspaces WHERE id=$1",
        [workspaceId],
      )
    ).rows[0].n,
    1,
  );
});
