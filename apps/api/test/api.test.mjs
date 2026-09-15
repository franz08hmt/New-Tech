import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fakeDependencies, httpApp, json, pdfForm } from "./helpers.mjs";

let fixture, server;
beforeEach(async () => {
  fixture = fakeDependencies();
  server = await httpApp(fixture.database, fixture.storage);
});
afterEach(async () => {
  await server?.app.close();
});

test("HTTP Tasks: create normalized task, list and change status", async () => {
  const response = await server.request(
    "/tasks",
    json("POST", {
      title: "  Review API  ",
      dueDate: "2028-02-29",
      ownerName: null,
    }),
  );
  assert.equal(response.status, 201);
  assert.match(response.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  const task = await response.json();
  assert.equal(task.title, "Review API");
  assert.equal(task.due_date, "2028-02-29");
  assert.equal(task.owner_name, null);
  const updated = await server.request(
    `/tasks/${task.id}/status`,
    json("PATCH", { status: "done" }),
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).status, "done");
  const list = await server.request("/tasks");
  assert.equal(list.status, 200);
  assert.equal((await list.json())[0].status, "done");
});

test("HTTP Courses: lists seeded course guides and reads one by slug", async () => {
  const listResponse = await server.request("/courses");
  assert.equal(listResponse.status, 200);
  const courses = await listResponse.json();
  assert.equal(courses.length, 6);
  assert.ok(courses.some((course) => course.name === "Công nghệ phần mềm"));
  assert.ok(Array.isArray(courses[0].outline));
  assert.ok(Array.isArray(courses[0].outcomes));
  assert.ok(Array.isArray(courses[0].assessment));

  const detailResponse = await server.request("/courses/cs-201");
  assert.equal(detailResponse.status, 200);
  assert.equal((await detailResponse.json()).slug, "cs-201");
});

test("HTTP Courses: rejects malformed slugs and returns a safe missing-course response", async () => {
  assert.equal((await server.request("/courses/CS%20201")).status, 400);
  const response = await server.request("/courses/not-a-course");
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, "COURSE_NOT_FOUND");
  assert.ok(!JSON.stringify(body).includes("SELECT"));
});
for (const [label, input] of Object.entries({
  missing: {},
  whitespace: { title: "     " },
  short: { title: " ab " },
  long: { title: "x".repeat(161) },
  wrongType: { title: 123 },
  nullTitle: { title: null },
  unknown: { title: "Valid task", extra: true },
  badStatus: { title: "Valid task", status: "ready" },
  nullStatus: { title: "Valid task", status: null },
  badDate: { title: "Valid task", dueDate: "2026-02-30" },
  timestamp: { title: "Valid task", dueDate: "2026-09-13T00:00:00Z" },
  badOwner: { title: "Valid task", ownerName: 123 },
}))
  test(`HTTP Tasks rejects ${label}`, async () => {
    const response = await server.request("/tasks", json("POST", input));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.statusCode, 400);
    assert.ok(body.message.length);
    assert.ok(body.requestId);
    assert.equal(fixture.tasks.size, 0);
  });
