import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_CONFIG, AUTH_ADAPTER } from "../dist/auth/auth-config.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { AnswerReceiptService } from "../dist/assistant/answer-receipt.service.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import { json } from "./helpers.mjs";
import {
  openRetrievalTenantFixture,
  tenants,
  fixedId,
} from "./retrieval-tenant-fixture.mjs";
let f;
const [A, B] = tenants;
before(async () => {
  f = await openRetrievalTenantFixture();
});
beforeEach(async () => {
  await f.reset();
});
after(async () => {
  await f?.close();
});
for (const role of ["manager", "member", "viewer", "absent"])
  test(`HTTP ${role}: real retrieval/summary/metadata and non-owner membership, synthetic upstream Auth/receipt`, async (t) => {
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
    const database = {
      query: (...args) => f.db.query(...args),
      transaction: (...args) => f.db.transaction(...args),
      workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(StorageService)
      .useValue(f.storage)
      .overrideProvider(AUTH_CONFIG)
      .useValue(() => auth.config)
      .overrideProvider(AUTH_ADAPTER)
      .useValue(auth.adapter)
      .overrideProvider(AuthStore)
      .useValue(auth.store)
      .overrideProvider(GeminiService)
      .useValue(f.provider)
      .overrideProvider(GeminiEmbeddingService)
      .useValue(f.embeddings)
      // Receipt scope is explicitly outside this slice. No extra DB grants.
      .overrideProvider(AnswerReceiptService)
      .useValue({
        verifyHistory: async () => [],
        issue: async () => fixedId(9000),
      })
      .compile();
    const app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(),
      request = (path, init) => fetch(base + "/api" + path, init);
    try {
      const boot = await request("/auth/session"),
        csrf = (await boot.json()).csrfToken;
      const login = await request("/auth/login", {
        ...json("POST", {
          email: "retrieval-sql@example.test",
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
          "Content-Type": "application/json",
        };
      const input = {
        mode: "documents",
        message: "Question",
        documentId: A.document,
        courseId: A.course,
      };
      const post = (body = input, override = {}) =>
        request("/assistant/chat", {
          method: "POST",
          headers: { ...headers, ...override },
          body: JSON.stringify(body),
        });
      assert.equal(
        (await request("/assistant/chat", json("POST", input))).status,
        401,
      );
      if (role !== "absent") {
        assert.equal((await post(input, { "X-CSRF-Token": "" })).status, 403);
        assert.equal(
          (await post(input, { Origin: "https://foreign.example.test" }))
            .status,
          403,
        );
      }
      for (const operation of ["question", "summarize", "course_info"]) {
        const response = await post({ ...input, operation }),
          text = await response.text();
        assert.doesNotMatch(
          text,
          /storage_key|fixture-docs|constraint|SELECT|stack/,
        );
        assert.equal(response.status, role === "absent" ? 403 : 200);
        if (role !== "absent") {
          assert.equal(JSON.parse(text).mode, "documents");
          assert.equal(
            (
              await post({
                ...input,
                operation,
                documentId: B.document,
                courseId: undefined,
              })
            ).status,
            404,
          );
        }
      }
      if (role === "absent") {
        assert.equal(f.state.embedding, 0);
        assert.equal(f.state.generations.length, 0);
      }
    } finally {
      await app.close();
    }
  });
