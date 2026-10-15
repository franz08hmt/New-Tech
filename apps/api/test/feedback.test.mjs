import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { canonicalJson } from "../dist/feedback/feedback-validation.js";
import { fakeDependencies, httpApp, json } from "./helpers.mjs";

const snapshot = () => ({
  schemaVersion: 1,
  request: {
    mode: "workspace",
    operation: "question",
    question: "Synthetic smoke question",
  },
  response: {
    mode: "workspace",
    provider: "workspace",
    model: "database",
    promptVersion: "workspace-v1",
    answer: "Synthetic answer",
    answerable: false,
    reasonCode: "WORKSPACE_UNSUPPORTED",
    ragEnabled: false,
    citations: [],
    workspaceSources: [],
    workspaceIntent: "unsupported",
    asOf: "2026-10-05",
  },
});
const payload = () => ({
  answerId: randomUUID(),
  submissionId: randomUUID(),
  rating: "helpful",
  reasons: [],
  snapshot: snapshot(),
});
let server, rows, statements, failDatabase, loseCommit;
let receipts;
beforeEach(async () => {
  rows = [];
  receipts = new Map();
  statements = [];
  failDatabase = false;
  loseCommit = false;
  const database = {
    async transaction(work) {
      const result = await work(database);
      if (loseCommit) throw new Error("SYNTHETIC lost commit response");
      return result;
    },
    async query(sql, values) {
      statements.push({ sql, values });
      if (failDatabase)
        throw new Error("SECRET_CONNECTION_STRING private snapshot");
      if (sql.startsWith("SELECT id FROM assistant_answer_receipts")) {
        const receipt = receipts.get(values[0]);
        return {
          rows:
            receipt &&
            receipt.workspaceId === values[1] &&
            receipt.userId === values[2] &&
            receipt.hash === values[3]
              ? [{ id: values[0] }]
              : [],
        };
      }
      if (sql.startsWith("INSERT INTO assistant_feedback")) {
        if (
          rows.some(
            (r) => r.submission_id === values[1] || r.answer_id === values[0],
          )
        )
          return { rows: [] };
        const row = {
          id: randomUUID(),
          answer_id: values[0],
          submission_id: values[1],
          rating: values[2],
          payload_hash: values[6],
          created_at: new Date(),
        };
        rows.push(row);
        return { rows: [row] };
      }
      if (sql.startsWith("SELECT id, answer_id"))
        return {
          rows: rows.filter(
            (r) => r.submission_id === values[0] || r.answer_id === values[1],
          ),
        };
      throw new Error("Unexpected SQL");
    },
  };
  server = await httpApp(database, fakeDependencies().storage);
});
afterEach(async () => {
  await server?.app.close();
  mock.restoreAll();
});
const send = (body) => {
  // These existing DTO/idempotency tests use an explicitly issued synthetic
  // receipt fixture; ownership attacks use the independent HTTP/real-DB suites.
  if (!receipts.has(body.answerId))
    receipts.set(body.answerId, {
      workspaceId: "22222222-2222-4222-8222-222222222222",
      userId: "11111111-1111-4111-8111-111111111111",
      hash: createHash("sha256")
        .update(canonicalJson(body.snapshot))
        .digest("hex"),
    });
  return server.request("/assistant/feedback", json("POST", body));
};
test("feedback helpful persists a refusal and returns only acknowledgement", async () => {
  const response = await send(payload());
  assert.equal(response.status, 201);
  const ack = await response.json();
  assert.deepEqual(Object.keys(ack).sort(), ["createdAt", "id", "rating"]);
  assert.equal(rows.length, 1);
  const insert = statements.find((s) =>
    s.sql.startsWith("INSERT INTO assistant_feedback"),
  );
  assert.ok(insert.sql.includes("$7"));
  assert.equal(insert.sql.includes("Synthetic"), false);
});
test("feedback unhelpful accepts multiple reasons with other note", async () => {
  const response = await send({
    ...payload(),
    rating: "unhelpful",
    reasons: ["wrong_source", "missing_detail", "other"],
    comment: "Synthetic note",
  });
  assert.equal(response.status, 201);
});

for (const mode of ["general", "documents", "metadata"])
  test(`feedback accepts ${mode} response snapshot without verifying its truth`, async () => {
    const p = payload();
    const documentId = randomUUID();
    p.snapshot.request = {
      mode: mode === "metadata" ? "documents" : mode,
      operation: mode === "metadata" ? "course_info" : "question",
      question: "Synthetic question",
      ...(mode === "metadata" ? { documentId } : {}),
    };
    p.snapshot.response =
      mode === "metadata"
        ? {
            mode: "documents",
            provider: "workspace",
            model: "database",
            promptVersion: "fixture",
            answer: "Synthetic metadata",
            answerable: true,
            reasonCode: "DOCUMENT_METADATA",
            ragEnabled: false,
            citations: [],
            metadataSource: {
              documentId,
              title: "fixture.pdf",
              courseId: null,
              courseSlug: null,
              courseName: null,
              courseCode: null,
            },
          }
        : {
            mode,
            provider: "google",
            model: "fixture",
            promptVersion: "fixture",
            answer: "Synthetic answer",
            answerable: true,
            reasonCode: "ANSWER_GENERATED",
            ragEnabled: mode === "documents",
            citations:
              mode === "documents"
                ? [
                    {
                      sourceId: "S1",
                      documentId,
                      chunkId: randomUUID(),
                      title: "fixture.pdf",
                      page: 1,
                      chunkIndex: 0,
                    },
                  ]
                : [],
          };
    assert.equal((await send(p)).status, 201);
  });

