import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Test } from "@nestjs/testing";
import { AppModule } from "../dist/app.module.js";
import { DatabaseService } from "../dist/database/database.service.js";
import { StorageService } from "../dist/documents/storage.service.js";
import { AnswerReceiptService } from "../dist/assistant/answer-receipt.service.js";
import { FeedbackService } from "../dist/feedback/feedback.service.js";
import { AuthStore } from "../dist/auth/auth-store.js";
import { AUTH_CONFIG, AUTH_ADAPTER } from "../dist/auth/auth-config.js";
import { GeminiService } from "../dist/assistant/gemini.service.js";
import { GeminiEmbeddingService } from "../dist/assistant/gemini-embedding.service.js";
import { configureApp } from "../dist/common/http.js";
import { authFixture } from "./auth-fixture.mjs";
import {
  openReceiptTenantFixture,
  tenants,
  people,
  loseNextCommit,
} from "./receipt-tenant-fixture.mjs";
import {
  receiptInput,
  receiptAnswer,
  snapshotOf,
  feedbackInput,
  digest,
} from "./receipt-context-fixture.mjs";
import { assertGroundedAnswer } from "./retrieval-positive.mjs";
const [A] = tenants;
async function withApp(role, run) {
  const f = await openReceiptTenantFixture(),
    auth = authFixture();
  const resourceDir = new URL(
    `../../../artifacts/phase16-receipt-http-${randomUUID()}/`,
    import.meta.url,
  );
  mkdirSync(resourceDir, { recursive: true });
  writeFileSync(
    new URL("resource.json", resourceDir),
    JSON.stringify({
      name: f.name,
      role: f.role,
      marker: f.marker,
      closed: false,
    }),
    { flag: "wx" },
  );
  let app;
  const nativeFetch = globalThis.fetch;
  try {
    await f.reset();
    auth.config.workspaceId = A.id;
    auth.config.origin = "http://127.0.0.1:5173";
    await f.admin.query("INSERT INTO auth.users(id) VALUES($1)", [auth.userId]);
    if (role !== "absent")
      await f.admin.query(
        "INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,$3)",
        [A.id, auth.userId, role],
      );
    auth.store.membership = f.auth.membership.bind(f.auth);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        query: (...args) => f.db.query(...args),
        transaction: (...args) => f.db.transaction(...args),
        workspaceTransaction: (...args) => f.db.workspaceTransaction(...args),
      })
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
      .overrideProvider(AnswerReceiptService)
      .useValue(f.receipts)
      .overrideProvider(FeedbackService)
      .useValue(f.feedback)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    globalThis.fetch = (url, init) => {
      assert.ok(
        String(url).startsWith(base + "/api/"),
        "external HTTP blocked",
      );
      return nativeFetch(url, init);
    };
    const request = (path, init) => fetch(base + "/api" + path, init);
    const boot = await request("/auth/session"),
      csrf = (await boot.json()).csrfToken;
    const login = await request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: auth.config.origin,
        Cookie: boot.headers.get("set-cookie").split(";")[0],
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        email: "receipt-sql@example.test",
        password: "synthetic-only",
      }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    const headers = {
      "Content-Type": "application/json",
      Origin: auth.config.origin,
      Cookie: login.headers.get("set-cookie").split(";")[0],
      "X-CSRF-Token": session.csrfToken,
    };
    const post = (path, body, extra = {}) =>
      request(path, {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify(body),
      });
    await run({ f, auth, post, request });
  } finally {
    try {
      await app?.close();
    } finally {
      globalThis.fetch = nativeFetch;
      await f.close();
      writeFileSync(
        new URL("closed.json", resourceDir),
        JSON.stringify({ closed: true }),
        { flag: "wx" },
      );
    }
  }
}
for (const role of ["manager", "member", "viewer"])
  test(`HTTP non-owner ${role}: three modes issue real receipts; N1 verifies and own feedback replays`, async (t) => {
    t.mock.method(console, "log", () => {});
    await withApp(role, async ({ f, auth, post, request }) => {
      assert.equal(
        (
          await request("/assistant/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(receiptInput()),
          })
        ).status,
        401,
      );
      assert.equal(
        (await post("/assistant/chat", receiptInput(), { "X-CSRF-Token": "" }))
          .status,
        403,
      );
      assert.equal(
        (
          await post("/assistant/chat", receiptInput(), {
            Origin: "https://foreign.example.test",
          })
        ).status,
        403,
      );
      let prior;
      for (const mode of ["general", "documents", "workspace"]) {
        const input = {
          mode,
          message:
            mode === "workspace"
              ? "Workspace có những môn học nào?"
              : "Question",
          ...(mode === "documents"
            ? { documentId: A.document, courseId: A.course }
            : {}),
        };
        const response = await post("/assistant/chat", input);
        assert.equal(response.status, 200);
        const answer = await response.json(),
          id = response.headers.get("X-Assistant-Answer-ID");
        assert.ok(id);
        if (mode === "documents") assertGroundedAnswer(answer, A.document);
        const snapshot = snapshotOf(input, answer),
          row = (
            await f.admin.query(
              "SELECT * FROM assistant_answer_receipts WHERE id=$1",
              [id],
            )
          ).rows[0];
        assert.equal(row.user_id, auth.userId);
        assert.equal(row.workspace_id, A.id);
        assert.equal(row.snapshot_hash, digest(snapshot));
        const body = feedbackInput(id, snapshot),
          first = await post("/assistant/feedback", body),
          replay = await post("/assistant/feedback", body);
        assert.equal(first.status, 201);
        assert.equal(replay.status, 201);
        assert.deepEqual(await first.json(), await replay.json());
        if (mode === "general") prior = { receiptId: id, snapshot };
      }
      const follow = await post("/assistant/chat", {
        mode: "general",
        message: "Follow up",
        history: [prior],
      });
      assert.equal(follow.status, 200);
      assert.equal((await follow.json()).contextTurnsUsed, 1);
      const before = f.state.generations.length,
        embeddings = f.state.embedding;
      const tampered = structuredClone(prior);
      tampered.snapshot.response.answer += " tampered";
      const rejected = await post("/assistant/chat", {
        mode: "general",
        message: "Follow up",
        history: [tampered],
      });
      assert.equal(rejected.status, 400);
      assert.equal((await rejected.json()).code, "HISTORY_INVALID");
      assert.equal(f.state.generations.length, before);
      assert.equal(f.state.embedding, embeddings);
    });
  });

