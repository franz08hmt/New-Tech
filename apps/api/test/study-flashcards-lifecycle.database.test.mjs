import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { runPilotRollback024 } from "../scripts/pilot-rollback-024.mjs";
import { runStudyFlashcardsRetention } from "../scripts/study-flashcards-retention.mjs";
import {
  migrate,
  loadMigrations,
  migrationChecksum,
} from "../scripts/migrate.mjs";
import { runtimeCapabilityCatalogDigest } from "../dist/database/runtime-capability-contract.js";
import {
  openDocumentsTenantFixture,
  people,
  tenants,
} from "./documents-tenant-fixture.mjs";

let fixture;

before(async () => {
  // Test the exact historical 023 -> 024 rollback boundary, not a database
  // with later migrations which the rollback must correctly refuse.
  fixture = await openDocumentsTenantFixture({ migrationLimit: 24 });
});

after(async () => {
  await fixture?.close();
});

test("flashcard retention is bounded, dry-run first, and keeps tombstones after expiry", async () => {
  const { admin } = fixture;
  const workspaceId = tenants[0].id;
  const userId = people.member;
  const expiredDraft = randomUUID();
  const expiredDeckDraft = randomUUID();
  const expiredDeck = randomUUID();
  const expiredReview = randomUUID();
  const purgeableTombstone = randomUUID();

  await admin.query(
    `INSERT INTO study_coach_flashcard_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,created_at,expires_at,tombstone_until)
     VALUES($1,$2,$3,$4,repeat('a',64),'{"private":"synthetic"}'::jsonb,'draft',
       clock_timestamp()-INTERVAL '20 minutes',clock_timestamp()-INTERVAL '5 minutes',clock_timestamp()+INTERVAL '90 days')`,
    [expiredDraft, workspaceId, userId, tenants[0].document],
  );
  await admin.query(
    `INSERT INTO study_coach_flashcard_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,saved_deck_id,created_at,expires_at,tombstone_until)
     VALUES($1,$2,$3,$4,repeat('b',64),NULL,'confirmed',$5,
       clock_timestamp()-INTERVAL '91 days',clock_timestamp()-INTERVAL '91 days'+INTERVAL '15 minutes',
       clock_timestamp()-INTERVAL '1 day')`,
    [expiredDeckDraft, workspaceId, userId, tenants[0].document, expiredDeck],
  );
  const content = {
    schemaVersion: "study-flashcards-v1",
    title: "Expired synthetic deck",
    language: "en",
    cards: [],
    sources: [],
  };
  await admin.query(
    `INSERT INTO study_coach_flashcard_decks
       (id,draft_id,workspace_id,user_id,document_id,document_title,language,schema_version,content,card_count,created_at,expires_at)
     VALUES($1,$2,$3,$4,$5,'Expired source','en','study-flashcards-v1',$6::jsonb,3,
       clock_timestamp()-INTERVAL '91 days',clock_timestamp()-INTERVAL '1 day')`,
    [
      expiredDeck,
      expiredDeckDraft,
      workspaceId,
      userId,
      tenants[0].document,
      JSON.stringify(content),
    ],
  );
  await admin.query(
    `INSERT INTO study_coach_flashcard_reviews
       (id,deck_id,workspace_id,user_id,review_key,payload_hash,ratings,remembered_count,needs_review_count,completed_at)
     VALUES($1,$2,$3,$4,$5,repeat('c',64),'[]'::jsonb,0,3,clock_timestamp()-INTERVAL '91 days')`,
    [expiredReview, expiredDeck, workspaceId, userId, randomUUID()],
  );
  await admin.query(
    `INSERT INTO study_coach_flashcard_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,created_at,expires_at,tombstone_until)
     VALUES($1,$2,$3,$4,repeat('d',64),NULL,'cancelled',clock_timestamp()-INTERVAL '100 days',
       clock_timestamp()-INTERVAL '100 days'+INTERVAL '15 minutes',clock_timestamp()-INTERVAL '10 days')`,
    [purgeableTombstone, workspaceId, userId, tenants[0].document],
  );

  const client = await admin.connect();
  try {
    const dry = await runStudyFlashcardsRetention(client, {
      apply: false,
      batchSize: 10,
    });
    assert.deepEqual(dry, {
      dryRun: true,
      eligibleDecks: "1",
      eligibleReviews: "1",
      eligibleDrafts: "1",
      eligibleTombstones: "1",
      deletedDecks: "0",
      deletedReviews: "0",
      deletedDrafts: "0",
    });
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM study_coach_flashcard_decks WHERE id=$1",
          [expiredDeck],
        )
      ).rows[0].n,
      1,
    );
    const applied = await runStudyFlashcardsRetention(client, {
      apply: true,
      batchSize: 10,
    });
    assert.deepEqual(applied, {
      dryRun: false,
      deletedDecks: "1",
      deletedReviews: "1",
      expiredDrafts: "1",
      purgedTombstones: "1",
      batchSizePerRelation: 10,
    });
  } finally {
    client.release();
  }
  const tombstones = await admin.query(
    "SELECT id,state,payload,saved_deck_id FROM study_coach_flashcard_drafts WHERE id=ANY($1::uuid[]) ORDER BY id",
    [[expiredDeckDraft, expiredDraft]],
  );
  assert.equal(tombstones.rowCount, 2);
  assert.equal(
    tombstones.rows.find((row) => row.id === expiredDeckDraft)?.state,
    "deleted",
  );
  assert.equal(
    tombstones.rows.find((row) => row.id === expiredDraft)?.state,
    "expired",
  );
  assert.ok(
    tombstones.rows.every(
      (row) => row.payload === null && row.saved_deck_id === null,
    ),
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_flashcard_drafts WHERE id=$1",
        [purgeableTombstone],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_flashcard_decks WHERE id=$1",
        [expiredDeck],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_flashcard_reviews WHERE id=$1",
        [expiredReview],
      )
    ).rows[0].n,
    0,
  );
});

