import assert from "node:assert/strict";

// Synthetic corpus expectations are fixed independently of service output.
export function assertGroundedAnswer(answer, documentId, page = 4) {
  assert.equal(
    answer.answerable,
    true,
    "known evidence must produce an answer",
  );
  assert.ok(
    ["ANSWER_GENERATED", "PARTIAL_COVERAGE"].includes(answer.reasonCode),
  );
  assert.match(answer.answer, /Synthetic answer \[S1\]/);
  assert.equal(answer.citations.length, 1, "fallback is not a positive result");
  assert.deepEqual(answer.citations, [
    {
      sourceId: "S1",
      documentId,
      page,
      chunkIndex: page - 1,
      title: "Synthetic 0 document.pdf",
      chunkId: `00000000-0000-4000-8000-${String(1000 + page - 1).padStart(12, "0")}`,
    },
  ]);
}
