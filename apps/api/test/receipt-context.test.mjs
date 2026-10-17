import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  receiptContextFixture,
  receiptPrincipal as p,
  receiptInput,
  receiptAnswer,
  snapshotOf,
  feedbackInput,
  digest,
} from "./receipt-context-fixture.mjs";
function assertBoundary(f) {
  assert.equal(
    f.state.legacy,
    0,
    "receipt/feedback business SQL must not use ordinary transactions",
  );
  assert.ok(f.state.workspace > 0);
  assert.ok(f.state.queries.length > 0);
  assert.ok(
    f.state.queries.every((q) => q.tx && f.state.authorizations.includes(q.tx)),
    "fresh authorization must receive the exact business client",
  );
}
test("receipt issue uses workspace context and stores only the canonical hash/identity", async () => {
  const f = receiptContextFixture(),
    id = await f.receipt.issue(
      receiptInput(),
      receiptAnswer(),
      p,
      randomUUID(),
    );
  assertBoundary(f);
  const row = f.receipts.get(id);
  assert.equal(row.snapshot_hash, digest(snapshotOf()));
  assert.deepEqual(Object.keys(row).sort(), [
    "id",
    "mode",
    "request_id",
    "snapshot_hash",
    "user_id",
    "workspace_id",
  ]);
});
test("history verification uses one authorized workspace transaction without writes", async () => {
  const f = receiptContextFixture(),
    id = await f.receipt.issue(
      receiptInput(),
      receiptAnswer(),
      p,
      randomUUID(),
    );
  Object.assign(f.state, {
    legacy: 0,
    workspace: 0,
    queries: [],
    authorizations: [],
  });
  await f.receipt.verifyHistory(
    { ...receiptInput(), history: [{ receiptId: id, snapshot: snapshotOf() }] },
    p,
  );
  assertBoundary(f);
  assert.equal(f.state.workspace, 1);
  assert.ok(f.state.queries.every((q) => q.sql.startsWith("SELECT")));
});
test("viewer feedback receipt/hash/insert/replay all use authorized workspace context", async () => {
  const f = receiptContextFixture(),
    id = await f.receipt.issue(
      receiptInput(),
      receiptAnswer(),
      p,
      randomUUID(),
    ),
    body = feedbackInput(id);
  Object.assign(f.state, {
    legacy: 0,
    workspace: 0,
    queries: [],
    authorizations: [],
  });
  assert.deepEqual(
    await f.service.create(body, p),
    await f.service.create(body, p),
  );
  assertBoundary(f);
  assert.equal(f.feedback.size, 1);
});
test("empty history is a no-query control, not an issuance outage fallback", async () => {
  const f = receiptContextFixture();
  await f.receipt.verifyHistory({ ...receiptInput(), history: [] }, p);
  assert.equal(f.state.legacy + f.state.workspace + f.state.queries.length, 0);
});

test("missing or malformed principal fails before any business callback for issue/history/feedback", async () => {
  for (const principal of [undefined, { ...p, userId: "forged" }]) {
    const f = receiptContextFixture(),
      id = randomUUID();
    for (const work of [
      () =>
        f.receipt.issue(
          receiptInput(),
          receiptAnswer(),
          principal,
          randomUUID(),
        ),
      () =>
        f.receipt.verifyHistory(
          {
            ...receiptInput(),
            history: [{ receiptId: id, snapshot: snapshotOf() }],
          },
          principal,
        ),
      () => f.service.create(feedbackInput(id), principal),
    ])
      await assert.rejects(work, (e) => e.getStatus?.() === 401);
    assert.equal(
      f.state.workspace +
        f.state.legacy +
        f.state.queries.length +
        f.state.authorizations.length,
      0,
    );
  }
});
