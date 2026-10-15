import "reflect-metadata";
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { DatabaseService } from "../dist/database/database.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { FeedbackService } from "../dist/feedback/feedback.service.js";
import { validSnapshot } from "../dist/feedback/feedback-validation.js";
import { loadMigrations, migrate } from "../scripts/migrate.mjs";
import { assertTestDatabaseTarget } from "../scripts/test-database-target.mjs";
import { prepareAuthFixture } from "./disposable-auth-fixture.mjs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { testArtifacts } from "./test-artifacts.mjs";
import { exportFeedback } from "../scripts/export-assistant-feedback.mjs";

// No environment loader or cloud connection: guard before any Pool, then own
// and clean up only this suite's exact randomly named disposable database.
const parentUrl = assertTestDatabaseTarget(process.env.TEST_DATABASE_URL);
const names = [
  "DATABASE_URL",
  "DATABASE_SSL",
  "DATABASE_CA_CERT_PATH",
  "DATABASE_POOL_MAX",
  "PILOT_WORKSPACE_ID",
];
const saved = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
const databaseName = `examate_receipt_ownership_${randomUUID().replaceAll("-", "")}_test`;
const target = new URL(parentUrl);
target.pathname = `/${databaseName}`;
const url = assertTestDatabaseTarget(target.href);
const legacyId = randomUUID(),
  legacyWorkspace = randomUUID();
let parent,
  admin,
  database,
  access,
  feedback,
  legacyBefore,
  created = false;

// Independent canonical oracle: do not reuse the receipt implementation's hash.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const input = () => ({
  mode: "general",
  message: "  Synthetic study question  ",
  courseId: null,
  documentId: null,
});
const response = () => ({
  mode: "general",
  answer: "Synthetic study answer",
  answerable: true,
  reasonCode: "ANSWER_GENERATED",
  citations: [],
  ragEnabled: false,
  provider: "google",
  model: "synthetic-fixture-model",
  promptVersion: "general-v1",
});
const snapshot = (request, result) => ({
  schemaVersion: 1,
  request: {
    mode: result.mode,
    operation: request.operation ?? "question",
    question: request.message.trim(),
    ...(request.courseId ? { courseId: request.courseId } : {}),
    ...(request.documentId ? { documentId: request.documentId } : {}),
  },
  response: result,
});
const payload = (answerId, value) => ({
  answerId,
  submissionId: randomUUID(),
  rating: "helpful",
  reasons: [],
  snapshot: value,
});
async function owned(pool, name) {
  assert.equal(
    (
      await pool.query(
        "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=$1",
        [name],
      )
    ).rows[0]?.owned,
    true,
    "fixture must own the exact database",
  );
}

before(async () => {
  Object.assign(process.env, {
    DATABASE_SSL: "false",
    DATABASE_CA_CERT_PATH: "",
    DATABASE_POOL_MAX: "3",
    PILOT_WORKSPACE_ID: legacyWorkspace,
  });
  parent = new pg.Pool({ connectionString: parentUrl, ssl: false, max: 1 });
  await owned(parent, decodeURIComponent(new URL(parentUrl).pathname.slice(1)));
  await parent.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  admin = new pg.Pool({ connectionString: url, ssl: false, max: 1 });
  await owned(admin, databaseName);
  await prepareAuthFixture(admin);
  await migrate(url, {
    loadSource: async () =>
      (await loadMigrations()).filter((f) => Number(f.name.slice(0, 3)) <= 14),
  });
  await admin.query(
    "INSERT INTO assistant_feedback(id,answer_id,submission_id,rating,reasons,snapshot,payload_hash,workspace_id) VALUES($1,$2,$3,'helpful','{}',$4::json,$5,$6)",
    [
      legacyId,
      randomUUID(),
      randomUUID(),
      canonical(snapshot(input(), response())),
      "a".repeat(64),
      legacyWorkspace,
    ],
  );
  legacyBefore = (
    await admin.query("SELECT * FROM assistant_feedback WHERE id=$1", [
      legacyId,
    ])
  ).rows[0];
  await migrate(url);
  process.env.DATABASE_URL = url;
  database = new DatabaseService();
  access = new DocumentAccessService(new AuthStore(database));
  feedback = new FeedbackService(database, access);
});

