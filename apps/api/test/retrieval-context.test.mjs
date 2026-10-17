import { test } from "node:test";
import assert from "node:assert/strict";
import { retrievalFixture, id, row } from "./retrieval-context-fixture.mjs";
const scope = { documentId: id(100), courseId: id(50) };
test("retrieval SQL and every authorization use the same workspace callback; nearest scope precedes LIMIT", async () => {
  const f = retrievalFixture();
  const result = await f.retrieval.retrieve("Question", scope, f.p);
  assert.equal(
    f.state.legacy,
    0,
    "business reads must not bypass workspace context",
  );
  assert.ok(f.state.auth.every((a) => a.tx && a.active === 1));
  assert.ok(f.state.queries.every((q) => q.tx));
  const sql = f.state.queries.find((q) => q.sql.includes("WITH nearest")).sql;
  assert.ok(
    sql.indexOf("d.workspace_id = $8::uuid") > 0 &&
      sql.indexOf("d.workspace_id = $8::uuid") <
        sql.indexOf("ORDER BY dc.embedding"),
    "workspace restriction belongs inside nearest before ranking/LIMIT",
  );
  assert.deepEqual(
    result.evidence.map((c) => [c.chunkId, c.sourcePage, c.score]),
    [[id(1000), 1, 0.9]],
  );
});
for (const change of ["refile", "delete", "not-ready", "deleting"])
  test(`scope ${change} during embedding is rechecked before candidates are returned`, async () => {
    const f = retrievalFixture();
    f.state.afterEmbedding = () => {
      if (change === "delete") f.state.document = null;
      else if (change === "refile") f.state.document.course_id = id(51);
      else if (change === "deleting")
        f.state.document.storage_status = "deleting";
      else f.state.document.processing_status = "processing";
    };
    await assert.rejects(f.retrieval.retrieve("Question", scope, f.p), (e) =>
      change === "delete"
        ? e.status === 404
        : e.kind ===
          (change === "refile"
            ? "document_scope_mismatch"
            : "document_not_ready"),
    );
    assert.equal(f.state.embedding, 1);
    assert.equal(f.state.scans.length, 0);
  });
test("coverage is fresh after embedding, not metadata captured before it", async () => {
  const f = retrievalFixture();
  f.state.afterEmbedding = () => {
    f.state.document.total_page_count = 7;
    f.state.document.low_text_page_count = 4;
    f.state.document.needs_ocr = true;
  };
  const r = await f.retrieval.retrieve("Question", scope, f.p);
  assert.deepEqual(r.coverage, {
    totalPageCount: 7,
    usefulTextPageCount: 3,
    lowTextPageCount: 4,
    needsOcr: true,
  });
});
for (const role of ["manager", "member", "viewer"])
  test(`active ${role} reads summary and NULL-course metadata through workspace tx without embedding`, async () => {
    const f = retrievalFixture();
    f.state.role = role;
    f.p.role = role;
    const s = await f.retrieval.documentForSummary(id(100), {}, f.p);
    assert.equal(s.chunks[0].chunkId, id(1000));
    Object.assign(f.state.document, {
      course_id: null,
      course_slug: null,
      course_name: null,
      course_code: null,
    });
    assert.equal(
      (await f.retrieval.documentMetadata(id(100), {}, f.p)).courseId,
      null,
    );
    assert.equal(f.state.legacy, 0);
    assert.ok(f.state.auth.every((a) => a.tx && a.active === 1));
    assert.equal(f.state.embedding, 0);
  });
for (const boundary of ["before", "embedding", "scan"])
  test(`membership lost ${boundary} never returns evidence`, async () => {
    const f = retrievalFixture();
    if (boundary === "before") f.state.role = undefined;
    if (boundary === "embedding")
      f.state.afterEmbedding = () => {
        f.state.role = undefined;
      };
    if (boundary === "scan") {
      f.state.rows = Array.from({ length: 10 }, (_, n) => ({
        ...row(n),
        content: "61",
      }));
      f.state.afterScan = () => {
        f.state.role = undefined;
      };
    }
    await assert.rejects(
      f.retrieval.retrieve("Question", scope, f.p),
      (e) => e.status === 403,
    );
    assert.equal(f.state.embedding, boundary === "before" ? 0 : 1);
  });
test("scope is rechecked on expanded scans, rather than reusing previous candidates", async () => {
  const f = retrievalFixture();
  f.state.rows = Array.from({ length: 10 }, (_, n) => ({
    ...row(n),
    content: "61",
  }));
  f.state.afterScan = () => {
    f.state.document.course_id = id(51);
  };
  await assert.rejects(
    f.retrieval.retrieve("Question", scope, f.p),
    (e) => e.kind === "document_scope_mismatch",
  );
  assert.equal(f.state.scans.length, 1);
});
test("generation boundaries use short workspace authorization outside every provider call", async () => {
  const f = retrievalFixture();
  await f.assistant.chat(
    { mode: "documents", message: "Question", ...scope },
    f.p,
  );
  assert.equal(f.state.generations.length, 1);
  assert.ok(f.state.auth.every((a) => a.tx && a.active === 1));
});
for (const revokeAfter of [1, 2])
  test(`summary revoke after section ${revokeAfter} blocks the next section or synthesis`, async () => {
    const f = retrievalFixture();
    f.state.rows = Array.from({ length: 40 }, (_, n) => ({
      ...row(n),
      content:
        `Synthetic evidence ${n}. ` +
        "Useful document material for summary. ".repeat(44),
    }));
    f.state.afterGeneration = () => {
      if (f.state.generations.length === revokeAfter) f.state.role = undefined;
    };
    await assert.rejects(
      f.assistant.chat(
        {
          mode: "documents",
          operation: "summarize",
          message: "Summarize",
          documentId: id(100),
        },
        f.p,
      ),
      (e) => e.status === 403,
    );
    assert.equal(f.state.generations.length, revokeAfter);
  });
