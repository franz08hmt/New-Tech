import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocumentFormatFixture } from "./document-formats-fixture.mjs";
import { AuthDatabaseService } from "../dist/database/auth-database.service.js";
import { PdfTextExtractorService } from "../dist/documents/pdf-text-extractor.service.js";

let runtime, owner;
const types = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  txt: "text/plain",
};
async function form(format) {
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        await readFile(
          new URL(
            `./fixtures/document-formats/notes.${format}`,
            import.meta.url,
          ),
        ),
      ],
      { type: types[format] },
    ),
    `notes.${format}`,
  );
  return form;
}
before(async () => {
  runtime = await openDocumentFormatFixture();
  owner = await runtime.actor("member");
});
after(async () => {
  await runtime?.close();
});
test("Nest upload converts all four formats under real Auth/business LOGINs, without AI; canonical PDF indexes and answers with scoped citations", async () => {
  for (const format of Object.keys(types)) {
    const before = { ...runtime.counters };
    const response = await owner.call("/documents", {
      method: "POST",
      body: await form(format),
    });
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(item.name, `notes.${format}.pdf`);
    assert.equal(item.media_type, "application/pdf");
    assert.equal(item.processing_status, "pending");
    assert.equal(runtime.counters.conversion, before.conversion + 1);
    assert.equal(runtime.counters.generation, before.generation);
    assert.equal(runtime.counters.embedding, before.embedding);
    const stored = runtime.objects.get(`documents/${item.id}.pdf`);
    assert.equal(item.size_bytes, stored.length);
    assert.match(
      (await new PdfTextExtractorService().extract(stored))
        .map((p) => p.text)
        .join(" "),
      /Tiến trình/,
    );
    const indexed = await owner.call(`/documents/${item.id}/process`, {
      method: "POST",
    });
    assert.equal(indexed.status, 200);
    assert.equal((await indexed.json()).processing_status, "ready");
    const answer = await owner.call("/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "documents",
        message: "What is a process?",
        documentId: item.id,
      }),
    });
    assert.equal(answer.status, 200);
    const body = await answer.json();
    assert.equal(body.citations[0].documentId, item.id);
    assert.ok(body.citations[0].page >= 1);
    if (format === "docx") {
      for (const [kind, countKey, contentKey] of [
        ["quizzes", "questionCount", "quiz"],
        ["flashcards", "cardCount", "flashcards"],
      ]) {
        const response = await owner.call(`/study-coach/${kind}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: item.id,
            language: "en",
            [countKey]: 3,
          }),
        });
        assert.equal(response.status, 201);
        const draft = await response.json();
        assert.equal(draft.documentId, item.id);
        const content = draft[contentKey];
        assert.equal(content.sources[0].documentId, item.id);
        assert.equal((content.questions ?? content.cards).length, 3);
      }
    }
    const foreign = await runtime.actor("manager", runtime.tenants[1]);
    assert.equal((await foreign.call(`/documents/${item.id}`)).status, 404);
  }
});
test("foreign course is rejected before conversion and unsupported content cannot create metadata", async () => {
  const actor = await runtime.actor("member");
  const body = await form("md");
  body.append("courseId", runtime.tenants[1].course);
  const before = { ...runtime.counters };
  assert.equal(
    (await actor.call("/documents", { method: "POST", body })).status,
    404,
  );
  assert.equal(runtime.counters.conversion, before.conversion);
  const bad = new FormData();
  bad.append(
    "file",
    new Blob(["not a Word archive"], { type: types.docx }),
    "bad.docx",
  );
  const response = await actor.call("/documents", {
    method: "POST",
    body: bad,
  });
  assert.equal(response.status, 422);
  assert.equal(runtime.counters.upload, before.upload);
});

test("viewer, revoked membership and Auth capability cannot bypass document boundaries", async () => {
  const viewer = await runtime.actor("viewer");
  const before = { ...runtime.counters };
  assert.equal(
    (
      await viewer.call("/documents", {
        method: "POST",
        body: await form("txt"),
      })
    ).status,
    403,
  );
  assert.equal(runtime.counters.conversion, before.conversion);
  await assert.rejects(
    viewer.app.get(AuthDatabaseService).query("SELECT * FROM documents"),
    (error) => error.code === "42501",
  );
  await runtime.fixture.admin.query(
    "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
    [owner.workspace.id, owner.auth.userId],
  );
  assert.equal(
    (await owner.call("/documents", { method: "POST", body: await form("md") }))
      .status,
    403,
  );
  assert.equal(runtime.counters.conversion, before.conversion);
});
test("membership is checked again after real conversion before Storage or metadata writes", async () => {
  const actor = await runtime.actor("member");
  const before = { ...runtime.counters };
  runtime.hooks.afterConversion = () =>
    runtime.fixture.admin.query(
      "UPDATE workspace_memberships SET active=false WHERE workspace_id=$1 AND user_id=$2",
      [actor.workspace.id, actor.auth.userId],
    );
  try {
    assert.equal(
      (
        await actor.call("/documents", {
          method: "POST",
          body: await form("docx"),
        })
      ).status,
      403,
    );
  } finally {
    runtime.hooks.afterConversion = undefined;
  }
  assert.equal(runtime.counters.upload, before.upload);
});
