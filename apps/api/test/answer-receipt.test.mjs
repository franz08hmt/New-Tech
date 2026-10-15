import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { AssistantError } from "../dist/assistant/assistant.types.js";
import { authFixture } from "./auth-fixture.mjs";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const otherWorkspaceId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nativeFetch = globalThis.fetch;
const citation = {
  sourceId: "S1",
  documentId: "55555555-5555-4555-8555-555555555555",
  chunkId: "66666666-6666-4666-8666-666666666666",
  title: "Synthetic fixture.pdf",
  page: 1,
  chunkIndex: 0,
};

// Deliberately independent of production canonicalJson: the stored receipt must
// describe the request/response returned over HTTP, regardless of key order.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const hashSnapshot = (snapshot) =>
  createHash("sha256").update(canonical(snapshot)).digest("hex");

function generalSnapshot() {
  return {
    schemaVersion: 1,
    request: {
      mode: "general",
      operation: "question",
      question: "Synthetic study question",
    },
    response: {
      answer: "Synthetic general answer",
      answerable: true,
      reasonCode: "ANSWER_GENERATED",
      citations: [],
      provider: "google",
      model: "synthetic-fixture-model",
      mode: "general",
      ragEnabled: false,
      promptVersion: "general-v1",
    },
  };
}

