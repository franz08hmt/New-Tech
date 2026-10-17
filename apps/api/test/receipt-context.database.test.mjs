import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  openReceiptTenantFixture,
  tenants,
  people,
  tenantPrincipal,
  loseNextCommit,
} from "./receipt-tenant-fixture.mjs";
import {
  receiptInput,
  receiptAnswer,
  snapshotOf,
  feedbackInput,
  digest,
  deferred,
  bounded,
  canonical,
} from "./receipt-context-fixture.mjs";
let f;
const [A, B, inactive] = tenants;
before(async () => {
  f = await openReceiptTenantFixture();
});
after(async () => {
  await f?.close();
});
async function issued(p = tenantPrincipal(A), services = f) {
  const input = receiptInput(),
    answer = receiptAnswer(),
    snapshot = snapshotOf(input, answer);
  let id;
  await assert.doesNotReject(async () => {
    id = await services.receipts.issue(input, answer, p, randomUUID());
  }, "authorized non-owner positive receipt must persist successfully");
  return {
    id,
    input,
    answer,
    snapshot,
    p,
    body: feedbackInput(id, snapshot),
    history: { ...input, history: [{ receiptId: id, snapshot }] },
  };
}
const code = (status, name) => (e) =>
  e.getStatus?.() === status && (!name || e.getResponse()?.code === name);
const snapshotRows = async () => ({
  receipts: (
    await f.admin.query("SELECT * FROM assistant_answer_receipts ORDER BY id")
  ).rows,
  feedback: (
    await f.admin.query("SELECT * FROM assistant_feedback ORDER BY id")
  ).rows,
});

test("receipt runtime is a real non-owner without role escalation; FOR SHARE cannot mutate protected rows", async () => {
  const r = (
    await f.db.query(
      "SELECT current_user=session_user AS same,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships FROM pg_roles r WHERE rolname=current_user",
    )
  ).rows[0];
  assert.deepEqual(r, {
    same: true,
    rolsuper: false,
    rolbypassrls: false,
    rolcreatedb: false,
    rolcreaterole: false,
    memberships: 0,
  });
  const item = await issued(),
    before = await snapshotRows();
  await f.db.workspaceTransaction(item.p, async (tx) => {
    await f.access.authorize(item.p, "read", tx);
    assert.equal(
      (
        await tx.query(
          "SELECT id FROM assistant_answer_receipts WHERE id=$1 FOR SHARE",
          [item.id],
        )
      ).rowCount,
      1,
    );
  });
  for (const sql of [
    "UPDATE assistant_answer_receipts SET id=id",
    "DELETE FROM assistant_answer_receipts",
    "UPDATE assistant_feedback SET rating='helpful'",
    "DELETE FROM assistant_feedback",
    "UPDATE workspace_memberships SET user_id=user_id",
    "UPDATE workspaces SET id=id",
  ])
    await assert.rejects(
      f.db.workspaceTransaction(item.p, (tx) => tx.query(sql)),
      (e) => e.code === "42501",
    );
  assert.deepEqual(await snapshotRows(), before);
});
for (const role of ["manager", "member", "viewer"])
  test(`non-owner ${role} issues canonical receipt, verifies history and replays own feedback`, async () => {
    const item = await issued(tenantPrincipal(A, role));
    const row = (
      await f.admin.query(
        "SELECT * FROM assistant_answer_receipts WHERE id=$1",
        [item.id],
      )
    ).rows[0];
    assert.equal(row.user_id, item.p.userId);
    assert.equal(row.workspace_id, A.id);
    assert.equal(row.snapshot_hash, digest(item.snapshot));
    assert.deepEqual(Object.keys(row).sort(), [
      "created_at",
      "id",
      "mode",
      "request_id",
      "snapshot_hash",
      "user_id",
      "workspace_id",
    ]);
    await f.receipts.verifyHistory(item.history, item.p);
    const first = await f.feedback.create(item.body, item.p),
      replay = await f.feedback.create(item.body, item.p);
    assert.deepEqual(replay, first);
    assert.equal(
      (
        await f.admin.query(
          "SELECT count(*)::int AS n FROM assistant_feedback WHERE answer_id=$1",
          [item.id],
        )
      ).rows[0].n,
      1,
    );
  });

