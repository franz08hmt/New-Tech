import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLiveBudget } from "../scripts/rag-live-budget.mjs";

test("Flash-Lite envelope retains errors and uses its own conservative rate", () => {
  const dir = mkdtempSync(join(tmpdir(), "examate-lite-budget-"));
  try {
    const b = createLiveBudget(join(dir, "budget.jsonl"));
    const one = b.reserve("questionLite", "lite-error");
    b.settle(one, {
      providerCallCount: 2,
      calls: [
        {
          call_type: "embedding_query",
          model: "gemini-embedding-001",
          usage_status: "missing",
        },
        {
          call_type: "generation",
          model: "gemini-2.5-flash-lite",
          usage_status: "missing",
        },
      ],
    });
    assert.equal(b.snapshot().exposureMicros, 22000);
    const two = b.reserve("questionLite", "lite-known");
    b.settle(two, {
      providerCallCount: 1,
      calls: [
        {
          call_type: "generation",
          model: "gemini-2.5-flash-lite",
          usage_status: "complete",
          total_tokens: 1000,
        },
      ],
    });
    assert.equal(b.snapshot().exposureMicros, 22400);
    b.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("live budget journals before dispatch and retains unobserved charges", () => {
  const dir = mkdtempSync(join(tmpdir(), "examate-live-budget-"));
  try {
    const file = join(dir, "budget.jsonl"),
      b = createLiveBudget(file);
    assert.throws(() => b.reserve("__proto__", "invalid"), /BUDGET_STOP/);
    assert.throws(() => b.reserve("toString", "invalid"), /BUDGET_STOP/);
    const one = b.reserve("question", "RQ01");
    assert.match(readFileSync(file, "utf8"), /reserved/);
    b.settle(one, null);
    assert.equal(b.snapshot().exposureMicros, 252000);
    const two = b.reserve("question", "RQ02");
    b.settle(two, {
      providerCallCount: 1,
      calls: [
        {
          call_type: "embedding_query",
          model: "gemini-embedding-001",
          usage_status: "missing",
          total_tokens: null,
        },
      ],
    });
    assert.equal(b.snapshot().exposureMicros, 254000);
    const three = b.reserve("question", "RQ03");
    b.settle(three, {
      providerCallCount: 2,
      calls: [
        {
          call_type: "embedding_query",
          model: "gemini-embedding-001",
          usage_status: "missing",
        },
        {
          call_type: "generation",
          model: "gemini-2.5-flash",
          usage_status: "complete",
          total_tokens: 1000,
        },
      ],
    });
    assert.equal(b.snapshot().exposureMicros, 258500);
    b.reserve("question", "RQ04");
    b.reserve("question", "RQ05");
    assert.throws(() => b.reserve("question", "RQ06"), /BUDGET_STOP/);
    assert.throws(() => createLiveBudget(file), /EEXIST/);
    b.close();
  } finally {
    rmSync(dir, { recursive: true });
  }
});