test("feedback allows full 1000 Unicode characters without changing content", async () => {
  const p = payload();
  p.comment = "😀".repeat(1000);
  assert.equal((await send(p)).status, 201);
  assert.equal(
    statements.find((s) => s.sql.startsWith("INSERT INTO assistant_feedback"))
      .values[4],
    p.comment,
  );
});

test("feedback rejects deeply nested invalid snapshot as validation without storage", async () => {
  const p = payload();
  let nested = "invalid";
  for (let i = 0; i < 1500; i++) nested = { child: nested };
  p.snapshot.request.question = nested;
  assert.equal((await send(p)).status, 400);
  assert.equal(statements.length, 0);
});
for (const [name, mutate] of [
  ["rating", (p) => (p.rating = "excellent")],
  [
    "reason",
    (p) => {
      p.rating = "unhelpful";
      p.reasons = ["made_up"];
    },
  ],
  [
    "duplicates",
    (p) => {
      p.rating = "unhelpful";
      p.reasons = ["wrong_source", "wrong_source"];
    },
  ],
  ["missing reasons", (p) => (p.rating = "unhelpful")],
  [
    "other without note",
    (p) => {
      p.rating = "unhelpful";
      p.reasons = ["other"];
      p.comment = "  ";
    },
  ],
  ["UUID", (p) => (p.answerId = "m2")],
  ["comment limit", (p) => (p.comment = "x".repeat(1001))],
  ["null comment", (p) => (p.comment = null)],
  ["unknown field", (p) => (p.token = "SECRET")],
  ["nested unknown field", (p) => (p.snapshot.response.signedUrl = "SECRET")],
  ["snapshot type", (p) => (p.snapshot.response.mode = "general")],
  ["question limit", (p) => (p.snapshot.request.question = "x".repeat(4001))],
  ["answer limit", (p) => (p.snapshot.response.answer = "x".repeat(32001))],
  ["snapshot bytes", (p) => (p.snapshot.response.answer = "漢".repeat(30000))],
  [
    "source limit",
    (p) =>
      (p.snapshot.response.workspaceSources = Array.from(
        { length: 41 },
        () => ({ kind: "task", id: randomUUID(), label: "Test" }),
      )),
  ],
  [
    "source forbidden fields",
    (p) =>
      (p.snapshot.response.workspaceSources = [
        {
          kind: "task",
          id: randomUUID(),
          label: "Test",
          storage_key: "secret",
        },
      ]),
  ],
  ["helpful reasons", (p) => (p.reasons = ["other"])],
])
  test(`feedback rejects ${name} without DB writes`, async () => {
    const p = payload();
    mutate(p);
    assert.equal((await send(p)).status, 400);
    assert.equal(statements.length, 0);
  });
test("feedback replay and concurrent submissions create only one row", async () => {
  const p = payload();
  const responses = await Promise.all([send(p), send(p)]);
  assert.ok(responses.every((r) => r.status === 201));
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  assert.equal(rows.length, 1);
  assert.equal((await send(p)).status, 201);
  assert.equal(rows.length, 1);
});
test("feedback changed payload or second submission for answer conflicts", async () => {
  const p = payload();
  await send(p);
  assert.equal((await send({ ...p, comment: "different" })).status, 409);
  assert.equal((await send({ ...p, submissionId: randomUUID() })).status, 409);
  assert.equal(rows.length, 1);
});
test("feedback canonical object key order replays", async () => {
  const p = payload();
  const a = await (await send(p)).json();
  const b = await (
    await send(Object.fromEntries(Object.entries(p).reverse()))
  ).json();
  assert.equal(a.id, b.id);
});
test("feedback only logs saved after a confirmed commit; unknown outcome retries idempotently", async () => {
  const logs = [];
  mock.method(console, "log", (line) => logs.push(JSON.parse(line)));
  const p = payload();
  loseCommit = true;
  assert.equal((await send(p)).status, 503);
  assert.equal(logs.filter((l) => l.event === "feedback.saved").length, 0);
  loseCommit = false;
  assert.equal((await send(p)).status, 201);
  assert.equal(rows.length, 1);
  assert.equal(
    logs.filter((l) => l.event === "feedback.saved")[0].outcome,
    "replayed",
  );
});

test("feedback database errors and logs do not reveal content", async () => {
  const logs = [];
  mock.method(console, "log", (...args) => logs.push(args));
  failDatabase = true;
  const p = payload();
  p.comment = "PRIVATE_COMMENT";
  const response = await send(p);
  assert.equal(response.status, 503);
  const serialized = JSON.stringify({ body: await response.json(), logs });
  for (const secret of [
    "SECRET_CONNECTION_STRING",
    "PRIVATE_COMMENT",
    "Synthetic answer",
    "Synthetic smoke question",
  ])
    assert.equal(serialized.includes(secret), false);
});
