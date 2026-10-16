import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentsContextFixture,
  actor,
  id,
  pdf,
} from "./documents-context-fixture.mjs";
const status = (n) => (e) => e.getStatus?.() === n;
test("Documents write boundary: upload preflight/INSERT and set/unset course stay in context, Storage outside", async () => {
  const f = documentsContextFixture();
  const result = await f.service.upload(pdf(), id(50), actor());
  assert.equal(result.course_id, id(50));
  assert.equal(f.calls.upload, 1);
  assert.equal(f.calls.remove, 0);
  assert.equal(f.state.active, 0);
  assert.equal(
    (await f.service.setCourse(result.id, null, actor())).course_id,
    null,
  );
  assert.equal(
    (await f.service.setCourse(result.id, id(50), actor())).course_id,
    id(50),
  );
  assert.equal(
    f.queries.filter((q) => q.sql.includes("INSERT INTO documents")).length,
    1,
  );
  assert.doesNotMatch(JSON.stringify(result), /storage_key|fixture-documents/);
});
test("Documents delete marks, closes DB, removes object, then deletes row using fresh manager boundaries", async () => {
  const f = documentsContextFixture("manager");
  await f.service.remove(id(100), actor("manager"));
  assert.equal(f.rows.has(id(100)), false);
  assert.equal(f.calls.remove, 1);
  assert.equal(f.state.active, 0);
  assert.ok(f.events.indexOf("remove") > f.events.indexOf("commit"));
  assert.equal(f.events.at(-1), "commit");
});
test("Documents early denied roles/missing identity never enter a business callback or Storage", async () => {
  for (const [p, code] of [
    [undefined, 401],
    [{ ...actor(), userId: "bad" }, 401],
    [actor("viewer"), 403],
  ]) {
    const f = documentsContextFixture("viewer");
    for (const call of [
      () => f.service.upload(pdf(), undefined, p),
      () => f.service.setCourse(id(100), null, p),
      () => f.service.remove(id(100), p),
    ])
      await assert.rejects(call, status(code));
    assert.equal(f.state.callbacks, 0);
    assert.deepEqual(f.calls, { upload: 0, sign: 0, remove: 0 });
  }
  const f = documentsContextFixture();
  await assert.rejects(f.service.remove(id(100), actor()), status(403));
  assert.equal(f.state.callbacks, 0);
});
test("Documents foreign record/course never reaches a Storage side effect", async () => {
  const f = documentsContextFixture("manager");
  await assert.rejects(
    f.service.upload(pdf(), id(51), actor("manager")),
    status(404),
  );
  await assert.rejects(
    f.service.setCourse(id(200), null, actor("manager")),
    status(404),
  );
  await assert.rejects(
    f.service.setCourse(id(100), id(51), actor("manager")),
    status(404),
  );
  await assert.rejects(
    f.service.remove(id(200), actor("manager")),
    status(404),
  );
  assert.deepEqual(f.calls, { upload: 0, sign: 0, remove: 0 });
});
for (const changed of [undefined, "viewer"])
  test(`Documents upload membership ${changed ?? "revoked"} during Storage: INSERT denied, uncertain object retained`, async () => {
    const f = documentsContextFixture(),
      upload = f.storage.upload;
    f.storage.upload = async (...args) => {
      await upload(...args);
      f.state.role = changed;
    };
    await assert.rejects(
      f.service.upload(pdf(), undefined, actor()),
      status(403),
    );
    assert.equal(f.calls.upload, 1);
    assert.equal(f.calls.remove, 0);
    assert.equal(f.objects.size, 1);
    assert.equal(
      f.queries.some((q) => q.sql.includes("INSERT INTO documents")),
      false,
    );
  });
for (const revoked of [false, true])
  test(`Documents lost COMMIT ACK ${revoked ? "then membership revoke/hidden row" : "with row visible"} never compensates committed object`, async () => {
    const f = documentsContextFixture(),
      upload = f.storage.upload;
    f.storage.upload = async (...args) => {
      await upload(...args);
      f.state.lostAck = true;
    };
    f.state.afterCommit = () => {
      if (revoked && f.events.includes("insert")) f.state.role = undefined;
    };
    if (revoked)
      await assert.rejects(
        f.service.upload(pdf(), undefined, actor()),
        /lost commit acknowledgement/,
      );
    else assert.ok((await f.service.upload(pdf(), undefined, actor())).id);
    assert.equal(f.calls.remove, 0);
    assert.equal(f.objects.size, 1);
    assert.equal(
      f.queries.filter((q) => q.sql.includes("INSERT INTO documents")).length,
      1,
    );
    assert.equal(
      f.rows.size,
      3,
      "committed metadata retained even if RLS would hide it",
    );
  });