test("same workspace other user, foreign workspace, fabricated receipt and tampered snapshot are generic and non-mutating", async () => {
  const item = await issued(),
    before = await snapshotRows();
  for (const p of [tenantPrincipal(A, "manager"), tenantPrincipal(B)]) {
    await assert.rejects(
      f.receipts.verifyHistory(item.history, p),
      code(400, "HISTORY_INVALID"),
    );
    await assert.rejects(
      f.feedback.create(item.body, p),
      code(404, "ANSWER_RECEIPT_NOT_FOUND"),
    );
  }
  for (const alter of [
    (value) => (value.response.answer += " changed"),
    (value) => (value.request.mode = "documents"),
    (value) => (value.request.documentId = A.document),
  ]) {
    const snapshot = structuredClone(item.snapshot);
    alter(snapshot);
    await assert.rejects(
      f.receipts.verifyHistory(
        { ...item.input, history: [{ receiptId: item.id, snapshot }] },
        item.p,
      ),
      code(400, "HISTORY_INVALID"),
    );
    await assert.rejects(
      f.feedback.create({ ...item.body, snapshot }, item.p),
      code(404, "ANSWER_RECEIPT_NOT_FOUND"),
    );
  }
  await assert.rejects(
    f.feedback.create({ ...item.body, answerId: randomUUID() }, item.p),
    code(404),
  );
  assert.deepEqual(await snapshotRows(), before);
});

test("raw no-WHERE selects isolate user+workspace; missing/empty context and legacy NULL attribution stay invisible", async () => {
  const owned = await issued(),
    other = await issued(tenantPrincipal(A, "viewer")),
    foreign = await issued(tenantPrincipal(B));
  for (const item of [owned, other, foreign])
    await f.feedback.create(item.body, item.p);
  const legacyId = randomUUID(),
    legacyReceipt = randomUUID();
  await f.admin.query(
    "INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash) VALUES($1,$2,NULL,'general',$3,$4)",
    [legacyReceipt, A.id, randomUUID(), digest(owned.snapshot)],
  );
  await f.admin.query(
    "INSERT INTO assistant_feedback(id,answer_id,submission_id,rating,snapshot,payload_hash,workspace_id) VALUES($1,$2,$3,'helpful',$4::json,$5,$6)",
    [
      legacyId,
      randomUUID(),
      randomUUID(),
      canonical(owned.snapshot),
      "a".repeat(64),
      A.id,
    ],
  );
  const before = await snapshotRows();
  for (const item of [owned, other, foreign])
    await f.db.workspaceTransaction(item.p, async (tx) => {
      for (const table of ["assistant_answer_receipts", "assistant_feedback"]) {
        const rows = (
          await tx.query(`SELECT id,user_id,workspace_id FROM ${table}`)
        ).rows;
        assert.ok(rows.length > 0);
        assert.ok(
          rows.every(
            (r) =>
              r.user_id === item.p.userId &&
              r.workspace_id === item.p.workspaceId,
          ),
        );
        assert.ok(
          rows.every((r) => r.id !== legacyId && r.id !== legacyReceipt),
        );
      }
    });
  for (const table of ["assistant_answer_receipts", "assistant_feedback"])
    assert.equal((await f.db.query(`SELECT id FROM ${table}`)).rowCount, 0);
  await f.db.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('examate.user_id','',true),set_config('examate.workspace_id','',true)",
    );
    assert.equal(
      (await tx.query("SELECT id FROM assistant_feedback")).rowCount,
      0,
    );
  });
  assert.deepEqual(await snapshotRows(), before);
});