after(async () => {
  try {
    await database?.onModuleDestroy();
    await admin?.end();
    if (created) {
      assertTestDatabaseTarget(url, { runtimeUrl: saved.DATABASE_URL ?? "" });
      assert.match(
        databaseName,
        /^examate_receipt_ownership_[a-f0-9]{32}_test$/,
      );
      await owned(parent, databaseName);
      await parent.query(`DROP DATABASE "${databaseName}"`);
    }
  } finally {
    await parent?.end();
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

// Every test owns fresh identities; no DELETE/TRUNCATE of shared application rows.
async function fixture(role = "member") {
  const users = [randomUUID(), randomUUID()],
    workspaces = [randomUUID(), randomUUID()];
  await admin.query("INSERT INTO auth.users(id) VALUES($1),($2)", users);
  await admin.query("INSERT INTO workspaces(id) VALUES($1),($2)", workspaces);
  for (const workspaceId of workspaces)
    for (const [index, userId] of users.entries())
      await admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
        [workspaceId, userId, index === 0 ? role : "member"],
      );
  const principal = { userId: users[0], workspaceId: workspaces[0], role };
  const { AnswerReceiptService } =
    await import("../dist/assistant/answer-receipt.service.js");
  const receipts = new AnswerReceiptService(database, access);
  const request = input(),
    result = response(),
    requestId = randomUUID();
  const answerId = await receipts.issue(request, result, principal, requestId);
  return {
    users,
    workspaces,
    principal,
    receipts,
    request,
    result,
    requestId,
    answerId,
    body: payload(answerId, snapshot(request, result)),
  };
}
test("real SQL feedback export contains only the requested workspace, for rating and explicit IDs", async (t) => {
  const f = await fixture();
  const own = await feedback.create(f.body, f.principal);
  const otherPrincipal = { ...f.principal, workspaceId: f.workspaces[1] };
  const otherId = await f.receipts.issue(
    f.request,
    f.result,
    otherPrincipal,
    randomUUID(),
  );
  const other = await feedback.create(
    { ...f.body, answerId: otherId, submissionId: randomUUID() },
    otherPrincipal,
  );
  for (const explicit of [true, false]) {
    const output = resolve(
      testArtifacts(t),
      explicit ? "ids.json" : "rating.json",
    );
    await exportFeedback(
      {
        workspaceId: f.principal.workspaceId,
        output,
        ...(explicit
          ? { ids: [own.id, other.id] }
          : { rating: "helpful", limit: 50 }),
      },
      database,
    );
    const artifact = JSON.parse(await readFile(output, "utf8"));
    assert.equal(artifact.candidates.length, 1);
    assert.equal(artifact.candidates[0].feedbackId, own.id);
    assert.equal(artifact.candidates[0].attribution, "receipt_linked");
    if (explicit) assert.deepEqual(artifact.notFoundIds, [other.id]);
  }
});

async function persistedState() {
  return {
    receipts: (
      await admin.query("SELECT * FROM assistant_answer_receipts ORDER BY id")
    ).rows,
    feedback: (
      await admin.query("SELECT * FROM assistant_feedback ORDER BY id")
    ).rows,
  };
}
async function refused(operation, status, fixture) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.getStatus?.(), status);
    const text = JSON.stringify(error.getResponse?.() ?? error.message);
    assert.doesNotMatch(
      text,
      /SELECT|snapshot_hash|workspace_id|user_id|Synthetic|stack/,
    );
    for (const id of [
      ...fixture.users,
      ...fixture.workspaces,
      fixture.answerId,
    ])
      assert.equal(text.includes(id), false);
    return true;
  });
}

