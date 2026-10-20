import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  openIngestionTenantFixture,
  tenants,
} from "./ingestion-tenant-fixture.mjs";
import { httpApp, json } from "./helpers.mjs";
import { authFixture } from "./auth-fixture.mjs";
import { EmbeddingError } from "../dist/assistant/gemini-embedding.service.js";
import { AiAdmissionError } from "../dist/assistant/ai-admission.service.js";
let f;
const [A, B] = tenants;
before(async () => {
  f = await openIngestionTenantFixture();
});
beforeEach(async () => {
  await f.reset();
});
after(async () => {
  await f?.close();
});
for (const role of ["manager", "member", "viewer", "absent"])
  test(`HTTP ingestion ${role}: real non-owner membership/FOR SHARE/RLS with synthetic upstream session`, async (t) => {
    t.mock.method(console, "log", () => {});
    const auth = authFixture();
    auth.config.workspaceId = A.id;
    auth.config.origin = "http://127.0.0.1:5173";
    await f.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
    if (role !== "absent")
      await f.admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
        [A.id, auth.userId, role],
      );
    auth.store.membership = f.auth.membership.bind(f.auth);
    // The suite owns this shared connection; Nest must not close it between
    // role scenarios. This facade changes ownership only, never query context.
    const database = {
      query: (...args) => f.db.query(...args),
      transaction: (...args) => f.db.transaction(...args),
      workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
    };
    const server = await httpApp(
      database,
      f.storage,
      { generate: () => assert.fail("No generation") },
      f.ingestion,
      { retrieve: () => assert.fail("No retrieval") },
      auth,
    );
    try {
      const boot = await server.request("/auth/session"),
        csrf = (await boot.json()).csrfToken;
      const login = await server.request("/auth/login", {
        ...json("POST", {
          email: "ingestion-sql@example.test",
          password: "synthetic-only",
        }),
        headers: {
          "Content-Type": "application/json",
          Origin: auth.config.origin,
          Cookie: boot.headers.get("set-cookie").split(";")[0],
          "X-CSRF-Token": csrf,
        },
      });
      assert.equal(login.status, 200);
      const session = await login.json(),
        headers = {
          Origin: auth.config.origin,
          Cookie: login.headers.get("set-cookie").split(";")[0],
          "X-CSRF-Token": session.csrfToken,
        };
      const post = (id = A.document, overrides = {}) =>
        server.request(`/documents/${id}/process`, {
          method: "POST",
          headers: { ...headers, ...overrides },
        });
      assert.equal(
        (
          await server.request(`/documents/${A.document}/process`, {
            method: "POST",
          })
        ).status,
        401,
      );
      if (role !== "absent") {
        assert.equal(
          (await post(undefined, { "X-CSRF-Token": "" })).status,
          403,
        );
        assert.equal(
          (await post(undefined, { Origin: "https://foreign.example.test" }))
            .status,
          403,
        );
      }
      assert.ok(Object.values(f.state.calls).every((n) => n === 0));
      const response = await post(),
        text = await response.text();
      assert.doesNotMatch(
        text,
        /storage_key|fixture-docs|source paragraph|constraint|SELECT|INSERT|stack/,
      );
      if (["manager", "member"].includes(role)) {
        assert.equal(response.status, 200);
        assert.equal(JSON.parse(text).processing_status, "ready");
        assert.equal((await post(B.document)).status, 404);
        f.state.hooks.embedding = () => {
          throw new EmbeddingError("quota");
        };
        const failed = await post();
        assert.equal(failed.status, 503);
        assert.equal((await failed.json()).code, "EMBEDDING_QUOTA");
        assert.equal(
          (
            await f.admin.query(
              "SELECT processing_status FROM documents WHERE id=$1",
              [A.document],
            )
          ).rows[0].processing_status,
          "failed",
        );
        f.state.hooks.embedding = () => {
          throw new AiAdmissionError(
            "AI_FANOUT_LIMIT",
            429,
            "Synthetic safe admission message.",
          );
        };
        const admissionDenied = await post();
        assert.equal(admissionDenied.status, 429);
        assert.equal((await admissionDenied.json()).code, "AI_FANOUT_LIMIT");
        assert.equal(
          (
            await f.admin.query(
              "SELECT processing_status FROM documents WHERE id=$1",
              [A.document],
            )
          ).rows[0].processing_status,
          "failed",
        );
      } else {
        assert.equal(response.status, 403);
        assert.equal(
          JSON.parse(text).code,
          role === "viewer" ? "ROLE_FORBIDDEN" : "WORKSPACE_ACCESS_DENIED",
        );
        assert.ok(Object.values(f.state.calls).every((n) => n === 0));
      }
    } finally {
      await server.app.close();
    }
  });