test("HTTP non-owner: real COMMIT uncertainty preserves issued answer/no header; history uncertainty blocks generation", async (t) => {
  t.mock.method(console, "log", () => {});
  await withApp("viewer", async ({ f, post }) => {
    const input = receiptInput(),
      first = await post("/assistant/chat", input),
      prior = {
        receiptId: first.headers.get("X-Assistant-Answer-ID"),
        snapshot: snapshotOf(input, await first.json()),
      };
    const original = f.receipts.issue.bind(f.receipts);
    f.receipts.issue = async (...args) => {
      const restore = loseNextCommit(f.db);
      try {
        return await original(...args);
      } finally {
        restore();
      }
    };
    const uncertain = await post("/assistant/chat", {
      ...input,
      message: "Valid answer, lost issuance ACK",
    });
    assert.equal(uncertain.status, 200);
    assert.equal((await uncertain.json()).answerable, true);
    assert.equal(uncertain.headers.get("X-Assistant-Answer-ID"), null);
    f.receipts.issue = original;
    const before = f.state.generations.length,
      embeddingBefore = f.state.embedding,
      restore = loseNextCommit(f.db);
    try {
      const blocked = await post("/assistant/chat", {
        ...input,
        history: [prior],
      });
      assert.equal(blocked.status, 503);
      assert.equal((await blocked.json()).code, "DATABASE_UNAVAILABLE");
      assert.equal(blocked.headers.get("X-Assistant-Answer-ID"), null);
    } finally {
      restore();
    }
    assert.equal(f.state.generations.length, before);
    assert.equal(f.state.embedding, embeddingBefore);
    const recovered = await post("/assistant/chat", {
      ...input,
      history: [prior],
    });
    assert.equal(recovered.status, 200);
    assert.equal((await recovered.json()).contextTurnsUsed, 1);
    f.state.afterGeneration = () =>
      f.admin.query(
        "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=(SELECT user_id FROM assistant_answer_receipts WHERE id=$2)",
        [A.id, prior.receiptId],
      );
    const revoked = await post("/assistant/chat", input);
    assert.equal(revoked.status, 403);
    assert.equal(revoked.headers.get("X-Assistant-Answer-ID"), null);
  });
});
test("HTTP no membership never reaches retrieval, embedding, generation or receipt", async (t) => {
  t.mock.method(console, "log", () => {});
  await withApp("absent", async ({ f, post }) => {
    const response = await post("/assistant/chat", {
      mode: "documents",
      documentId: A.document,
      message: "Question",
    });
    assert.equal(response.status, 403);
    assert.equal(f.state.embedding, 0);
    assert.equal(f.state.generations.length, 0);
    assert.equal(
      (
        await f.admin.query(
          "SELECT count(*)::int AS n FROM assistant_answer_receipts",
        )
      ).rows[0].n,
      0,
    );
  });
});
