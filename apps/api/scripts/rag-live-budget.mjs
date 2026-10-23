// Operator-only campaign envelope, not an API readiness flag. Monetary values
// are integer micro-USD upper estimates, not a provider invoice. Reservations
// survive missing telemetry and unknown outcomes; nothing here retries a call.
import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";

const ENVELOPES = {
  question: { calls: 2, micros: 252000 },
  questionLite: { calls: 2, micros: 22000 },
  index: { calls: 1, micros: 5000 },
  structured: { calls: 1, micros: 250000 },
};
// Explicit operator assumptions: only the frozen tiny ASCII corpus is indexed,
// OCR is off, one embedding batch/document; questions have no history, use the
// pinned <=96k-character RAG context, <=1024 output tokens and Flash2.5. The
// generation envelope also allows the model's full 24,576-token thinking cap.
// Standard paid-tier rates verified 2026-10-23: Flash2.5 $0.30/$2.50 per1M
// input/output, embedding001 $0.15 per1M input. Never interpret unknown usage as0.
// Sources: https://ai.google.dev/gemini-api/docs/pricing
// https://developers.googleblog.com/en/gemini-embedding-available-gemini-api/
// Flash-Lite $0.10/$0.40 per1M. Its separate tiny-corpus question envelope
// requires <=20k UTF8 input bytes (including system/evidence/question), <=1024
// visible output tokens, and allows the full24576 thinking cap even though the
// Developer API default is off. Worst cost <$.013, reserve$.020 generation +
// $.002 query embedding. Do NOT use this envelope for arbitrary96k context.
function charge(call) {
  if (call.model === "gemini-embedding-001") {
    if (call.call_type === "embedding_query") return 2000;
    if (call.call_type === "embedding_document_batch") return 5000;
  }
  if (
    /^gemini-2\.5-flash(?:-lite)?(?:-\d+)?$/.test(call.model) &&
    ["generation", "generation_stream"].includes(call.call_type)
  ) {
    const total = Number(call.total_tokens);
    if (
      call.usage_status === "complete" &&
      call.total_tokens !== null &&
      call.total_tokens !== undefined &&
      Number.isSafeInteger(total) &&
      total >= 0
    )
      return Math.ceil(total * (call.model.includes("-lite") ? 0.4 : 2.5));
    return call.model.includes("-lite") ? 20000 : 250000;
  }
  throw Error("BUDGET_UNKNOWN_PROVIDER");
}

export function createLiveBudget(path) {
  // Exclusive creation deliberately refuses unattended resume/replay of an old
  // campaign. Recover its unknown outcomes and execution ledger explicitly first.
  const fd = openSync(path, "wx", 0o600),
    records = new Map();
  let chain = "0".repeat(64),
    sequence = 0,
    halted = false,
    closed = false;
  const snapshot = () => ({
    exposureMicros: [...records.values()].reduce((n, r) => n + r.micros, 0),
    providerCallsUpper: [...records.values()].reduce((n, r) => n + r.calls, 0),
    halted,
  });
  function journal(event) {
    if (closed) throw Error("BUDGET_CLOSED");
    const record = { sequence: ++sequence, previous: chain, ...event };
    chain = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    const bytes = Buffer.from(
      JSON.stringify({ ...record, sha256: chain }) + "\n",
    );
    try {
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
      fsyncSync(fd);
    } catch (error) {
      halted = true;
      throw error;
    }
  }
  journal({
    state: "opened",
    limits: { stopMicros: 800000, hardMicros: 1000000, providerCalls: 200 },
  });
  return {
    reserve(kind, label) {
      const envelope = Object.hasOwn(ENVELOPES, kind) ? ENVELOPES[kind] : null,
        current = snapshot();
      if (
        halted ||
        !envelope ||
        current.exposureMicros + envelope.micros >= 800000 ||
        current.providerCallsUpper + envelope.calls > 200
      )
        throw Error("BUDGET_STOP");
      const id = randomUUID();
      // Durable intent BEFORE returning the permit that the dispatcher needs.
      journal({ id, kind, label, state: "reserved", ...envelope });
      records.set(id, { ...envelope, settled: false });
      return id;
    },
    settle(id, observation) {
      const reserved = records.get(id);
      if (!reserved || reserved.settled)
        throw Error("BUDGET_RESERVATION_INVALID");
      if (!observation) {
        journal({ id, state: "unknown_retained" });
        reserved.settled = true;
        return;
      }
      try {
        const { providerCallCount, calls } = observation;
        if (
          !Number.isInteger(providerCallCount) ||
          providerCallCount < 0 ||
          providerCallCount > reserved.calls ||
          !Array.isArray(calls) ||
          calls.length !== providerCallCount
        )
          throw Error("BUDGET_OBSERVATION_INVALID");
        const micros = calls.reduce((n, call) => n + charge(call), 0);
        if (micros > reserved.micros) throw Error("BUDGET_ENVELOPE_BREACHED");
        journal({
          id,
          state: "settled_upper_estimate",
          micros,
          calls: providerCallCount,
          unknownUsageCalls: calls.filter((c) => c.usage_status !== "complete")
            .length,
        });
        records.set(id, { micros, calls: providerCallCount, settled: true });
      } catch (error) {
        halted = true;
        journal({ id, state: "halted_retained" });
        throw error;
      }
    },
    snapshot,
    close() {
      if (!closed) {
        journal({ state: "closed", ...snapshot() });
        closeSync(fd);
        closed = true;
      }
    },
  };
}