for (const role of ["member", "viewer"])
  test(`real SQL ${role} receipt binds owner and canonical snapshot; feedback retry preserves one row`, async () => {
    const f = await fixture(role);
    assert.match(
      f.answerId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const receipt = (
      await admin.query("SELECT * FROM assistant_answer_receipts WHERE id=$1", [
        f.answerId,
      ])
    ).rows[0];
    assert.equal(receipt.workspace_id, f.principal.workspaceId);
    assert.equal(receipt.user_id, f.principal.userId);
    assert.equal(receipt.request_id, f.requestId);
    assert.equal(receipt.mode, "general");
    assert.equal(receipt.snapshot_hash, hash(f.body.snapshot));
    const ack = await feedback.create(f.body, f.principal);
    const stored = (
      await admin.query("SELECT * FROM assistant_feedback WHERE id=$1", [
        ack.id,
      ])
    ).rows[0];
    assert.equal(stored.receipt_id, f.answerId);
    assert.equal(stored.user_id, f.principal.userId);
    assert.equal(stored.workspace_id, f.principal.workspaceId);
    const beforeRetry = await persistedState();
    assert.deepEqual(await feedback.create(f.body, f.principal), ack);
    assert.deepEqual(await persistedState(), beforeRetry);
  });

test("real SQL receipt canonical hash includes non-null document/course and operation", async () => {
  const f = await fixture();
  const request = {
    ...input(),
    mode: "documents",
    operation: "summarize",
    courseId: randomUUID(),
    documentId: randomUUID(),
  };
  const result = {
    ...response(),
    mode: "documents",
    ragEnabled: true,
    answerable: false,
    reasonCode: "NO_RELEVANT_EVIDENCE",
  };
  const id = await f.receipts.issue(request, result, f.principal, randomUUID());
  const row = (
    await admin.query(
      "SELECT snapshot_hash,mode FROM assistant_answer_receipts WHERE id=$1",
      [id],
    )
  ).rows[0];
  assert.equal(row.mode, "documents");
  assert.equal(row.snapshot_hash, hash(snapshot(request, result)));
  assert.notEqual(row.snapshot_hash, hash(f.body.snapshot));
});

for (const attack of [
  "other user",
  "other workspace",
  "fabricated UUID",
  "changed answer",
  "changed question",
])
  test(`real SQL ${attack} feedback gets generic 404 and leaves every receipt/feedback row unchanged`, async () => {
    const f = await fixture(),
      body = structuredClone(f.body),
      principal = { ...f.principal };
    if (attack === "other user") principal.userId = f.users[1];
    if (attack === "other workspace") principal.workspaceId = f.workspaces[1];
    if (attack === "fabricated UUID") body.answerId = randomUUID();
    if (attack === "changed answer")
      body.snapshot.response.answer = "Synthetic altered answer";
    if (attack === "changed question")
      body.snapshot.request.question = "Synthetic altered question";
    const before = await persistedState();
    await refused(() => feedback.create(body, principal), 404, f);
    assert.deepEqual(await persistedState(), before);
  });

test("real SQL fresh revocation blocks receipt issuance and viewer feedback", async () => {
  const f = await fixture("viewer");
  await admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [f.principal.workspaceId, f.principal.userId],
  );
  const before = await persistedState();
  await refused(
    () => f.receipts.issue(f.request, f.result, f.principal, randomUUID()),
    403,
    f,
  );
  await refused(() => feedback.create(f.body, f.principal), 403, f);
  assert.deepEqual(await persistedState(), before);
});

test("migration 015 preserves legacy feedback content and leaves its ownership NULL", async () => {
  const row = (
    await admin.query("SELECT * FROM assistant_feedback WHERE id=$1", [
      legacyId,
    ])
  ).rows[0];
  const { receipt_id, user_id, ...legacyAfter } = row;
  assert.equal(receipt_id, null);
  assert.equal(user_id, null);
  assert.deepEqual(legacyAfter, legacyBefore);
});