test("migration 024 rolls back and reapplies on disposable target without changing prior data", async () => {
  const { admin, name } = fixture;
  const workspaceId = tenants[0].id;
  const userId = people.member;
  const usageId = randomUUID();
  const admissionId = randomUUID();
  await admin.query(
    `INSERT INTO ai_usage_operations
       (operation_id,request_id,workspace_id,user_id,operation,mode,outcome,provider_call_count,started_at,completed_at,duration_ms)
     VALUES($1,$2,$3,$4,'assistant_question','general','success',0,clock_timestamp(),clock_timestamp(),0)`,
    [usageId, randomUUID(), workspaceId, userId],
  );
  await admin.query(
    `INSERT INTO ai_admission_operations
       (operation_id,workspace_id,user_id,operation,state,provider_attempts,planned_provider_calls,max_provider_calls,started_at,finished_at)
     VALUES($1,$2,$3,'assistant_question','completed',0,0,1,clock_timestamp(),clock_timestamp())`,
    [admissionId, workspaceId, userId],
  );
  const prior = {
    usage: (
      await admin.query(
        "SELECT count(*)::int AS n FROM ai_usage_operations WHERE operation_id=$1",
        [usageId],
      )
    ).rows[0].n,
    admission: (
      await admin.query(
        "SELECT count(*)::int AS n FROM ai_admission_operations WHERE operation_id=$1",
        [admissionId],
      )
    ).rows[0].n,
    quizzes: (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_quizzes WHERE user_id=$1",
        [userId],
      )
    ).rows[0].n,
  };
  const client = await admin.connect();
  try {
    const dry = await runPilotRollback024(
      client,
      { apply: false },
      { databaseName: name },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.applied, false);
    assert.equal(dry.unrelatedBusinessRowsDeleted, 0);
    assert.ok(
      "draftRowsLostOnApply" in dry &&
        "savedDeckRowsLostOnApply" in dry &&
        "reviewRowsLostOnApply" in dry,
    );
    const applied = await runPilotRollback024(
      client,
      { apply: true, confirmDatabase: name },
      { databaseName: name },
    );
    assert.equal(applied.applied, true);
  } finally {
    client.release();
  }
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => admin.query(text, values),
      23,
    ),
    "81a06e44c4a79d02f2ce6ed1bd09cd34dbe2e6acd50b26543b8eea400a3f23e1",
  );
  assert.equal(
    (
      await admin.query(
        "SELECT to_regclass('public.study_coach_flashcard_decks') AS name",
      )
    ).rows[0].name,
    null,
  );
  for (const [table, column, id, expected] of [
    ["ai_usage_operations", "operation_id", usageId, prior.usage],
    ["ai_admission_operations", "operation_id", admissionId, prior.admission],
  ])
    assert.equal(
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM ${table} WHERE ${column}=$1`,
          [id],
        )
      ).rows[0].n,
      expected,
    );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_quizzes WHERE user_id=$1",
        [userId],
      )
    ).rows[0].n,
    prior.quizzes,
  );

  const loadThrough024 = async () =>
    (await loadMigrations()).filter(
      (item) => Number(item.name.slice(0, 3)) <= 24,
    );
  await migrate(admin.options.connectionString, { loadSource: loadThrough024 });
  await migrate(admin.options.connectionString, { loadSource: loadThrough024 });
  const migration = (await loadMigrations()).find(
    (item) => item.name === "024_study_coach_flashcards.sql",
  );
  const ledger = await admin.query(
    "SELECT name,checksum FROM schema_migrations ORDER BY name",
  );
  assert.equal(ledger.rowCount, 24);
  assert.equal(ledger.rows.at(-1).checksum, migrationChecksum(migration));
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => admin.query(text, values),
      24,
    ),
    "43348bba96719e0efb18026dee0361c6662d4ed69ee5bd202fdf7e669dd3beca",
  );
  await admin.query("DELETE FROM ai_usage_operations WHERE operation_id=$1", [
    usageId,
  ]);
  await admin.query(
    "DELETE FROM ai_admission_operations WHERE operation_id=$1",
    [admissionId],
  );
});
