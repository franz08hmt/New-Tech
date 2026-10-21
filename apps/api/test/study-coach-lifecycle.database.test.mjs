import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { runPilotRollback023 } from "../scripts/pilot-rollback-023.mjs";
import { runStudyQuizRetention } from "../scripts/study-quiz-retention.mjs";
import {
  loadMigrations,
  migrate,
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
  fixture = await openDocumentsTenantFixture();
});

after(async () => {
  await fixture?.close();
});

test("quiz retention is bounded and migration 023 rolls back/reapplies without changing F03/F04/F07 data", async () => {
  const { admin } = fixture;
  const workspace = tenants[0];
  const user = people.member;
  const expiredQuiz = randomUUID();
  const expiredDraft = randomUUID();
  const expiredAttempt = randomUUID();
  const cancelledDraft = randomUUID();
  await admin.query(
    `INSERT INTO study_coach_quiz_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,saved_quiz_id,created_at,expires_at)
     VALUES($1,$2,$3,$4,repeat('a',64),NULL,'confirmed',$5,
       clock_timestamp()-INTERVAL '91 days',clock_timestamp()-INTERVAL '91 days'+INTERVAL '15 minutes')`,
    [expiredDraft, workspace.id, user, workspace.document, expiredQuiz],
  );
  await admin.query(
    `INSERT INTO study_coach_quizzes
       (id,draft_id,workspace_id,user_id,document_id,document_title,language,schema_version,
        content,question_count,created_at,expires_at)
     VALUES($1,$2,$3,$4,$5,'Expired synthetic quiz','vi','study-quiz-v1',
       '{"schemaVersion":"study-quiz-v1","title":"Expired synthetic quiz","language":"vi","questions":[],"sources":[]}'::jsonb,
       3,clock_timestamp()-INTERVAL '91 days',clock_timestamp()-INTERVAL '1 day')`,
    [expiredQuiz, expiredDraft, workspace.id, user, workspace.document],
  );
  await admin.query(
    `INSERT INTO study_coach_quiz_attempts
       (id,quiz_id,workspace_id,user_id,attempt_key,answer_hash,answers,correct_count,question_count,score_percent)
     VALUES($1,$2,$3,$4,$5,repeat('b',64),'[]'::jsonb,0,3,0)`,
    [expiredAttempt, expiredQuiz, workspace.id, user, randomUUID()],
  );
  await admin.query(
    `INSERT INTO study_coach_quiz_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,created_at,expires_at)
     VALUES($1,$2,$3,$4,repeat('c',64),NULL,'cancelled',
       clock_timestamp()-INTERVAL '1 hour',clock_timestamp()-INTERVAL '45 minutes')`,
    [cancelledDraft, workspace.id, user, workspace.document],
  );
  const retentionClient = await admin.connect();
  try {
    const dry = await runStudyQuizRetention(retentionClient, {
      apply: false,
      batchSize: 10,
    });
    assert.deepEqual(dry, {
      dryRun: true,
      eligibleQuizzes: "1",
      eligibleDrafts: "2",
      eligibleAttempts: "1",
      deletedQuizzes: "0",
      deletedDrafts: "0",
      deletedAttempts: "0",
    });
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM study_coach_quizzes WHERE id=$1",
          [expiredQuiz],
        )
      ).rows[0].n,
      1,
    );
    const purged = await runStudyQuizRetention(retentionClient, {
      apply: true,
      batchSize: 10,
    });
    assert.deepEqual(purged, {
      dryRun: false,
      deletedQuizzes: "1",
      deletedDrafts: "2",
      deletedAttempts: "1",
      batchSizePerRelation: 10,
    });
  } finally {
    retentionClient.release();
  }
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_quiz_drafts WHERE id=ANY($1::uuid[])",
        [[expiredDraft, cancelledDraft]],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM study_coach_quiz_attempts WHERE id=$1",
        [expiredAttempt],
      )
    ).rows[0].n,
    0,
  );

  const receiptId = randomUUID();
  const conversationId = randomUUID();
  const createKey = randomUUID();
  const requestId = randomUUID();
  const turnId = randomUUID();
  const usageId = randomUUID();
  const admissionId = randomUUID();
  await admin.query(
    `INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash)
     VALUES($1,$2,$3,'general',$4,repeat('d',64))`,
    [receiptId, workspace.id, user, requestId],
  );
  await admin.query(
    `INSERT INTO assistant_conversations
       (id,workspace_id,user_id,mode,title,create_key,version,turn_count,content_bytes)
     VALUES($1,$2,$3,'general','Preserved F07 conversation',$4,1,1,32)`,
    [conversationId, workspace.id, user, createKey],
  );
  await admin.query(
    "INSERT INTO assistant_conversation_create_keys(workspace_id,user_id,create_key) VALUES($1,$2,$3)",
    [workspace.id, user, createKey],
  );
  await admin.query(
    `INSERT INTO assistant_conversation_turns
       (id,conversation_id,workspace_id,user_id,sequence,request_id,receipt_id,snapshot)
     VALUES($1,$2,$3,$4,1,$5,$6,'{"synthetic":"preserve"}'::jsonb)`,
    [turnId, conversationId, workspace.id, user, randomUUID(), receiptId],
  );
  await admin.query(
    `INSERT INTO ai_usage_operations
       (operation_id,request_id,workspace_id,user_id,operation,mode,outcome,provider_call_count,
        started_at,completed_at,duration_ms)
     VALUES($1,$2,$3,$4,'assistant_question','general','success',0,clock_timestamp(),clock_timestamp(),0)`,
    [usageId, randomUUID(), workspace.id, user],
  );
  await admin.query(
    `INSERT INTO ai_admission_user_daily(user_id,budget_day,used_operations)
     VALUES($1,(timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date,1)`,
    [user],
  );
  await admin.query(
    `INSERT INTO ai_admission_operations
       (operation_id,workspace_id,user_id,operation,state,provider_attempts,planned_provider_calls,
        max_provider_calls,started_at,finished_at)
     VALUES($1,$2,$3,'assistant_question','completed',0,0,1,clock_timestamp(),clock_timestamp())`,
    [admissionId, workspace.id, user],
  );

  const activeDraft = randomUUID();
  const activeQuiz = randomUUID();
  const activeAttempt = randomUUID();
  await admin.query(
    `INSERT INTO study_coach_quiz_drafts
       (id,workspace_id,user_id,document_id,token_hash,payload,state,saved_quiz_id)
     VALUES($1,$2,$3,$4,repeat('e',64),NULL,'confirmed',$5)`,
    [activeDraft, workspace.id, user, workspace.document, activeQuiz],
  );
  await admin.query(
    `INSERT INTO study_coach_quizzes
       (id,draft_id,workspace_id,user_id,document_id,document_title,language,schema_version,content,question_count)
     VALUES($1,$2,$3,$4,$5,'Active synthetic quiz','en','study-quiz-v1',
       '{"schemaVersion":"study-quiz-v1","title":"Active synthetic quiz","language":"en","questions":[],"sources":[]}'::jsonb,3)`,
    [activeQuiz, activeDraft, workspace.id, user, workspace.document],
  );
  await admin.query(
    `INSERT INTO study_coach_quiz_attempts
       (id,quiz_id,workspace_id,user_id,attempt_key,answer_hash,answers,correct_count,question_count,score_percent)
     VALUES($1,$2,$3,$4,$5,repeat('f',64),'[]'::jsonb,0,3,0)`,
    [activeAttempt, activeQuiz, workspace.id, user, randomUUID()],
  );

  const baseline22 =
    "befdd28ceed598d7b6009c24e42b116f2264c47e886319100512563538f409fa";
  const rollbackClient = await admin.connect();
  try {
    await assert.rejects(
      runPilotRollback023(
        rollbackClient,
        { apply: true, confirmDatabase: "wrong_test" },
        { databaseName: fixture.name },
      ),
      /exact disposable database confirmation/,
    );
    const dry = await runPilotRollback023(
      rollbackClient,
      { apply: false },
      { databaseName: fixture.name },
    );
    assert.equal(dry.dryRun, true);
    assert.equal(dry.quizContentLostOnApply, "1");
    assert.equal(dry.draftContentLostOnApply, "1");
    assert.equal(dry.attemptsLostOnApply, "1");
    assert.equal(dry.businessRowsDeleted, 0);
    assert.equal(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM study_coach_quizzes WHERE id=$1",
          [activeQuiz],
        )
      ).rows[0].n,
      1,
    );
    const rolled = await runPilotRollback023(
      rollbackClient,
      { apply: true, confirmDatabase: fixture.name },
      { databaseName: fixture.name },
    );
    assert.equal(rolled.applied, true);
  } finally {
    rollbackClient.release();
  }
  assert.equal(
    await runtimeCapabilityCatalogDigest(
      (text, values) => admin.query(text, values),
      22,
    ),
    baseline22,
  );
  for (const [table, key, id] of [
    ["assistant_answer_receipts", "id", receiptId],
    ["assistant_conversations", "id", conversationId],
    ["assistant_conversation_turns", "id", turnId],
    ["ai_usage_operations", "operation_id", usageId],
    ["ai_admission_operations", "operation_id", admissionId],
  ]) {
    assert.equal(
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM public.${table} WHERE ${key}=$1`,
          [id],
        )
      ).rows[0].n,
      1,
    );
  }
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM ai_admission_user_daily WHERE user_id=$1",
        [user],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM schema_migrations WHERE name='023_study_coach_quizzes.sql'",
      )
    ).rows[0].n,
    0,
  );

  await migrate(admin.options.connectionString);
  await migrate(admin.options.connectionString);
  const migrations = await loadMigrations();
  const migration = migrations.find(
    (item) => item.name === "023_study_coach_quizzes.sql",
  );
  const ledger = await admin.query(
    "SELECT name,checksum FROM schema_migrations ORDER BY name",
  );
  assert.equal(ledger.rowCount, 23);
  assert.equal(ledger.rows.at(-1).checksum, migrationChecksum(migration));
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
        "SELECT count(*)::int AS n FROM assistant_conversations WHERE id=$1",
        [conversationId],
      )
    ).rows[0].n,
    1,
  );

  const f08Usage = randomUUID();
  const f08Admission = randomUUID();
  await admin.query(
    `INSERT INTO ai_usage_operations
       (operation_id,request_id,workspace_id,user_id,operation,mode,prompt_id,prompt_version,outcome,
        provider_call_count,started_at,completed_at,duration_ms)
     VALUES($1,$2,$3,$4,'study_quiz','documents','study-coach.quiz','quiz-v1','success',0,
       clock_timestamp(),clock_timestamp(),0)`,
    [f08Usage, randomUUID(), workspace.id, user],
  );
  await admin.query(
    `INSERT INTO ai_admission_operations
       (operation_id,workspace_id,user_id,operation,state,provider_attempts,planned_provider_calls,
        max_provider_calls,started_at,finished_at)
     VALUES($1,$2,$3,'study_quiz','completed',0,0,2,clock_timestamp(),clock_timestamp())`,
    [f08Admission, workspace.id, user],
  );
  const guarded = await admin.connect();
  try {
    await assert.rejects(
      runPilotRollback023(
        guarded,
        { apply: true, confirmDatabase: fixture.name },
        { databaseName: fixture.name },
      ),
      /F08 usage or admission rows exist/,
    );
  } finally {
    guarded.release();
  }
  assert.equal(
    (
      await admin.query(
        "SELECT count(*)::int AS n FROM schema_migrations WHERE name='023_study_coach_quizzes.sql'",
      )
    ).rows[0].n,
    1,
  );
  await admin.query("DELETE FROM ai_usage_operations WHERE operation_id=$1", [
    f08Usage,
  ]);
  await admin.query(
    "DELETE FROM ai_admission_operations WHERE operation_id=$1",
    [f08Admission],
  );
});