test("user deletion retains receipt and feedback with NULL users; workspace deletion stays restricted", async () => {
  const f = await fixture();
  const ack = await feedback.create(f.body, f.principal);
  const receiptOnlyOwner = {
    userId: f.users[1],
    workspaceId: f.workspaces[1],
    role: "member",
  };
  const receiptOnlyId = await f.receipts.issue(
    f.request,
    f.result,
    receiptOnlyOwner,
    randomUUID(),
  );
  await admin.query("DELETE FROM workspace_memberships WHERE user_id=$1", [
    f.principal.userId,
  ]);
  await admin.query("DELETE FROM auth.users WHERE id=$1", [f.principal.userId]);
  const receipt = (
    await admin.query(
      "SELECT user_id,workspace_id,snapshot_hash FROM assistant_answer_receipts WHERE id=$1",
      [f.answerId],
    )
  ).rows[0];
  const row = (
    await admin.query(
      "SELECT user_id,receipt_id,workspace_id,snapshot FROM assistant_feedback WHERE id=$1",
      [ack.id],
    )
  ).rows[0];
  assert.equal(receipt.user_id, null);
  assert.equal(receipt.snapshot_hash, hash(f.body.snapshot));
  assert.equal(row.user_id, null);
  assert.equal(row.receipt_id, f.answerId);
  assert.deepEqual(row.snapshot, f.body.snapshot);
  // The second workspace has only a receipt; memberships/feedback cannot mask its FK.
  await admin.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [
    receiptOnlyOwner.workspaceId,
  ]);
  const beforeDelete = await persistedState();
  await assert.rejects(
    admin.query("DELETE FROM workspaces WHERE id=$1", [
      receiptOnlyOwner.workspaceId,
    ]),
    (error) => {
      assert.equal(error.code, "23503");
      assert.equal(
        error.constraint,
        "assistant_answer_receipts_workspace_id_fkey",
      );
      return true;
    },
  );
  assert.deepEqual(await persistedState(), beforeDelete);
  assert.equal(
    (
      await admin.query(
        "SELECT workspace_id FROM assistant_answer_receipts WHERE id=$1",
        [receiptOnlyId],
      )
    ).rows[0].workspace_id,
    receiptOnlyOwner.workspaceId,
  );
  assert.equal(receipt.workspace_id, f.principal.workspaceId);
  assert.equal(row.workspace_id, f.principal.workspaceId);
});

function followUp(request, receiptId, value) {
  return {
    ...request,
    message: "Explain the previous answer further",
    operation: "question",
    history: [{ receiptId, snapshot: value }],
  };
}

async function historyRefused(operation, fixture, status = 400) {
  await assert.rejects(operation, (error) => {
    assert.equal(error.getStatus?.(), status);
    const response = error.getResponse?.();
    assert.equal(
      response?.code,
      status === 403 ? "WORKSPACE_ACCESS_DENIED" : "HISTORY_INVALID",
    );
    const text = JSON.stringify(response);
    assert.doesNotMatch(
      text,
      /SELECT|snapshot_hash|workspace_id|user_id|Synthetic|stack/,
    );
    for (const id of [
      ...fixture.users,
      ...fixture.workspaces,
      fixture.answerId,
    ])
      assert.equal(text.includes(id), false);
    return true;
  });
}

for (const role of ["member", "viewer"])
  test(`real SQL ${role} verifies their own history without writing receipt or feedback rows`, async () => {
    const f = await fixture(role);
    const before = await persistedState();
    await f.receipts.verifyHistory(
      followUp(f.request, f.answerId, f.body.snapshot),
      f.principal,
    );
    assert.deepEqual(await persistedState(), before);
  });

test("real SQL second user verifies their own receipt in the second workspace", async () => {
  const f = await fixture();
  const principal = {
    userId: f.users[1],
    workspaceId: f.workspaces[1],
    role: "member",
  };
  const receiptId = await f.receipts.issue(
    f.request,
    f.result,
    principal,
    randomUUID(),
  );
  const before = await persistedState();
  await f.receipts.verifyHistory(
    followUp(f.request, receiptId, f.body.snapshot),
    principal,
  );
  assert.deepEqual(await persistedState(), before);
});

for (const attack of [
  "other user",
  "other workspace",
  "fabricated UUID",
  "changed answer hash",
  "changed question hash",
  "different request mode",
  "different stored receipt mode",
])
  test(`real SQL ${attack} history returns HISTORY_INVALID without changing any receipt or feedback row`, async () => {
    const f = await fixture();
    const request = followUp(
      f.request,
      f.answerId,
      structuredClone(f.body.snapshot),
    );
    const principal = { ...f.principal };
    if (attack === "other user") principal.userId = f.users[1];
    if (attack === "other workspace") principal.workspaceId = f.workspaces[1];
    if (attack === "fabricated UUID")
      request.history[0].receiptId = randomUUID();
    if (attack === "changed answer hash")
      request.history[0].snapshot.response.answer = "Synthetic altered answer";
    if (attack === "changed question hash")
      request.history[0].snapshot.request.question =
        "Synthetic altered question";
    if (attack === "different request mode") request.mode = "documents";
    if (attack === "different stored receipt mode")
      await admin.query(
        "UPDATE assistant_answer_receipts SET mode='documents' WHERE id=$1",
        [f.answerId],
      );
    const before = await persistedState();
    await historyRefused(() => f.receipts.verifyHistory(request, principal), f);
    assert.deepEqual(await persistedState(), before);
  });

