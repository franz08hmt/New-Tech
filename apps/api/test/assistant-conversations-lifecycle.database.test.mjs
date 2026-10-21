import "reflect-metadata";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";
import { runPilotRollback022 } from "../scripts/pilot-rollback-022.mjs";
import { runConversationRetention } from "../scripts/assistant-conversation-retention.mjs";
import {
  loadMigrations,
  migrate,
  migrationChecksum,
} from "../scripts/migrate.mjs";
import { runtimeCapabilityCatalogDigest } from "../dist/database/runtime-capability-contract.js";

let fixture;
const conversation = randomUUID();
const createKey = randomUUID();
const turn = randomUUID();
const receipt = randomUUID();
const requestId = randomUUID();
const snapshot = JSON.stringify({
  f07: "synthetic transcript removed by rollback",
});

before(async () => {
  fixture = await openDocumentsTenantFixture();
  await fixture.admin.query(
    `INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash)
     VALUES($1,$2,$3,'general',$4,repeat('a',64))`,
    [receipt, tenants[0].id, people.member, requestId],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversations
       (id,workspace_id,user_id,mode,title,create_key,version,turn_count,content_bytes)
     VALUES($1,$2,$3,'general','Synthetic lifecycle conversation',$4,1,1,$5)`,
    [
      conversation,
      tenants[0].id,
      people.member,
      createKey,
      Buffer.byteLength(snapshot),
    ],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversation_create_keys(workspace_id,user_id,create_key)
     VALUES($1,$2,$3)`,
    [tenants[0].id, people.member, createKey],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversation_turns
       (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
     VALUES($1,$2,$3,$4,1,$5,$6,$7::jsonb)`,
    [
      turn,
      conversation,
      tenants[0].id,
      people.member,
      randomUUID(),
      receipt,
      snapshot,
    ],
  );
});

after(async () => {
  await fixture?.close();
});

test("022 rollback is guarded, preserves unrelated data, and full reapply restores its exact contract", async () => {
  const query = (text, values) => fixture.admin.query(text, values);
  const baseline21 = await runtimeCapabilityCatalogDigest(query, 21);
  const before = await fixture.snapshot();
  const authSessionsBefore = await query(
    "SELECT * FROM auth.sessions ORDER BY id",
  );
  const receiptsBefore = await query(
    "SELECT * FROM assistant_answer_receipts ORDER BY id",
  );
  const feedbackBefore = await query(
    "SELECT * FROM assistant_feedback ORDER BY answer_id",
  );
  const ledgerBefore = await query(
    "SELECT name,checksum FROM schema_migrations ORDER BY name",
  );
  const source = await loadMigrations();
  const client = await fixture.admin.connect();
  try {
    await assert.rejects(
      runPilotRollback022(
        client,
        { apply: true, confirmDatabase: "wrong_test" },
        { databaseName: fixture.name },
      ),
      /exact disposable database confirmation/,
    );
    const dryRun = await runPilotRollback022(
      client,
      { apply: false },
      { databaseName: fixture.name },
    );
    assert.equal(dryRun.dryRun, true);
    assert.deepEqual(dryRun.contentRowsLostOnApply, {
      conversations: "1",
      turns: "1",
    });
    assert.equal(dryRun.idempotencyKeysLostOnApply, "1");
    assert.equal(dryRun.receiptsPreserved, String(receiptsBefore.rowCount));
    assert.deepEqual(
      (await query("SELECT name,checksum FROM schema_migrations ORDER BY name"))
        .rows,
      ledgerBefore.rows,
    );
    assert.equal(
      (
        await query(
          "SELECT count(*)::int AS count FROM assistant_conversations",
        )
      ).rows[0].count,
      1,
    );

    const applied = await runPilotRollback022(
      client,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name, loadSource: async () => source },
    );
    assert.equal(applied.applied, true);
  } finally {
    client.release();
  }
  assert.equal(await runtimeCapabilityCatalogDigest(query, 21), baseline21);
  assert.deepEqual(await fixture.snapshot(), before);
  assert.deepEqual(
    (await query("SELECT * FROM auth.sessions ORDER BY id")).rows,
    authSessionsBefore.rows,
  );
  assert.deepEqual(
    (await query("SELECT * FROM assistant_answer_receipts ORDER BY id")).rows,
    receiptsBefore.rows,
  );
  assert.deepEqual(
    (await query("SELECT * FROM assistant_feedback ORDER BY answer_id")).rows,
    feedbackBefore.rows,
  );
  assert.equal(
    (
      await query(
        "SELECT count(*)::int AS count FROM schema_migrations WHERE name='022_assistant_conversations.sql'",
      )
    ).rows[0].count,
    0,
  );

  await migrate(fixture.admin.options.connectionString);
  await migrate(fixture.admin.options.connectionString);
  const ledgerAfter = await query(
    "SELECT name,checksum FROM schema_migrations ORDER BY name",
  );
  assert.equal(ledgerAfter.rowCount, 22);
  const migration022 = source.find(
    (file) => file.name === "022_assistant_conversations.sql",
  );
  assert.equal(
    ledgerAfter.rows.at(-1).checksum,
    migrationChecksum(migration022),
  );
  assert.equal(
    await runtimeCapabilityCatalogDigest(query, 22),
    "befdd28ceed598d7b6009c24e42b116f2264c47e886319100512563538f409fa",
  );
  assert.equal(
    (await query("SELECT count(*)::int AS count FROM assistant_conversations"))
      .rows[0].count,
    0,
  );
  assert.deepEqual(
    (await query("SELECT * FROM assistant_answer_receipts ORDER BY id")).rows,
    receiptsBefore.rows,
  );
});

test("retention expires history before cleanup and purges a bounded batch without receipts", async () => {
  const id = randomUUID();
  const key = randomUUID();
  const expiredReceipt = randomUUID();
  await fixture.admin.query(
    `INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash)
     VALUES($1,$2,$3,'general',$4,repeat('b',64))`,
    [expiredReceipt, tenants[0].id, people.member, randomUUID()],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversations
       (id,workspace_id,user_id,mode,title,create_key,version,turn_count,content_bytes,expires_at)
     VALUES($1,$2,$3,'general','Expired synthetic transcript',$4,1,1,$5,clock_timestamp()-INTERVAL '1 second')`,
    [id, tenants[0].id, people.member, key, Buffer.byteLength(snapshot)],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversation_create_keys(workspace_id,user_id,create_key)
     VALUES($1,$2,$3)`,
    [tenants[0].id, people.member, key],
  );
  await fixture.admin.query(
    `INSERT INTO assistant_conversation_turns
       (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
     VALUES($1,$2,$3,$4,1,$5,$6,$7::jsonb)`,
    [
      randomUUID(),
      id,
      tenants[0].id,
      people.member,
      randomUUID(),
      expiredReceipt,
      snapshot,
    ],
  );

  const client = await fixture.admin.connect();
  try {
    const dryRun = await runConversationRetention(client, {
      apply: false,
      batchSize: 1,
    });
    assert.equal(dryRun.eligibleInBoundedBatch, "1");
    assert.equal(dryRun.eligibleTurns, "1");
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT count(*)::int AS count FROM assistant_conversations WHERE id=$1",
          [id],
        )
      ).rows[0].count,
      1,
    );
    const applied = await runConversationRetention(client, {
      apply: true,
      batchSize: 1,
    });
    assert.equal(applied.deletedConversations, "1");
    assert.equal(applied.deletedTurns, "1");
  } finally {
    client.release();
  }
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM assistant_conversations WHERE id=$1",
        [id],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM assistant_conversation_turns WHERE conversation_id=$1",
        [id],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM assistant_answer_receipts WHERE id=$1",
        [expiredReceipt],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM assistant_conversation_create_keys WHERE workspace_id=$1 AND user_id=$2 AND create_key=$3",
        [tenants[0].id, people.member, key],
      )
    ).rows[0].count,
    1,
  );
});