function receiptDependencies(auth) {
  const dependencies = fakeDependencies();
  const receipts = new Map();
  const feedback = new Map();
  const state = {
    role: "viewer",
    denyTransactionMembership: false,
    providerError: false,
    rejectedModelResponse: false,
    noEvidence: false,
    receiptStorageError: false,
  };
  auth.config.workspaceId = workspaceId;
  auth.store.membership = async (workspace, user, tx) =>
    auth.state.member &&
    workspace === auth.config.workspaceId &&
    user === auth.userId &&
    !(tx && state.denyTransactionMembership)
      ? state.role
      : undefined;

  function insertRow(sql, values) {
    const insert = sql.match(
      /INSERT\s+INTO\s+\w+\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i,
    );
    assert.ok(insert, "receipt fixture requires a parameterized INSERT");
    return Object.fromEntries(
      insert[1].split(",").map((column, index) => {
        const expression = insert[2].split(",")[index].trim();
        const bind = expression.match(/^\$(\d+)(?:::.*)?$/);
        assert.ok(bind, "receipt fixture requires bound INSERT values");
        return [column.trim(), values[Number(bind[1]) - 1]];
      }),
    );
  }
  function matches(row, sql, values, columns) {
    const where = sql.match(/\bWHERE\b([\s\S]*)/i)?.[1] ?? "";
    return columns.every((column) => {
      const bind = where.match(
        new RegExp(`(?:\\b\\w+\\.)?\\b${column}\\s*=\\s*\\$(\\d+)`, "i"),
      );
      return !bind || row[column] === values[Number(bind[1]) - 1];
    });
  }
  const database = {
    async query(sql, values = []) {
      if (/\bINSERT\s+INTO\s+assistant_answer_receipts\b/i.test(sql)) {
        if (state.receiptStorageError) throw Error("synthetic receipt outage");
        const row = { ...insertRow(sql, values), created_at: new Date() };
        if (receipts.has(row.id)) return { rows: [], rowCount: 0 };
        receipts.set(row.id, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (/\bFROM\s+assistant_answer_receipts\b/i.test(sql)) {
        const rows = [...receipts.values()].filter((row) =>
          matches(row, sql, values, [
            "id",
            "workspace_id",
            "user_id",
            "snapshot_hash",
          ]),
        );
        return { rows: rows.map((row) => ({ ...row })), rowCount: rows.length };
      }
      if (/\bINSERT\s+INTO\s+assistant_feedback\b/i.test(sql)) {
        const inserted = insertRow(sql, values);
        if (
          [...feedback.values()].some(
            (row) =>
              row.submission_id === inserted.submission_id ||
              row.answer_id === inserted.answer_id,
          )
        )
          return { rows: [], rowCount: 0 };
        const row = { id: randomUUID(), ...inserted, created_at: new Date() };
        feedback.set(row.id, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }
      if (/\bFROM\s+assistant_feedback\b/i.test(sql)) {
        const rows = [...feedback.values()].filter((row) => {
          if (!matches(row, sql, values, ["workspace_id", "user_id"]))
            return false;
          const where = sql.match(/\bWHERE\b([\s\S]*)/i)?.[1] ?? "";
          const keys = [
            ...where.matchAll(
              /\b(submission_id|answer_id|receipt_id)\s*=\s*\$(\d+)/gi,
            ),
          ];
          return keys.some(
            ([, column, bind]) => row[column] === values[Number(bind) - 1],
          );
        });
        return { rows: rows.map((row) => ({ ...row })), rowCount: rows.length };
      }
      return dependencies.database.query(sql, values);
    },
    async transaction(work) {
      const beforeReceipts = structuredClone(receipts);
      const beforeFeedback = structuredClone(feedback);
      try {
        return await work(database);
      } catch (error) {
        receipts.clear();
        feedback.clear();
        for (const [key, row] of beforeReceipts) receipts.set(key, row);
        for (const [key, row] of beforeFeedback) feedback.set(key, row);
        throw error;
      }
    },
  };
  const provider = {
    model: "synthetic-fixture-model",
    status: () => ({ status: "ready" }),
    async generate(input) {
      if (state.providerError) throw new AssistantError("unavailable");
      if (!input.responseMimeType) return "Synthetic general answer";
      return JSON.stringify({
        answerable: true,
        answer: state.rejectedModelResponse
          ? "Unsupported citation [S999]."
          : "Synthetic grounded answer [S1].",
        citationIds: state.rejectedModelResponse ? ["S999"] : ["S1"],
      });
    },
  };
  const retrieval = {
    async retrieve() {
      return {
        promptVersion: "rag-v1",
        context: state.noEvidence ? null : "Synthetic local evidence",
        evidence: [],
        citations: state.noEvidence ? [] : [citation],
      };
    },
  };
  function seedReceipt(snapshot = generalSnapshot(), overrides = {}) {
    const row = {
      id: randomUUID(),
      workspace_id: workspaceId,
      user_id: auth.userId,
      mode: snapshot.request.mode,
      request_id: randomUUID(),
      snapshot_hash: hashSnapshot(snapshot),
      created_at: new Date(),
      ...overrides,
    };
    receipts.set(row.id, row);
    return row;
  }
  return {
    ...dependencies,
    database,
    receipts,
    feedback,
    state,
    provider,
    retrieval,
    seedReceipt,
  };
}

async function receiptApp(run) {
  const auth = authFixture();
  const fixture = receiptDependencies(auth);
  const server = await httpApp(
    fixture.database,
    fixture.storage,
    fixture.provider,
    undefined,
    fixture.retrieval,
    auth,
  );
  globalThis.fetch = (url, init) => {
    assert.ok(
      String(url).startsWith(`${server.base}/api/`),
      "only local HTTP is permitted",
    );
    return nativeFetch(url, init);
  };
  mock.method(console, "log", () => {});
  try {
    const bootstrap = await server.request("/auth/session");
    assert.equal(bootstrap.status, 200);
    let cookie = bootstrap.headers.get("set-cookie").split(";")[0];
    let csrf = (await bootstrap.json()).csrfToken;
    const post = (path, body, extra = {}) =>
      server.request(path, {
        ...json("POST", body),
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: auth.config.origin,
          "X-CSRF-Token": csrf,
          ...extra,
        },
      });
    const login = await post("/auth/login", {
      email: "receipt-fixture@example.test",
      password: "synthetic-password",
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie").split(";")[0];
    csrf = (await login.json()).csrfToken;
    await run({ fixture, auth, server, post, cookie });
  } finally {
    await server.app.close();
    globalThis.fetch = nativeFetch;
    mock.restoreAll();
  }
}
afterEach(() => {
  globalThis.fetch = nativeFetch;
  mock.restoreAll();
});

function feedbackPayload(receipt, snapshot = generalSnapshot()) {
  return {
    answerId: receipt.id,
    submissionId: randomUUID(),
    rating: "helpful",
    reasons: [],
    snapshot,
  };
}
function snapshotOf(input, response) {
  return {
    schemaVersion: 1,
    request: {
      mode: response.mode,
      operation: input.operation ?? "question",
      question: input.message.trim(),
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.documentId ? { documentId: input.documentId } : {}),
    },
    response,
  };
}
function assertIssued(response, fixture, auth, snapshot) {
  const id = response.headers.get("X-Assistant-Answer-ID");
  assert.ok(
    id,
    "successful server answer must provide X-Assistant-Answer-ID; client UUIDs are not answer receipts",
  );
  assert.match(id, uuid);
  assert.equal(fixture.receipts.size, 1);
  const row = fixture.receipts.get(id);
  assert.ok(row, "answer header must identify a durable server receipt");
  assert.equal(row.workspace_id, workspaceId);
  assert.equal(row.user_id, auth.userId);
  assert.equal(row.mode, snapshot.request.mode);
  assert.equal(row.request_id, response.headers.get("X-Request-ID"));
  assert.equal(row.snapshot_hash, hashSnapshot(snapshot));
  assert.equal(fixture.feedback.size, 0);
  return row;
}
function savedState(fixture) {
  return structuredClone({
    receipts: [...fixture.receipts],
    feedback: [...fixture.feedback],
  });
}

for (const mode of ["general", "documents", "workspace"])
  test(`HTTP answer receipt: ${mode} success issues a server UUID bound to authenticated user, workspace and canonical snapshot`, async () =>
    receiptApp(async ({ fixture, auth, post }) => {
      const input = {
        message:
          mode === "workspace"
            ? "  Workspace có những môn học nào?  "
            : "  Synthetic study question  ",
        mode,
        operation: "question",
        courseId: null,
        documentId: null,
        pageContext: { pageId: "fixture", pageName: "Synthetic page" },
      };
      const forgedId = randomUUID();
      const response = await post("/assistant/chat", input, {
        "X-Assistant-Answer-ID": forgedId,
        "X-Workspace-ID": otherWorkspaceId,
        "X-User-ID": otherUserId,
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      const row = assertIssued(
        response,
        fixture,
        auth,
        snapshotOf(input, body),
      );
      assert.notEqual(row.id, forgedId);
      assert.equal(Object.hasOwn(body, "answerId"), false);
    }));

test("HTTP answer receipt: document no-evidence refusal remains a successful receipted answer", async () =>
  receiptApp(async ({ fixture, auth, post }) => {
    fixture.state.noEvidence = true;
    const input = { message: "Synthetic study question", mode: "documents" };
    const response = await post("/assistant/chat", input);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.answerable, false);
    assert.equal(body.reasonCode, "NO_RELEVANT_EVIDENCE");
    assertIssued(response, fixture, auth, snapshotOf(input, body));
  }));

for (const [label, expectedStatus, request] of [
  [
    "missing authentication",
    401,
    ({ server }) =>
      server.request(
        "/assistant/chat",
        json("POST", { message: "Synthetic question", mode: "general" }),
      ),
  ],
  [
    "invalid CSRF",
    403,
    ({ post }) =>
      post(
        "/assistant/chat",
        { message: "Synthetic question", mode: "general" },
        { "X-CSRF-Token": "invalid" },
      ),
  ],
  [
    "DTO validation",
    400,
    ({ post }) => post("/assistant/chat", { message: "", mode: "general" }),
  ],
  [
    "provider failure",
    503,
    ({ fixture, post }) => {
      fixture.state.providerError = true;
      return post("/assistant/chat", {
        message: "Synthetic question",
        mode: "general",
      });
    },
  ],
  [
    "rejected model citations",
    502,
    ({ fixture, post }) => {
      fixture.state.rejectedModelResponse = true;
      return post("/assistant/chat", {
        message: "Synthetic question",
        mode: "documents",
      });
    },
  ],
])
  test(`HTTP answer receipt: ${label} creates no receipt and returns no answer ID`, async () =>
    receiptApp(async (context) => {
      const response = await request(context);
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers.get("X-Assistant-Answer-ID"), null);
      assert.equal(context.fixture.receipts.size, 0);
      assert.equal(context.fixture.feedback.size, 0);
    }));

test("HTTP answer receipt: receipt outage preserves the valid answer without an answer ID", async () =>
  receiptApp(async ({ fixture, post }) => {
    fixture.state.receiptStorageError = true;
    const response = await post("/assistant/chat", {
      mode: "general",
      message: "Synthetic question",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answer, "Synthetic general answer");
    assert.equal(response.headers.get("X-Assistant-Answer-ID"), null);
    assert.equal(fixture.receipts.size, 0);
  }));

test("HTTP answer receipt: membership revoked after generation still blocks the answer", async () =>
  receiptApp(async ({ fixture, post }) => {
    fixture.state.denyTransactionMembership = true;
    const response = await post("/assistant/chat", {
      mode: "general",
      message: "Synthetic question",
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(response.headers.get("X-Assistant-Answer-ID"), null);
    assert.equal(fixture.receipts.size, 0);
  }));

for (const [label, receiptOverrides, mutate] of [
  ["another user's receipt", { user_id: otherUserId }, () => {}],
  ["another workspace's receipt", { workspace_id: otherWorkspaceId }, () => {}],
  [
    "fabricated client answer UUID",
    {},
    (body) => {
      body.answerId = randomUUID();
    },
  ],
  [
    "changed answer snapshot",
    {},
    (body) => {
      body.snapshot.response.answer = "Synthetic substituted answer";
    },
  ],
  [
    "changed question snapshot",
    {},
    (body) => {
      body.snapshot.request.question = "Synthetic substituted question";
    },
  ],
])
  test(`HTTP answer receipt: ${label} returns safe 404 without changing receipts or feedback`, async () =>
    receiptApp(async ({ fixture, post }) => {
      const receipt = fixture.seedReceipt(generalSnapshot(), receiptOverrides);
      const body = feedbackPayload(receipt);
      mutate(body);
      const before = savedState(fixture);
      const response = await post("/assistant/feedback", body, {
        "X-Role": "manager",
        "X-User-ID": receipt.user_id,
        "X-Workspace-ID": receipt.workspace_id,
      });
      assert.equal(
        response.status,
        404,
        "unowned, unknown or mismatched answer receipts must not be persisted as feedback",
      );
      const error = await response.json();
      assert.match(error.requestId, uuid);
      assert.doesNotMatch(
        JSON.stringify(error),
        /SELECT|snapshot_hash|workspace_id|user_id|Synthetic substituted|stack/,
      );
      assert.deepEqual(savedState(fixture), before);
    }));

test("HTTP answer receipt: authenticated viewer can give feedback on their server answer and retry identically", async () =>
  receiptApp(async ({ fixture, auth, post }) => {
    const input = { message: "Synthetic study question", mode: "general" };
    const answer = await post("/assistant/chat", input);
    assert.equal(answer.status, 200);
    const snapshot = snapshotOf(input, await answer.json());
    const receipt = assertIssued(answer, fixture, auth, snapshot);
    const body = feedbackPayload(receipt, snapshot);
    const response = await post("/assistant/feedback", body);
    assert.equal(response.status, 201);
    const ack = await response.json();
    assert.deepEqual(Object.keys(ack).sort(), ["createdAt", "id", "rating"]);
    assert.equal(fixture.feedback.size, 1);
    const saved = [...fixture.feedback.values()][0];
    assert.equal(saved.receipt_id, receipt.id);
    assert.equal(saved.workspace_id, workspaceId);
    assert.equal(saved.user_id, auth.userId);
    const beforeRetry = savedState(fixture);
    const retry = await post("/assistant/feedback", body);
    assert.equal(retry.status, 201);
    assert.deepEqual(await retry.json(), ack);
    assert.deepEqual(savedState(fixture), beforeRetry);
  }));

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  return value;
}
test("HTTP answer receipt: canonical snapshot accepts reordered JSON keys for a viewer's own receipt", async () =>
  receiptApp(async ({ fixture, post }) => {
    const snapshot = generalSnapshot();
    const receipt = fixture.seedReceipt(snapshot);
    const response = await post(
      "/assistant/feedback",
      feedbackPayload(receipt, reverseKeys(snapshot)),
    );
    assert.equal(response.status, 201);
    assert.equal(fixture.feedback.size, 1);
    assert.equal([...fixture.feedback.values()][0].receipt_id, receipt.id);
  }));

test("HTTP answer receipt: revoked membership at transaction boundary cannot save viewer feedback", async () =>
  receiptApp(async ({ fixture, post }) => {
    const receipt = fixture.seedReceipt();
    fixture.state.denyTransactionMembership = true;
    const before = savedState(fixture);
    const response = await post(
      "/assistant/feedback",
      feedbackPayload(receipt),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "WORKSPACE_ACCESS_DENIED");
    assert.deepEqual(savedState(fixture), before);
  }));
