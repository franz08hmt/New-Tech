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
import { DocumentsService } from "../dist/documents/documents.service.js";
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
        ["/documents/search", {}],
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
      if (role === "manager") {
        // RED for F05: Documents needs a distinct, typed server-paged route;
        // changing the legacy array route would silently break Assistant and
        // sidebar consumers that still need the complete source list.
        const firstPage = await request(
          "/documents/search?page=1&pageSize=2&course=all&sort=created_at&direction=desc",
        );
        assert.equal(firstPage.status, 200);
        const result = await firstPage.json();
        assert.equal(result.total, 4);
        assert.equal(result.page, 1);
        assert.equal(result.pageSize, 2);
        assert.equal(result.items.length, 2);
        assert.ok(result.items.every((row) => row.id !== B.document));
      }
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

test("Documents paged search is scoped, validated, stable and metadata-only on PG17 non-owner LOGIN", async (t) => {
  const auth = authFixture();
  auth.config.workspaceId = A.id;
  auth.config.origin = "http://127.0.0.1:5173";
  await f.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
  await f.admin.query(
    "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'manager')",
    [A.id, auth.userId],
  );
  auth.store.membership = f.auth.membership.bind(f.auth);
  const external = { generation: 0, retrieval: 0, ingestion: 0 };
  const forbidden = (key) => async () => {
    external[key]++;
    throw Error("Metadata search must not call a provider");
  };
  const server = await httpApp(
    {
      query: (...args) => f.db.query(...args),
      transaction: (...args) => f.db.transaction(...args),
      workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
    },
    f.storage,
    { generate: forbidden("generation") },
    { process: forbidden("ingestion") },
    { retrieve: forbidden("retrieval") },
    auth,
  );
  const searchIds = Array.from({ length: 221 }, (_, i) => fixedId(2000 + i));
  const otherTenantIds = Array.from({ length: 3 }, (_, i) => fixedId(3000 + i));
  const originalCourse = (
    await f.admin.query("SELECT name,code,slug FROM courses WHERE id=$1", [
      A.course,
    ])
  ).rows[0];
  try {
    await f.admin.query(
      "UPDATE courses SET name='Công nghệ phần mềm',code='F05-SEARCH',slug='cong-nghe' WHERE id=$1",
      [A.course],
    );
    for (let i = 0; i < searchIds.length; i++) {
      const name =
        i === 0
          ? "Thuật toán 100%_Draft ' \\ bản.pdf"
          : i <= 4
            ? "Tie same.pdf"
            : `Sample search record ${i}.pdf`;
      const storageStatus = ["stored", "deleting", "legacy"][i % 3];
      const processingStatus = ["pending", "processing", "ready", "failed"][
        i % 4
      ];
      const courseId = i % 4 === 2 ? null : A.course;
      await f.admin.query(
        `INSERT INTO documents
           (id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,processing_status,course_id,indexed_at,processing_error_code,created_at,updated_at)
         VALUES($1,$2,$3,'application/pdf',$4,100,$5,$6,$7,$8,$9,'2026-10-01T00:00:00Z','2026-10-01T00:00:00Z')`,
        [
          searchIds[i],
          A.id,
          name,
          `fixture-docs/${searchIds[i]}.pdf`,
          storageStatus,
          processingStatus,
          courseId,
          processingStatus === "ready" ? "2026-10-01T00:00:00Z" : null,
          processingStatus === "failed" ? "FIXTURE_FAILED" : null,
        ],
      );
    }
    for (let i = 0; i < otherTenantIds.length; i++)
      await f.admin.query(
        `INSERT INTO documents
           (id,workspace_id,name,media_type,storage_key,size_bytes,storage_status,processing_status,course_id,indexed_at)
         VALUES($1,$2,$3,'application/pdf',$4,100,'stored','ready',$5,NOW())`,
        [
          otherTenantIds[i],
          B.id,
          `Tenant B private marker ${i}.pdf`,
          `fixture-docs/${otherTenantIds[i]}.pdf`,
          B.course,
        ],
      );

    const bootstrap = await server.request("/auth/session");
    const login = await server.request("/auth/login", {
      ...json("POST", {
        email: "documents-search@example.test",
        password: "synthetic-password",
      }),
      headers: {
        "Content-Type": "application/json",
        Cookie: bootstrap.headers.get("set-cookie").split(";")[0],
        Origin: auth.config.origin,
        "X-CSRF-Token": (await bootstrap.json()).csrfToken,
      },
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const request = (path) =>
      server.request(path, {
        headers: {
          Cookie: login.headers.get("set-cookie").split(";")[0],
          Origin: auth.config.origin,
          "X-CSRF-Token": session.csrfToken,
        },
      });
    const query = (values) =>
      `/documents/search?${new URLSearchParams(values)}`;

    let searchStatement;
    const originalTransaction = f.db.transaction.bind(f.db);
    f.db.transaction = (work) =>
      originalTransaction((tx) =>
        work({
          query: (sql, values = []) => {
            if (sql.includes("WITH filtered AS MATERIALIZED"))
              searchStatement = { sql, values };
            return tx.query(sql, values);
          },
        }),
      );
    let unpaged;
    try {
      unpaged = await request("/documents/search");
    } finally {
      f.db.transaction = originalTransaction;
    }
    assert.equal(unpaged.status, 200);
    assert.ok(searchStatement);
    const plan = await f.db.workspaceTransaction(
      { workspaceId: A.id, userId: auth.userId, role: "manager" },
      (tx) =>
        tx.query(
          `EXPLAIN (FORMAT JSON) ${searchStatement.sql}`,
          searchStatement.values,
        ),
    );
    assert.ok(plan.rows[0]["QUERY PLAN"]?.[0]?.Plan);
    const defaults = await unpaged.json();
    assert.equal(defaults.page, 1);
    assert.equal(defaults.pageSize, 20);
    assert.equal(defaults.total, 225);
    assert.equal(defaults.items.length, 20);
    assert.equal(defaults.totalPages, 12);
    assert.ok(defaults.items.every((row) => !otherTenantIds.includes(row.id)));
    assert.doesNotMatch(JSON.stringify(defaults), /storage_key|fixture-docs/);

    const secondPage = await (
      await request(
        query({
          page: "2",
          pageSize: "20",
          sort: "name",
          direction: "asc",
        }),
      )
    ).json();
    assert.equal(secondPage.page, 2);
    assert.equal(secondPage.items.length, 20);
    assert.equal(secondPage.total, 225);
    assert.equal(new Set(secondPage.items.map((row) => row.id)).size, 20);

    const lastPage = await (
      await request(
        query({
          page: "114",
          pageSize: "2",
        }),
      )
    ).json();
    assert.equal(lastPage.items.length, 0);
    assert.equal(lastPage.total, 225);
    assert.equal(lastPage.totalPages, 113);

    const vietnameseSearch = await (
      await request(
        query({
          q: "THUAT-toan",
        }),
      )
    ).json();
    assert.equal(vietnameseSearch.total, 1);
    assert.equal(vietnameseSearch.items[0].id, searchIds[0]);
    const specialCharacters = await (
      await request(
        query({
          q: "100%_draft ' \\",
        }),
      )
    ).json();
    assert.equal(specialCharacters.total, 1);
    assert.equal(specialCharacters.items[0].id, searchIds[0]);

    const courseMetadata = await (
      await request(
        query({
          q: "cong nghe phan mem",
          sort: "name",
          direction: "asc",
        }),
      )
    ).json();
    assert.ok(courseMetadata.total > 0);
    assert.ok(
      courseMetadata.items.every(
        (row) => row.course_name === "Công nghệ phần mềm",
      ),
    );

    const tieResults = await (
      await request(
        query({
          q: "tie same",
          sort: "name",
          direction: "asc",
          pageSize: "50",
        }),
      )
    ).json();
    assert.equal(tieResults.total, 4);
    assert.deepEqual(
      tieResults.items.map((row) => row.id),
      [...searchIds.slice(1, 5)].sort(),
    );

    const combinedFilter = await (
      await request(
        query({
          course: "unassigned",
          storage_status: "stored",
          processing_status: "ready",
          pageSize: "50",
        }),
      )
    ).json();
    assert.ok(combinedFilter.total > 0);
    assert.equal(combinedFilter.items.length, combinedFilter.total);
    assert.ok(
      combinedFilter.items.every(
        (row) =>
          row.course_id === null &&
          row.storage_status === "stored" &&
          row.processing_status === "ready",
      ),
    );

    // Regression: repeated q arrives as an array through the actual HTTP
    // query parser. DTO validation must reject it before the service's trim
    // or the tenant-scoped search statement runs.
    const searchService = server.app.get(DocumentsService);
    const searchSpy = t.mock.method(searchService, "search");
    for (const malformed of [
      "/documents/search?q=F05_REPEATED_QUERY_SENTINEL&q=second",
      "/documents/search?q=&q=",
      "/documents/search?q%5B%5D=first&q%5B%5D=second",
      "/documents/search?q%5Bfield%5D=first",
    ]) {
      const calls = searchSpy.mock.callCount();
      const response = await request(malformed);
      const text = await response.text();
      assert.equal(response.status, 400, malformed);
      assert.equal(searchSpy.mock.callCount(), calls, malformed);
      assert.doesNotMatch(text, /F05_REPEATED_QUERY_SENTINEL|first|second/);
      assert.doesNotMatch(text, /TypeError|trim\(|stack|query/i);
    }
    for (const validEmpty of [
      "/documents/search?q=",
      "/documents/search?q=%20%20%20",
    ]) {
      const response = await request(validEmpty);
      assert.equal(response.status, 200, validEmpty);
      assert.equal((await response.json()).total, 225);
    }

    for (const invalid of [
      "/documents/search?page=1&page=2",
      "/documents/search?sort=name&sort=created_at",
      "/documents/search?pageSize=51",
      "/documents/search?page=1000001",
      "/documents/search?sort=name%20DESC",
      `/documents/search?course=${B.course}`,
      "/documents/search?q=%27%20OR%20TRUE--",
      `/documents/search?q=${"a".repeat(121)}`,
    ]) {
      const response = await request(invalid);
      if (invalid.includes(`course=${B.course}`)) {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.total, 0);
        assert.deepEqual(body.items, []);
      } else if (invalid.includes("OR%20TRUE")) {
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.total, 0);
      } else await safe(response, 400);
    }
    const foreignOnly = await (
      await request(
        query({
          q: "tenant b private marker",
        }),
      )
    ).json();
    assert.equal(foreignOnly.total, 0);
    assert.deepEqual(foreignOnly.items, []);
    assert.deepEqual(external, { generation: 0, retrieval: 0, ingestion: 0 });

    const beforeRevoke = await request("/documents/search");
    assert.equal(beforeRevoke.status, 200);
    await f.admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [A.id, auth.userId],
    );
    await safe(
      await request("/documents/search"),
      403,
      "WORKSPACE_ACCESS_DENIED",
    );
  } finally {
    await server.app.close();
    await f.admin.query("DELETE FROM documents WHERE id=ANY($1::uuid[])", [
      [...searchIds, ...otherTenantIds],
    ]);
    await f.admin.query(
      "UPDATE courses SET name=$2,code=$3,slug=$4 WHERE id=$1",
      [A.course, originalCourse.name, originalCourse.code, originalCourse.slug],
    );
  }
});
