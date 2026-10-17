import { test } from "node:test";
import assert from "node:assert/strict";
import { EmbeddingError } from "../dist/assistant/gemini-embedding.service.js";
import { DocumentOcrError } from "../dist/documents/document-ocr.service.js";
import { PdfExtractionError } from "../dist/documents/pdf-text-extractor.service.js";
import {
  ingestionFixture,
  ingestionId,
  ingestionPrincipal,
} from "./ingestion-context-fixture.mjs";

test("all ingestion authorization and business SQL use the same workspace client; dependencies do not hold it", async () => {
  const f = ingestionFixture();
  const result = await f.service.process(f.document.id, f.principal);
  assert.equal(result.processing_status, "ready");
  assert.equal(
    f.state.legacyCalls,
    0,
    "ordinary transactions bypass workspace context",
  );
  assert.equal(
    f.state.workspaceCalls,
    6,
    "claim + four fresh boundaries + persist",
  );
  assert.ok(
    f.state.authCalls.every(
      (a) =>
        a.tx &&
        a.active === 1 &&
        a.context?.workspaceId === f.principal.workspaceId,
    ),
    "authorize must receive the active workspace client",
  );
  assert.ok(
    f.state.queries.every(
      (q) => q.context?.workspaceId === f.principal.workspaceId,
    ),
  );
  assert.deepEqual(f.state.embeddingInputs, [
    {
      title: "study.pdf",
      texts: ["First source paragraph.", "Second source paragraph."],
    },
  ]);
  assert.deepEqual(result.index_quality, {
    total_page_count: 2,
    useful_text_page_count: 2,
    low_text_page_count: 0,
    indexed_chunk_count: 2,
    skipped_page_numbers: [],
    needs_ocr: false,
    ocr_page_count: 0,
    ocr_page_numbers: [],
  });
});

test("known provider failure writes failed in fresh authorized workspace context", async () => {
  const f = ingestionFixture();
  f.state.hooks.embedding = () => {
    throw new EmbeddingError("timeout");
  };
  await assert.rejects(
    f.service.process(f.document.id, f.principal),
    (e) => e.status === 504 && e.response.code === "EMBEDDING_TIMEOUT",
  );
  assert.equal(f.document.processing_status, "failed");
  assert.equal(f.state.legacyCalls, 0);
  assert.ok(
    f.state.queries
      .filter((q) => q.sql.includes("'failed'"))
      .every((q) => q.context?.workspaceId === f.principal.workspaceId),
  );
  assert.deepEqual(f.state.chunks, [{ content: "old evidence" }]);
});

test("fixed 51-page input preserves embedding order, batch size 50/1 and chunk metadata", async () => {
  const f = ingestionFixture();
  const pages = Array.from({ length: 51 }, (_, i) => ({
    page: i + 1,
    text: `Synthetic evidence for page ${i + 1}. This fixed paragraph retains source order and exact content.`,
  }));
  f.state.hooks.extract = () => pages;
  const result = await f.service.process(f.document.id, f.principal);
  assert.equal(result.chunk_count, 51);
  assert.deepEqual(f.state.embeddingInputs, [
    { title: "study.pdf", texts: pages.map((p) => p.text) },
  ]);
  assert.deepEqual(
    f.state.batches.map((v) => v.length / 7),
    [50, 1],
  );
  assert.deepEqual(
    f.state.chunks.map((c) => [
      c.chunk_index,
      c.source_page,
      c.content,
      c.dimensions,
    ]),
    pages.map((p, i) => [i, p.page, p.text, 768]),
  );
});

for (const change of ["revoke", "downgrade"])
  test(`${change} after claim COMMIT blocks even the first Storage call`, async () => {
    const f = ingestionFixture();
    f.state.onCommitted = (phase) => {
      if (phase === "claim")
        f.state.role = change === "revoke" ? undefined : "viewer";
    };
    await assert.rejects(
      f.service.process(f.document.id, f.principal),
      (e) => e.status === 403,
    );
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
    assert.equal(f.document.processing_status, "processing");
  });

for (const role of ["manager", "member"])
  test(`${role} indexes with the unchanged result`, async () => {
    const f = ingestionFixture();
    f.state.role = role;
    assert.equal(
      (await f.service.process(f.document.id, ingestionPrincipal(role)))
        .chunk_count,
      2,
    );
    assert.deepEqual(f.state.calls, {
      download: 1,
      extract: 1,
      ocr: 1,
      embedding: 1,
    });
  });
for (const [name, principal, role, status] of [
  ["missing principal", undefined, "member", 401],
  ["malformed principal", { userId: "bad" }, "member", 401],
  ["viewer", ingestionPrincipal("viewer"), "viewer", 403],
  ["no membership", ingestionPrincipal(), undefined, 403],
  [
    "downgraded DB viewer with forged manager",
    ingestionPrincipal("manager"),
    "viewer",
    403,
  ],
])
  test(`${name} cannot claim or invoke dependencies`, async () => {
    const f = ingestionFixture();
    f.state.role = role;
    await assert.rejects(
      f.service.process(f.document.id, principal),
      (e) => e.status === status,
    );
    assert.equal(f.document.processing_status, "pending");
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
    assert.ok(
      !f.state.queries.some((q) =>
        q.sql.includes("SET processing_status = 'processing'"),
      ),
    );
  });