test("HTTP Tasks accepts null optional data but rejects invalid status and UUID", async () => {
  const created = await server.request(
    "/tasks",
    json("POST", { title: "Valid task", dueDate: null, evidenceType: null }),
  );
  assert.equal(created.status, 201);
  assert.equal(
    (
      await server.request(
        "/tasks/not-uuid/status",
        json("PATCH", { status: "done" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await server.request(
        `/tasks/${randomUUID()}/status`,
        json("PATCH", { status: "bad" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await server.request(
        `/tasks/${randomUUID()}/status`,
        json("PATCH", { status: "done" }),
      )
    ).status,
    404,
  );
});
test("HTTP health reports database only, 503 on failure, then recovers", async () => {
  let response = await server.request("/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storage, "not_checked");
  fixture.state.failHealth = true;
  response = await server.request("/health");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "DATABASE_UNAVAILABLE");
  fixture.state.failHealth = false;
  assert.equal((await server.request("/health")).status, 200);
});
test("HTTP Documents: upload, list, signed download, delete and repeated delete", async () => {
  const response = await server.request("/documents", pdfForm());
  assert.equal(response.status, 201);
  const document = await response.json();
  assert.equal(document.storage_status, "stored");
  assert.equal(document.media_type, "application/pdf");
  assert.ok(document.size_bytes > 5);
  assert.equal(document.storage_key, undefined);
  const list = await server.request("/documents");
  assert.equal((await list.json())[0].id, document.id);
  const download = await server.request(`/documents/${document.id}/download`);
  assert.equal(download.status, 200);
  assert.equal((await download.json()).expiresIn, 60);
  assert.equal(
    (await server.request(`/documents/${document.id}`, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(fixture.objects.size, 0);
  assert.equal(fixture.documents.size, 0);
  assert.equal(
    (await server.request(`/documents/${document.id}`, { method: "DELETE" }))
      .status,
    204,
  );
});
for (const [label, form] of [
  ["extension", () => pdfForm("%PDF-1.4", "file.txt")],
  ["mime", () => pdfForm("%PDF-1.4", "file.pdf", "text/plain")],
  ["signature", () => pdfForm("not actually a pdf")],
])
  test(`HTTP Documents rejects incorrect ${label}`, async () => {
    assert.equal((await server.request("/documents", form())).status, 415);
    assert.equal(fixture.state.uploadCalls, 0);
  });
test("HTTP Documents enforces multipart size, file count and missing file before Storage", async () => {
  assert.equal(
    (
      await server.request(
        "/documents",
        pdfForm(new Uint8Array(10 * 1024 * 1024 + 1)),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await server.request("/documents", {
        method: "POST",
        body: new FormData(),
      })
    ).status,
    400,
  );
  const form = pdfForm();
  form.body.append(
    "file",
    new Blob(["%PDF-1.4"], { type: "application/pdf" }),
    "second.pdf",
  );
  assert.equal((await server.request("/documents", form)).status, 400);
  assert.equal(fixture.state.uploadCalls, 0);
});
test("HTTP Documents rejects unknown fields, UUID and missing download", async () => {
  const form = pdfForm();
  form.body.append("extra", "invalid");
  assert.equal((await server.request("/documents", form)).status, 400);
  assert.equal((await server.request("/documents/nope/download")).status, 400);
  assert.equal(
    (await server.request(`/documents/${randomUUID()}/download`)).status,
    404,
  );
});
test("HTTP Documents returns Storage failure without metadata or fake success", async () => {
  fixture.state.failStorage = true;
  assert.equal((await server.request("/documents", pdfForm())).status, 503);
  assert.equal(fixture.documents.size, 0);
});
test("HTTP Documents compensates metadata failure and sanitizes response", async () => {
  fixture.state.failInsert = true;
  const response = await server.request("/documents", pdfForm());
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.ok(!body.includes("sensitive SQL"));
  assert.ok(!body.includes("stack"));
  assert.equal(fixture.state.removeCalls, 1);
  assert.equal(fixture.objects.size, 0);
});
test("HTTP Documents cleanup failure keeps orphan for reconciliation and does not report success", async () => {
  fixture.state.failInsert = true;
  fixture.state.failCleanup = true;
  assert.equal((await server.request("/documents", pdfForm())).status, 500);
  assert.equal(fixture.objects.size, 1);
  assert.equal(fixture.documents.size, 0);
});
test("HTTP Documents delete failures retain metadata and allow retry", async () => {
  const document = await (await server.request("/documents", pdfForm())).json();
  fixture.state.failDelete = true;
  assert.equal(
    (await server.request(`/documents/${document.id}`, { method: "DELETE" }))
      .status,
    503,
  );
  assert.equal(fixture.documents.get(document.id).storage_status, "deleting");
  assert.equal(fixture.objects.size, 1);
  assert.equal(
    (await server.request(`/documents/${document.id}/download`)).status,
    409,
  );
  fixture.state.failDelete = false;
  fixture.state.failDbDelete = true;
  assert.equal(
    (await server.request(`/documents/${document.id}`, { method: "DELETE" }))
      .status,
    500,
  );
  assert.equal(fixture.objects.size, 0);
  assert.equal(fixture.documents.size, 1);
  fixture.state.failDbDelete = false;
  assert.equal(
    (await server.request(`/documents/${document.id}`, { method: "DELETE" }))
      .status,
    204,
  );
  assert.equal(fixture.documents.size, 0);
});
