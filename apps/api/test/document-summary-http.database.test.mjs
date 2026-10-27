// Full authenticated Word -> PDF -> indexed evidence -> JSON/SSE runtime.
// Only Auth upstream, Storage and SDK transport are synthetic; no paid AI call.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocumentFormatFixture } from "./document-formats-fixture.mjs";
import { GeminiService } from "../dist/assistant/gemini.service.js";

let runtime, actor, document;
const calls = { json: 0, stream: 0 };
async function persistedUsage(result, expectedCalls, version) {
  const requestId = result.headers.get("x-request-id");
  let operation;
  for (let attempt = 0; attempt < 100 && !operation; attempt++) {
    operation = (
      await runtime.fixture.admin.query(
        "SELECT operation_id,provider_call_count,prompt_version,outcome FROM ai_usage_operations WHERE request_id=$1",
        [requestId],
      )
    ).rows[0];
    if (!operation) await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(
    operation,
    "real wrapper usage must persist before fixture teardown",
  );
  assert.equal(operation.provider_call_count, expectedCalls);
  assert.equal(operation.prompt_version, version);
  assert.equal(operation.outcome, "success");
  const rows = (
    await runtime.fixture.admin.query(
      "SELECT call_type,prompt_version,outcome,usage_status FROM ai_usage_provider_calls WHERE operation_id=$1",
      [operation.operation_id],
    )
  ).rows;
  assert.equal(rows.length, expectedCalls);
  const generation = rows.find((row) =>
    ["generation", "generation_stream"].includes(row.call_type),
  );
  assert.ok(generation);
  assert.equal(generation.prompt_version, version);
  assert.equal(generation.outcome, "success");
  assert.equal(generation.usage_status, "complete");
}
function response(input) {
  assert.equal(input.config.maxOutputTokens, 4096);
  assert.deepEqual(input.config.thinkingConfig, { thinkingBudget: 256 });
  const ids =
    input.config.responseJsonSchema.properties.blocks.items.properties.sourceIds
      .items.enum;
  assert.ok(ids.length > 0);
  return JSON.stringify({
    answerable: true,
    blocks: [
      { text: "A process is a program in execution.", sourceIds: [ids[0]] },
      { text: "Threads in a process share memory.", sourceIds: [ids.at(-1)] },
    ],
  });
}
before(async () => {
  runtime = await openDocumentFormatFixture();
  actor = await runtime.actor("member");
  actor.app.get(GeminiService).client = {
    models: {
      async generateContent(input) {
        calls.json++;
        return {
          text: response(input),
          candidates: [{ finishReason: "STOP" }],
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 30,
            totalTokenCount: 60,
          },
        };
      },
      async generateContentStream(input) {
        calls.stream++;
        const text = response(input);
        return {
          async *[Symbol.asyncIterator]() {
            yield { text: text.slice(0, 80) };
            yield {
              text: text.slice(80),
              candidates: [{ finishReason: "STOP" }],
              usageMetadata: {
                promptTokenCount: 30,
                candidatesTokenCount: 30,
                totalTokenCount: 60,
              },
            };
          },
        };
      },
    },
  };
  const form = new FormData();
  form.append(
    "file",
    new Blob(
      [
        await readFile(
          new URL(
            "./fixtures/document-formats/summary-19pages.docx",
            import.meta.url,
          ),
        ),
      ],
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ),
    "summary-19pages.docx",
  );
  const uploaded = await actor.call("/documents", {
    method: "POST",
    body: form,
  });
  assert.equal(uploaded.status, 201);
  document = await uploaded.json();
  assert.equal(document.name, "summary-19pages.docx.pdf");
  assert.equal(calls.json, 0);
  assert.equal(calls.stream, 0);
  const indexed = await actor.call(`/documents/${document.id}/process`, {
    method: "POST",
  });
  assert.equal(indexed.status, 200);
  assert.equal((await indexed.json()).index_quality.total_page_count, 19);
});
after(async () => {
  await runtime?.close();
});
test("19-page converted Word summary renders consistent authoritative citations with a single generation", async () => {
  const result = await actor.call("/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "documents",
      operation: "summarize",
      documentId: document.id,
      message: "Tóm tắt tài liệu",
    }),
  });
  assert.equal(result.status, 200);
  const answer = await result.json();
  assert.equal(answer.answerable, true);
  assert.equal(answer.promptVersion, "rag-summary-v2");
  assert.equal(answer.citations.length, 2);
  assert.equal(answer.citations[0].page, 1);
  assert.equal(answer.citations[1].page, 19);
  for (const source of answer.citations) {
    assert.equal(source.documentId, document.id);
    assert.ok(answer.answer.includes(`[${source.sourceId}]`));
  }
  assert.equal(calls.json, 1);
  assert.equal(calls.stream, 0);
  assert.ok(result.headers.get("x-assistant-answer-id"));
  await persistedUsage(result, 1, "rag-summary-v2");
});
test("buffered document SSE completes on atomic blocks without exposing JSON or unverified deltas", async () => {
  const result = await actor.call("/assistant/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "documents",
      documentId: document.id,
      message: "Ghi nội dung chính của tài liệu",
    }),
  });
  assert.equal(result.status, 200);
  const events = (await result.text())
    .split("\n\n")
    .filter((s) => s.startsWith("data: "))
    .map((s) => JSON.parse(s.slice(6)));
  assert.equal(
    events.some((e) => e.type === "error" || e.type === "delta"),
    false,
  );
  const done = events.find((e) => e.type === "done");
  assert.ok(done);
  assert.equal(done.response.promptVersion, "rag-json-v2");
  assert.ok(done.answerId);
  assert.ok(done.response.citations.every((c) => c.documentId === document.id));
  assert.equal(calls.stream, 1);
  assert.equal(calls.json, 1);
  await persistedUsage(result, 2, "rag-json-v2");
});