for (const state of ["legacy", "deleting", "processing", "foreign"])
  test(`${state} document remains rejected before external work`, async () => {
    const f = ingestionFixture();
    if (state === "processing") f.document.processing_status = state;
    else if (state !== "foreign") f.document.storage_status = state;
    await assert.rejects(
      f.service.process(
        state === "foreign" ? ingestionId(200) : f.document.id,
        f.principal,
      ),
      (e) => e.status === (state === "foreign" ? 404 : 409),
    );
    assert.ok(Object.values(f.state.calls).every((n) => n === 0));
  });
for (const boundary of ["download", "extract", "ocr", "embedding"])
  for (const change of ["revoke", "downgrade"])
    test(`${change} after ${boundary} blocks the next dependency/persist`, async () => {
      const f = ingestionFixture();
      f.state.hooks[boundary] = (value) => {
        f.state.role = change === "revoke" ? undefined : "viewer";
        return value;
      };
      await assert.rejects(
        f.service.process(f.document.id, f.principal),
        (e) => e.status === 403,
      );
      const names = ["download", "extract", "ocr", "embedding"];
      for (const next of names.slice(names.indexOf(boundary) + 1))
        assert.equal(f.state.calls[next], 0);
      assert.deepEqual(f.state.chunks, [{ content: "old evidence" }]);
      assert.equal(f.document.processing_status, "processing");
    });

for (const phase of ["claim", "persist", "failed"])
  test(`lost ${phase} COMMIT ACK is not success and never replays work`, async () => {
    const f = ingestionFixture();
    f.state.lostAck = phase;
    if (phase === "failed")
      f.state.hooks.embedding = () => {
        throw new EmbeddingError("timeout");
      };
    await assert.rejects(
      f.service.process(f.document.id, f.principal),
      /lost COMMIT ACK/,
    );
    assert.equal(
      f.document.processing_status,
      phase === "claim"
        ? "processing"
        : phase === "persist"
          ? "ready"
          : "failed",
    );
    assert.equal(f.state.calls.embedding, phase === "claim" ? 0 : 1);
  });
test("persist committed/lost ACK must not fail a newer successful claim", async () => {
  const f = ingestionFixture();
  f.state.lostAck = "persist";
  f.state.afterCommit = () => {
    f.document.processing_status = "processing";
  };
  await assert.rejects(
    f.service.process(f.document.id, f.principal),
    /lost COMMIT ACK/,
  );
  assert.equal(
    f.document.processing_status,
    "processing",
    "old catch must not overwrite the next claim",
  );
  assert.ok(
    !f.state.queries.some((q) =>
      q.sql.includes("SET processing_status = 'failed'"),
    ),
  );
});
test("failed-state SQL error is rejected and safely requests reconciliation", async (t) => {
  const f = ingestionFixture();
  f.state.failState = true;
  f.state.hooks.embedding = () => {
    throw new EmbeddingError("timeout");
  };
  const logs = [];
  t.mock.method(console, "log", (value) => logs.push(value));
  await assert.rejects(
    f.service.process(f.document.id, f.principal),
    /failed-state SQL error/,
  );
  assert.equal(f.document.processing_status, "processing");
  assert.match(logs.join(""), /document.processing_reconciliation_required/);
  assert.doesNotMatch(
    logs.join(""),
    /old evidence|source paragraph|synthetic-ingestion.pdf|synthetic failed-state SQL error/,
  );
});
test("zero-row failed bookkeeping is not treated as a successful state transition", async (t) => {
  const f = ingestionFixture();
  t.mock.method(console, "log", () => {});
  f.state.hooks.embedding = () => {
    f.document.storage_status = "deleting";
    throw new EmbeddingError("timeout");
  };
  await assert.rejects(
    f.service.process(f.document.id, f.principal),
    (e) => !(e.status === 504),
  );
  assert.equal(f.document.processing_status, "processing");
});
for (const [boundary, error, status] of [
  ["extract", new PdfExtractionError("INVALID_PDF"), 422],
  ["ocr", new DocumentOcrError("OCR_TIMEOUT"), 504],
  ["embedding", new EmbeddingError("quota"), 503],
])
  test(`${boundary} public mapping remains ${status}`, async () => {
    const f = ingestionFixture();
    f.state.hooks[boundary] = () => {
      throw error;
    };
    await assert.rejects(
      f.service.process(f.document.id, f.principal),
      (e) => e.status === status,
    );
    assert.equal(f.document.processing_status, "failed");
  });
