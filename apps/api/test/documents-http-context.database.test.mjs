import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  openDocumentsTenantFixture,
  tenants,
  tenantPrincipal,
  fixedId,
} from "./documents-tenant-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { httpApp, json, pdfForm } from "./helpers.mjs";
const [A, B] = tenants;
let f;
before(async () => {
  f = await openDocumentsTenantFixture();
});
after(async () => {
  await f?.close();
});
function upload(courseId) {
  const init = pdfForm(undefined, "Tài liệu minh họa.pdf");
  if (courseId) init.body.append("courseId", courseId);
  return init;
}
async function safe(response, status, code) {
  assert.equal(response.status, status);
  const text = await response.text();
  assert.doesNotMatch(
    text,
    /storage_key|fixture-docs|constraint|SELECT|INSERT|stack|Synthetic 1/,
  );
  if (code) assert.equal(JSON.parse(text).code, code);
  return JSON.parse(text);
}
for (const role of ["manager", "member", "viewer"])
  test(`HTTP Documents ${role}: all real routes, Auth/CSRF/Origin, non-owner membership and SQL/Storage boundary`, async (t) => {
    const auth = authFixture();
    auth.config.workspaceId = A.id;
    auth.config.origin = "http://127.0.0.1:5173";
    await f.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
    await f.admin.query(
      "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
      [A.id, auth.userId, role],
    );
    auth.store.membership = f.auth.membership.bind(f.auth);
    const external = { generation: 0, retrieval: 0, ingestion: 0 };
    const forbidden = (k) => async () => {
      external[k]++;
      throw Error("Pipeline not in this HTTP suite");
    };
    const signOptions = [];
    const storage = {
      ...f.storage,
      signedDownload: async (key, name, options) => {
        signOptions.push(options);
        const result = await f.storage.signedDownload(key, name, options);
        return { url: result.url, expiresIn: result.expiresIn };
      },
    };
    const facade = {
      query: (...a) => f.db.query(...a),
      transaction: (...a) => f.db.transaction(...a),
      workspaceTransaction: (...a) => f.db.workspaceTransaction(...a),
    };
    const server = await httpApp(
      facade,
      storage,
      { generate: forbidden("generation") },
      { process: forbidden("ingestion") },
      { retrieve: forbidden("retrieval") },
      auth,
    );
    try {
      const bootstrap = await server.request("/auth/session"),
        csrf = (await bootstrap.json()).csrfToken;
      const login = await server.request("/auth/login", {
        ...json("POST", {
          email: "documents-context@example.test",
          password: "synthetic-password",
        }),
        headers: {
          "Content-Type": "application/json",
          Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(login.status, 200);
      const session = await login.json(),
        headers = {
          Cookie: login.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": session.csrfToken,
        };
      const request = (path, init = {}) =>
        server.request(path, {
          ...init,
          headers: { ...headers, ...init.headers },
        });
      const routes = [
        ["/documents", {}],
        [`/documents/${A.document}`, {}],
        ["/documents", upload()],
        [`/documents/${A.document}/download`, {}],
        [`/documents/${A.document}/download?disposition=inline`, {}],
        [`/documents/${A.document}/course`, json("PATCH", { courseId: null })],
        [`/documents/${A.document}`, { method: "DELETE" }],
      ];
      const before = await f.snapshot(),
        calls = { ...f.calls };
      for (const [path, init] of routes)
        await safe(await server.request(path, init), 401);
      assert.deepEqual(f.calls, calls);
      assert.deepEqual(await f.snapshot(), before);
      const boundary = t.mock.method(f.db, "workspaceTransaction");
      for (const [path, init] of routes.filter(
        ([path, init]) => init.method || path.includes("/download"),
      )) {
        const count = boundary.mock.callCount();
        await safe(
          await request(path, {
            ...init,
            headers: { ...init.headers, "X-CSRF-Token": "" },
          }),
          403,
        );
        await safe(
          await request(path, {
            ...init,
            headers: { ...init.headers, Origin: "http://foreign.invalid" },
          }),
          403,
        );
        assert.equal(boundary.mock.callCount(), count);
      }
      const list = await request("/documents");
      assert.equal(list.status, 200);
      const body = await list.json();
      assert.equal(body.length, 4);
      assert.ok(
        body.some((r) => r.id === A.unassigned && r.course_id === null),
      );
      assert.doesNotMatch(
        JSON.stringify(body),
        /storage_key|fixture-docs|Synthetic 1/,
      );
      const detail = await request(`/documents/${A.document}`);
      assert.equal(detail.status, 200);
      assert.equal((await detail.json()).id, A.document);
      for (const inline of [false, true]) {
        const signed = await request(
          `/documents/${A.document}/download${inline ? "?disposition=inline" : ""}`,
        );
        assert.equal(signed.status, 200);
        assert.equal((await signed.json()).expiresIn, 60);
        assert.equal(signOptions.at(-1).inline, inline);
      }
      for (const suffix of ["", "/download", "/download?disposition=inline"]) {
        const foreign = await safe(
            await request(`/documents/${B.document}${suffix}`),
            404,
          ),
          missing = await safe(
            await request(`/documents/${fixedId(999)}${suffix}`),
            404,
          );
        delete foreign.requestId;
        delete missing.requestId;
        assert.deepEqual(foreign, missing);
      }
      for (const key of [A.legacy, A.deleting])
        await safe(await request(`/documents/${key}/download`), 409);
      const valid = await request("/documents", upload(A.course));
      assert.equal(valid.status, role === "viewer" ? 403 : 201);
      const rejectedCalls = { ...f.calls },
        snapshot = await f.snapshot();
      await safe(
        await request("/documents", upload(B.course)),
        role === "viewer" ? 403 : 404,
        role === "viewer" ? "ROLE_FORBIDDEN" : "COURSE_NOT_FOUND",
      );
      await safe(
        await request(
          `/documents/${A.document}/course`,
          json("PATCH", { courseId: B.course }),
        ),
        role === "viewer" ? 403 : 404,
      );
      await safe(
        await request(
          `/documents/${B.document}/course`,
          json("PATCH", { courseId: null }),
        ),
        role === "viewer" ? 403 : 404,
      );
      await safe(
        await request(`/documents/${B.document}`, { method: "DELETE" }),
        role === "manager" ? 404 : 403,
      );
      assert.deepEqual(f.calls, rejectedCalls);
      assert.deepEqual(await f.snapshot(), snapshot);
      if (role !== "viewer") {
        const row = await valid.json();
        assert.equal(row.name, "Tài liệu minh họa.pdf");
        assert.equal("storage_key" in row, false);
        const assigned = await request(
          `/documents/${row.id}/course`,
          json("PATCH", { courseId: null }),
        );
        assert.equal(assigned.status, 200);
        assert.equal((await assigned.json()).course_id, null);
        const restored = await request(
          `/documents/${row.id}/course`,
          json("PATCH", { courseId: A.course }),
        );
        assert.equal(restored.status, 200);
        const removed = await request(`/documents/${row.id}`, {
          method: "DELETE",
        });
        assert.equal(removed.status, role === "manager" ? 204 : 403);
        if (role === "member")
          await f.service.remove(row.id, tenantPrincipal(A, "manager"));
      } else {
        const count = boundary.mock.callCount(),
          unchanged = { ...f.calls };
        await safe(
          await request(
            `/documents/${A.document}/course`,
            json("PATCH", { courseId: null }),
          ),
          403,
          "ROLE_FORBIDDEN",
        );
        await safe(
          await request(`/documents/${A.document}`, { method: "DELETE" }),
          403,
          "ROLE_FORBIDDEN",
        );
        assert.equal(boundary.mock.callCount(), count);
        assert.deepEqual(f.calls, unchanged);
      }
      const count = boundary.mock.callCount(),
        unchanged = { ...f.calls };
      await f.admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
        [A.id, auth.userId],
      );
      for (const [path, init] of routes)
        await safe(await request(path, init), 403, "WORKSPACE_ACCESS_DENIED");
      assert.equal(boundary.mock.callCount(), count);
      assert.deepEqual(f.calls, unchanged);
      assert.deepEqual(external, { generation: 0, retrieval: 0, ingestion: 0 });
      assert.equal(f.calls.buffer, 0);
    } finally {
      await server.app.close();
    }
  });
