import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { AnswerReceiptService } from "../dist/assistant/answer-receipt.service.js";
import { FeedbackService } from "../dist/feedback/feedback.service.js";
import { DocumentAccessService } from "../dist/documents/document-access.service.js";
import { requirePrincipal } from "../dist/auth/principal.js";
export { deferred, bounded } from "./retrieval-context-fixture.mjs";
export const receiptId = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const receiptPrincipal = {
  userId: receiptId(10),
  workspaceId: receiptId(1),
  role: "viewer",
};
export const receiptInput = () => ({
  mode: "general",
  message: "  Synthetic question  ",
});
export const receiptAnswer = () => ({
  mode: "general",
  answer: "Synthetic answer",
  answerable: true,
  reasonCode: "ANSWER_GENERATED",
  citations: [],
  ragEnabled: false,
  provider: "google",
  model: "synthetic",
  promptVersion: "general-v1",
});
export function snapshotOf(input = receiptInput(), response = receiptAnswer()) {
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
// Independent test oracle: do not import production canonicalJson/hash.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const feedbackInput = (answerId, snapshot = snapshotOf()) => ({
  answerId,
  submissionId: randomUUID(),
  rating: "helpful",
  reasons: [],
  snapshot,
});

export function receiptContextFixture() {
  const receipts = new Map(),
    feedback = new Map(),
    state = {
      legacy: 0,
      workspace: 0,
      queries: [],
      authorizations: [],
      role: "viewer",
      tx: null,
    };
  async function query(sql, values) {
    state.queries.push({ sql, values, tx: state.tx });
    if (sql.startsWith("INSERT INTO assistant_answer_receipts")) {
      const row = Object.fromEntries(
        [
          "id",
          "workspace_id",
          "user_id",
          "mode",
          "request_id",
          "snapshot_hash",
        ].map((k, i) => [k, values[i]]),
      );
      receipts.set(row.id, row);
      return { rows: [{ id: row.id }] };
    }
    if (sql.includes("FROM assistant_answer_receipts"))
      return {
        rows: [...receipts.values()].filter((r) =>
          ["id", "workspace_id", "user_id", "mode", "snapshot_hash"].every(
            (k) => {
              const bind = sql.match(new RegExp(`\\b${k}\\s*=\\s*\\$(\\d+)`));
              return !bind || r[k] === values[Number(bind[1]) - 1];
            },
          ),
        ),
      };
    if (sql.startsWith("INSERT INTO assistant_feedback")) {
      if (
        [...feedback.values()].some(
          (r) => r.answer_id === values[0] || r.submission_id === values[1],
        )
      )
        return { rows: [] };
      const row = {
        id: randomUUID(),
        answer_id: values[0],
        submission_id: values[1],
        rating: values[2],
        payload_hash: values[6],
        created_at: new Date("2026-10-17T00:00:00Z"),
      };
      feedback.set(row.id, row);
      return { rows: [row] };
    }
    if (sql.includes("FROM assistant_feedback"))
      return {
        rows: [...feedback.values()].filter(
          (r) => r.submission_id === values[0] || r.answer_id === values[1],
        ),
      };
    throw Error("Unexpected receipt fixture SQL");
  }
  async function workInTx(work) {
    const tx = { query };
    state.tx = tx;
    try {
      return await work(tx);
    } finally {
      state.tx = null;
    }
  }
  const database = {
    query: () => {
      throw Error("Pool query forbidden");
    },
    transaction: (work) => {
      state.legacy++;
      return workInTx(work);
    },
    workspaceTransaction: (p, work) => {
      requirePrincipal(p);
      state.workspace++;
      return workInTx(work);
    },
  };
  const access = new DocumentAccessService({
    membership: async (_w, _u, tx) => {
      state.authorizations.push(tx);
      return state.role;
    },
  });
  return {
    database,
    access,
    state,
    receipts,
    feedback,
    receipt: new AnswerReceiptService(database, access),
    service: new FeedbackService(database, access),
  };
}
