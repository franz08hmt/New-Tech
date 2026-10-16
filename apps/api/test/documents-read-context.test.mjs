import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentsContextFixture,
  actor,
  id,
} from "./documents-context-fixture.mjs";
for (const role of ["manager", "member", "viewer"]) {
  test(`documents context ${role}: list/get authorize and read on the same tx; public projection has no key`, async () => {
    const f = documentsContextFixture(role);
    const list = await f.service.list(actor(role));
    assert.deepEqual(
      list.map((r) => r.id),
      [id(100)],
    );
    assert.equal(list[0].course_id, null);
    assert.equal(list[0].index_quality, null);
    assert.equal((await f.service.get(id(100), actor(role))).id, id(100));
    assert.equal(f.state.callbacks, 2);
    assert.equal(f.state.auth, 2);
    assert.doesNotMatch(JSON.stringify(list), /storage_key|fixture-documents/);
  });
  for (const inline of [false, true])
    test(`documents context ${role}: ${inline ? "inline" : "attachment"} signing follows closed read/fresh-auth transactions`, async () => {
      const f = documentsContextFixture(role);
      const result = await f.service.download(id(100), { inline }, actor(role));
      assert.equal(result.expiresIn, 60);
      assert.deepEqual(result.options, { inline });
      assert.equal(f.state.callbacks, 2);
      assert.equal(f.state.auth, 2);
      assert.equal(f.calls.sign, 1);
      assert.deepEqual(f.events, ["commit", "commit", "sign"]);
    });
}
test("documents context: revoked between read and sign is checked freshly; no signing", async () => {
  const f = documentsContextFixture();
  f.state.afterCommit = () => {
    f.state.role = undefined;
  };
  await assert.rejects(
    f.service.download(id(100), {}, actor()),
    (e) => e.getStatus?.() === 403,
  );
  assert.equal(f.calls.sign, 0);
  assert.equal(f.state.auth, 2);
});
test("documents context: missing/invalid principal never invokes callback or Storage", async () => {
  const f = documentsContextFixture();
  for (const p of [undefined, { ...actor(), userId: "bad" }])
    for (const call of [
      () => f.service.list(p),
      () => f.service.get(id(100), p),
      () => f.service.download(id(100), {}, p),
    ])
      await assert.rejects(call, (e) => e.getStatus?.() === 401);
  assert.equal(f.state.callbacks, 0);
  assert.deepEqual(f.calls, { upload: 0, sign: 0, remove: 0 });
});
test("documents context: outside/missing reads are 404 with no signing", async () => {
  const f = documentsContextFixture();
  for (const key of [id(200), id(999)])
    for (const call of [
      () => f.service.get(key, actor()),
      () => f.service.download(key, {}, actor()),
    ])
      await assert.rejects(call, (e) => e.getStatus?.() === 404);
  assert.equal(f.calls.sign, 0);
});
for (const status of ["legacy", "deleting"])
  test(`documents context: ${status} download stays 409 and never signs`, async () => {
    const f = documentsContextFixture();
    f.rows.get(id(100)).storage_status = status;
    await assert.rejects(
      f.service.download(id(100), {}, actor()),
      (e) => e.getStatus?.() === 409,
    );
    assert.equal(f.calls.sign, 0);
  });