test("forged raw INSERT owner/workspace and receipt association are denied without row changes", async () => {
  const owned = await issued(),
    other = await issued(tenantPrincipal(A, "viewer")),
    before = await snapshotRows();
  for (const [workspaceId, userId] of [
    [A.id, people.viewer],
    [B.id, owned.p.userId],
  ])
    await assert.rejects(
      f.db.workspaceTransaction(owned.p, (tx) =>
        tx.query(
          "INSERT INTO assistant_answer_receipts(id,workspace_id,user_id,mode,request_id,snapshot_hash) VALUES($1,$2,$3,'general',$4,$5)",
          [
            randomUUID(),
            workspaceId,
            userId,
            randomUUID(),
            digest(owned.snapshot),
          ],
        ),
      ),
      (e) => e.code === "42501",
    );
  await assert.rejects(
    f.db.workspaceTransaction(owned.p, (tx) =>
      tx.query(
        "INSERT INTO assistant_feedback(answer_id,submission_id,rating,snapshot,payload_hash,workspace_id,receipt_id,user_id) VALUES($1,$2,'helpful',$3::json,$4,$5,$1,$6)",
        [
          other.id,
          randomUUID(),
          canonical(other.snapshot),
          "a".repeat(64),
          A.id,
          owned.p.userId,
        ],
      ),
    ),
    (e) => e.code === "42501",
  );
  assert.deepEqual(await snapshotRows(), before);
});

test("active membership is rechecked for issuance, history and feedback, regardless of claimed manager role", async () => {
  const item = await issued();
  await f.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [A.id, item.p.userId],
  );
  try {
    const p = { ...item.p, role: "manager" };
    await assert.rejects(
      f.receipts.issue(item.input, item.answer, p, randomUUID()),
      code(403),
    );
    await assert.rejects(f.receipts.verifyHistory(item.history, p), code(403));
    await assert.rejects(f.feedback.create(item.body, p), code(403));
  } finally {
    await f.admin.query(
      "UPDATE workspace_memberships SET active=true WHERE workspace_id=$1 AND user_id=$2",
      [A.id, item.p.userId],
    );
  }
  for (const p of [
    tenantPrincipal(A, "member", "absent"),
    tenantPrincipal(A, "member", "inactive"),
    tenantPrincipal(inactive),
  ])
    await assert.rejects(
      f.receipts.issue(item.input, item.answer, p, randomUUID()),
      code(403),
    );
});

test("global submission/answer conflicts return generic conflict without exposing another user's row", async () => {
  const a = await issued(),
    b = await issued(tenantPrincipal(A, "viewer")),
    first = await f.feedback.create(a.body, a.p),
    before = await snapshotRows();
  for (const [body, p] of [
    [{ ...a.body, submissionId: randomUUID() }, a.p],
    [{ ...a.body, comment: "changed" }, a.p],
    [{ ...b.body, submissionId: a.body.submissionId }, b.p],
  ]) {
    await assert.rejects(f.feedback.create(body, p), (e) => {
      assert.ok(code(409, "FEEDBACK_IDEMPOTENCY_CONFLICT")(e));
      assert.ok(!JSON.stringify(e.getResponse()).includes(first.id));
      return true;
    });
  }
  assert.deepEqual(await snapshotRows(), before);
});