for (const [label, change] of [
  [
    "different course",
    (request) => {
      request.courseId = randomUUID();
    },
  ],
  [
    "removed course",
    (request) => {
      request.courseId = null;
    },
  ],
  [
    "different document",
    (request) => {
      request.documentId = randomUUID();
    },
  ],
  [
    "removed document",
    (request) => {
      request.documentId = null;
    },
  ],
])
  test(`real SQL ${label} history is rejected even with a matching owned snapshot hash`, async () => {
    const f = await fixture();
    const priorRequest = {
      ...input(),
      mode: "documents",
      courseId: randomUUID(),
      documentId: randomUUID(),
    };
    const priorResult = {
      ...response(),
      mode: "documents",
      ragEnabled: true,
      answerable: false,
      reasonCode: "NO_RELEVANT_EVIDENCE",
    };
    const priorSnapshot = snapshot(priorRequest, priorResult);
    assert.equal(validSnapshot(priorSnapshot), true);
    const receiptId = await f.receipts.issue(
      priorRequest,
      priorResult,
      f.principal,
      randomUUID(),
    );
    const request = followUp(priorRequest, receiptId, priorSnapshot);
    change(request);
    const before = await persistedState();
    await historyRefused(
      () => f.receipts.verifyHistory(request, f.principal),
      f,
    );
    assert.deepEqual(await persistedState(), before);
  });

test("real SQL matching document and course scope verifies a prior refusal without writes", async () => {
  const f = await fixture();
  const priorRequest = {
    ...input(),
    mode: "documents",
    courseId: randomUUID(),
    documentId: randomUUID(),
  };
  const priorResult = {
    ...response(),
    mode: "documents",
    ragEnabled: true,
    answerable: false,
    reasonCode: "NO_RELEVANT_EVIDENCE",
  };
  const receiptId = await f.receipts.issue(
    priorRequest,
    priorResult,
    f.principal,
    randomUUID(),
  );
  const before = await persistedState();
  await f.receipts.verifyHistory(
    followUp(priorRequest, receiptId, snapshot(priorRequest, priorResult)),
    f.principal,
  );
  assert.deepEqual(await persistedState(), before);
});

test("real SQL fresh membership revocation blocks history verification with 403", async () => {
  const f = await fixture("viewer");
  await admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [f.principal.workspaceId, f.principal.userId],
  );
  const before = await persistedState();
  await historyRefused(
    () =>
      f.receipts.verifyHistory(
        followUp(f.request, f.answerId, f.body.snapshot),
        f.principal,
      ),
    f,
    403,
  );
  assert.deepEqual(await persistedState(), before);
});

test("real SQL response context metadata remains valid for hashing, feedback, and later history", async () => {
  const f = await fixture("viewer");
  const request = followUp(f.request, f.answerId, f.body.snapshot);
  const result = {
    ...response(),
    contextTurnsUsed: 1,
    contextTruncated: false,
  };
  const value = snapshot(request, result);
  assert.equal(
    validSnapshot(value),
    true,
    "feedback DTO must accept context response fields",
  );
  assert.equal(Object.hasOwn(value.request, "history"), false);
  const receiptId = await f.receipts.issue(
    request,
    result,
    f.principal,
    randomUUID(),
  );
  const receipt = (
    await admin.query(
      "SELECT snapshot_hash FROM assistant_answer_receipts WHERE id=$1",
      [receiptId],
    )
  ).rows[0];
  assert.equal(receipt.snapshot_hash, hash(value));
  const body = payload(receiptId, value);
  const ack = await feedback.create(body, f.principal);
  const row = (
    await admin.query(
      "SELECT receipt_id,snapshot FROM assistant_feedback WHERE id=$1",
      [ack.id],
    )
  ).rows[0];
  assert.equal(row.receipt_id, receiptId);
  assert.deepEqual(row.snapshot, value);
  const before = await persistedState();
  assert.deepEqual(await feedback.create(body, f.principal), ack);
  await f.receipts.verifyHistory(
    followUp(f.request, receiptId, value),
    f.principal,
  );
  assert.deepEqual(await persistedState(), before);
});