for (const [code, constraint, statusCode, expected] of [
  ["23503", "documents_workspace_course_fk", 404, "COURSE_NOT_FOUND"],
  ["23503", "documents_workspace_fk", 403, "WORKSPACE_ACCESS_DENIED"],
  ["23503", "unrelated_fk", null, null],
  ["42501", undefined, null, null],
])
  test(`Documents rollback/confirmed absence mapping ${constraint ?? code} compensates only request object`, async () => {
    const f = documentsContextFixture(),
      error = Object.assign(Error("synthetic DB failure"), {
        code,
        constraint,
      });
    f.state.queryError = error;
    await assert.rejects(f.service.upload(pdf(), undefined, actor()), (e) =>
      statusCode
        ? e.getStatus?.() === statusCode && e.getResponse().code === expected
        : e === error,
    );
    assert.equal(f.calls.upload, 1);
    assert.equal(f.calls.remove, 1);
    assert.equal(f.objects.size, 0);
    assert.equal(f.rows.size, 2);
  });
test("Documents empty INSERT projection rolls back, never claims successful metadata", async () => {
  const f = documentsContextFixture();
  f.state.emptyInsert = true;
  await assert.rejects(f.service.upload(pdf(), undefined, actor()));
  assert.equal(f.rows.size, 2);
  assert.equal(f.calls.remove, 1);
});
test("Documents failed reconciliation keeps object; no INSERT/upload replay", async () => {
  const f = documentsContextFixture(),
    upload = f.storage.upload;
  f.storage.upload = async (...args) => {
    await upload(...args);
    f.state.lostAck = true;
    f.state.probeError = true;
  };
  await assert.rejects(
    f.service.upload(pdf(), undefined, actor()),
    /lost commit acknowledgement/,
  );
  assert.deepEqual(f.calls, { upload: 1, sign: 0, remove: 0 });
  assert.equal(f.objects.size, 1);
});
test("Documents downgrade after mark prevents Storage remove and leaves recoverable deleting metadata", async () => {
  const f = documentsContextFixture("manager");
  f.state.afterCommit = () => {
    if (f.rows.get(id(100))?.storage_status === "deleting")
      f.state.role = "member";
  };
  await assert.rejects(
    f.service.remove(id(100), actor("manager")),
    status(403),
  );
  assert.equal(f.calls.remove, 0);
  assert.equal(f.rows.get(id(100)).storage_status, "deleting");
});
test("Documents Storage remove failure retains deleting row; retry follows existing lifecycle", async () => {
  const f = documentsContextFixture("manager"),
    remove = f.storage.remove;
  f.storage.remove = async () => {
    assert.equal(f.state.active, 0);
    throw Error("synthetic Storage outage");
  };
  await assert.rejects(
    f.service.remove(id(100), actor("manager")),
    /Storage outage/,
  );
  assert.equal(f.rows.get(id(100)).storage_status, "deleting");
  f.storage.remove = remove;
  await f.service.remove(id(100), actor("manager"));
  assert.equal(f.rows.has(id(100)), false);
});
test("Documents Storage removed then final authority lost does not pretend network rollback", async () => {
  const f = documentsContextFixture("manager"),
    remove = f.storage.remove;
  f.storage.remove = async (...args) => {
    await remove(...args);
    f.state.role = undefined;
  };
  await assert.rejects(
    f.service.remove(id(100), actor("manager")),
    status(403),
  );
  assert.equal(f.calls.remove, 1);
  assert.equal(f.rows.get(id(100)).storage_status, "deleting");
});
test("Documents legacy delete remains conflict before Storage", async () => {
  const f = documentsContextFixture("manager");
  f.rows.get(id(100)).storage_status = "legacy";
  await assert.rejects(
    f.service.remove(id(100), actor("manager")),
    status(409),
  );
  assert.equal(f.calls.remove, 0);
});
