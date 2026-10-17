import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestionFixture, ingestionId } from "./ingestion-context-fixture.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { httpApp, json } from "./helpers.mjs";
import { EmbeddingError } from "../dist/assistant/gemini-embedding.service.js";

// Real Nest routes, AuthService/guard/CSRF and ingestion orchestration. Auth
// adapter/session store and SQL are synthetic; SQL proof is a separate suite.
async function scenario(t, role, work) {
  t.mock.method(console, "log", () => {});
  const f = ingestionFixture(),
    auth = authFixture();
  f.state.role = role;
  auth.config.workspaceId = f.principal.workspaceId;
  auth.config.origin = "http://127.0.0.1:5173";
  auth.store.membership = async () => f.state.role;
  const forbidden = () => {
    assert.fail("No generation or retrieval in ingestion");
  };
  const server = await httpApp(
    f.database,
    f.storage,
    { generate: forbidden },
    f.service,
    { retrieve: forbidden },
    auth,
  );
  try {
    const boot = await server.request("/auth/session"),
      pre = await boot.json();
    const login = await server.request("/auth/login", {
      ...json("POST", {
        email: "synthetic-ingestion@example.test",
        password: "synthetic-only",
      }),
      headers: {
        "Content-Type": "application/json",
        Origin: auth.config.origin,
        Cookie: boot.headers.get("set-cookie").split(";")[0],
        "X-CSRF-Token": pre.csrfToken,
      },
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const headers = {
      Origin: auth.config.origin,
      Cookie: login.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": session.csrfToken,
    };
    const post = (id = f.document.id, override = {}) =>
      server.request(`/documents/${id}/process`, {
        method: "POST",
        headers: { ...headers, ...override },
      });
    await work({ f, server, post, headers });
  } finally {
    await server.app.close();
  }
}
async function safe(response, status, code) {
  assert.equal(response.status, status);
  const text = await response.text();
  assert.doesNotMatch(
    text,
    /storage_key|synthetic-ingestion\.pdf|source paragraph|constraint|SELECT|INSERT|stack/,
  );
  const body = JSON.parse(text);
  if (code) assert.equal(body.code, code);
  return body;
}
for (const role of ["manager", "member"])
  test(`HTTP ingestion ${role}: actual service indexes without public shape changes`, async (t) =>
    scenario(t, role, async ({ f, post }) => {
      const body = await safe(await post(), 200);
      assert.equal(body.processing_status, "ready");
      assert.equal(body.chunk_count, 2);
      assert.deepEqual(f.state.calls, {
        download: 1,
        extract: 1,
        ocr: 1,
        embedding: 1,
      });
    }));
for (const role of ["viewer", undefined])
  test(`HTTP ingestion ${role ?? "no membership"}: forbidden before any claim/dependency`, async (t) =>
    scenario(t, role, async ({ f, post }) => {
      await safe(
        await post(),
        403,
        role ? "ROLE_FORBIDDEN" : "WORKSPACE_ACCESS_DENIED",
      );
      assert.equal(f.document.processing_status, "pending");
      assert.ok(Object.values(f.state.calls).every((n) => n === 0));
    }));
test("HTTP ingestion missing Auth/CSRF/foreign Origin/invalid ID never reaches the business boundary", async (t) =>
  scenario(t, "member", async ({ f, server, post }) => {
    await safe(
      await server.request(`/documents/${f.document.id}/process`, {
        method: "POST",
      }),
      401,
    );
    await safe(
      await post(undefined, { "X-CSRF-Token": "" }),
      403,
      "CSRF_INVALID",
    );
    await safe(
      await post(undefined, { Origin: "https://forbidden.example.test" }),
      403,
      "CSRF_INVALID",
    );
    await safe(await post("not-a-uuid"), 400);
    assert.equal(f.state.workspaceCalls, 0);
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
  }));
test("HTTP ingestion foreign document is generic 404 with zero side effects", async (t) =>
  scenario(t, "member", async ({ f, post }) => {
    await safe(await post(ingestionId(200)), 404);
    assert.equal(f.document.processing_status, "pending");
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
  }));
for (const state of ["legacy", "deleting", "processing"])
  test(`HTTP ingestion ${state} preserves public conflict`, async (t) =>
    scenario(t, "member", async ({ f, post }) => {
      if (state === "processing") f.document.processing_status = state;
      else f.document.storage_status = state;
      await safe(
        await post(),
        409,
        state === "processing"
          ? "DOCUMENT_PROCESSING"
          : "DOCUMENT_NOT_PROCESSABLE",
      );
      assert.ok(Object.values(f.state.calls).every((n) => n === 0));
    }));
test("HTTP ingestion quota error is mapped and DB state never reports ready", async (t) =>
  scenario(t, "member", async ({ f, post }) => {
    f.state.hooks.embedding = () => {
      throw new EmbeddingError("quota");
    };
    await safe(await post(), 503, "EMBEDDING_QUOTA");
    assert.equal(f.document.processing_status, "failed");
  }));
test("HTTP ingestion revoked permission after embedding returns 403 with old chunks intact", async (t) =>
  scenario(t, "member", async ({ f, post }) => {
    f.state.hooks.embedding = (value) => {
      f.state.role = undefined;
      return value;
    };
    await safe(await post(), 403, "WORKSPACE_ACCESS_DENIED");
    assert.equal(f.document.processing_status, "processing");
    assert.deepEqual(f.state.chunks, [{ content: "old evidence" }]);
  }));