test("two overlapping backend PIDs submit one key/payload: one row and identical acknowledgement", async (t) => {
  const db = f.openRuntime(2),
    services = f.services(db),
    item = await issued(tenantPrincipal(A), services),
    arrivals = new Set(),
    release = deferred();
  const original = db.workspaceTransaction.bind(db);
  db.workspaceTransaction = (p, work) =>
    original(p, (tx) =>
      work({
        query: async (sql, values) => {
          if (sql.startsWith("INSERT INTO assistant_feedback")) {
            arrivals.add(
              (await tx.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
            );
            if (arrivals.size === 2) release.resolve();
            await bounded(
              release.promise,
              "two distinct runtime clients must overlap before INSERT",
            );
          }
          return tx.query(sql, values);
        },
      }),
    );
  const result = await Promise.all([
    services.feedback.create(item.body, item.p),
    services.feedback.create(item.body, item.p),
  ]);
  assert.equal(arrivals.size, 2);
  t.diagnostic(
    JSON.stringify({
      runtimeBackendPids: [...arrivals],
      barrier: "both runtime clients reached INSERT before either executed it",
    }),
  );
  assert.deepEqual(result[0], result[1]);
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM assistant_feedback WHERE answer_id=$1",
        [item.id],
      )
    ).rows[0].n,
    1,
  );
});

test("pool max=1 clears context after success/error; closing and reopening preserves replay identity", async () => {
  const item = await issued(),
    first = await f.feedback.create(item.body, item.p);
  const pid = (await f.db.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  await assert.rejects(
    f.feedback.create({ ...item.body, comment: "tamper" }, item.p),
    code(409),
  );
  const cleared = (
    await f.db.query(
      "SELECT pg_backend_pid() AS pid,NULLIF(current_setting('examate.user_id',true),'') AS principal,NULLIF(current_setting('examate.workspace_id',true),'') AS workspace",
    )
  ).rows[0];
  assert.deepEqual(cleared, { pid, principal: null, workspace: null });
  const one = f.openRuntime(1),
    destroy = one.onModuleDestroy.bind(one);
  let closed = false;
  one.onModuleDestroy = () =>
    closed ? Promise.resolve() : ((closed = true), destroy());
  assert.deepEqual(
    await f.services(one).feedback.create(item.body, item.p),
    first,
  );
  await one.onModuleDestroy();
  assert.deepEqual(
    await f.services(f.openRuntime(1)).feedback.create(item.body, item.p),
    first,
  );
});

test("lost ACK after real receipt COMMIT reports outage without replay, despite the persisted row", async () => {
  const before = (
    await f.admin.query(
      "SELECT count(*)::int AS n FROM assistant_answer_receipts",
    )
  ).rows[0].n;
  const restore = loseNextCommit(f.db);
  try {
    await assert.rejects(
      f.receipts.issue(
        receiptInput(),
        receiptAnswer(),
        tenantPrincipal(A),
        randomUUID(),
      ),
      code(503, "ANSWER_RECEIPT_UNAVAILABLE"),
    );
  } finally {
    restore();
  }
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM assistant_answer_receipts",
      )
    ).rows[0].n,
    before + 1,
  );
});

test("lost ACK after real feedback COMMIT: manual same-key replay preserves id/time and exactly one row", async () => {
  const item = await issued(),
    restore = loseNextCommit(f.db);
  try {
    await assert.rejects(
      f.feedback.create(item.body, item.p),
      code(503, "FEEDBACK_STORAGE_UNAVAILABLE"),
    );
  } finally {
    restore();
  }
  const row = (
    await f.admin.query(
      "SELECT id,created_at FROM assistant_feedback WHERE answer_id=$1",
      [item.id],
    )
  ).rows[0];
  const replay = await f.feedback.create(item.body, item.p);
  assert.equal(replay.id, row.id);
  assert.equal(replay.createdAt, row.created_at.toISOString());
  assert.equal(
    (
      await f.admin.query(
        "SELECT count(*)::int AS n FROM assistant_feedback WHERE answer_id=$1",
        [item.id],
      )
    ).rows[0].n,
    1,
  );
});

test("history read COMMIT uncertainty fails closed, unlike best-effort issuance", async () => {
  const item = await issued(),
    restore = loseNextCommit(f.db);
  try {
    await assert.rejects(
      f.receipts.verifyHistory(item.history, item.p),
      code(503, "DATABASE_UNAVAILABLE"),
    );
  } finally {
    restore();
  }
});
