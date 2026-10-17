import "reflect-metadata";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type {
  AssistantChatRequest,
  AssistantHistoryTurn,
  PilotPrincipal,
} from "@examate/contracts";
import { AnswerReceiptService } from "./answer-receipt.service.js";
import { canonicalJson } from "../feedback/feedback-validation.js";
import { validHistory } from "./history-validation.js";
import {
  buildConversationContext,
  retrievalQuestion,
} from "./conversation-context.js";

const suite = JSON.parse(
  readFileSync(
    new URL("../../evaluation/conversation-cases.json", import.meta.url),
    "utf8",
  ),
) as {
  semanticStatus: string;
  cases: { id: string; question: string; kind: string }[];
};
const user = "11111111-1111-4111-8111-111111111111",
  workspace = "22222222-2222-4222-8222-222222222222";
const docA = "33333333-3333-4333-8333-333333333333",
  docB = "44444444-4444-4444-8444-444444444444";
const principal: PilotPrincipal = {
  userId: user,
  workspaceId: workspace,
  role: "member",
};
const digest = (value: unknown) =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

for (const c of suite.cases)
  it(`${c.id}: ${c.question} [deterministic only; semantic pending B4]`, async () => {
    expect(suite.semanticStatus).toBe("PENDING_LIVE_B4");
    const summary = [
      "long_summary",
      "summary_followup",
      "summary_scope_reset",
    ].includes(c.kind);
    const turn: AssistantHistoryTurn = {
      receiptId: "55555555-5555-4555-8555-555555555555",
      snapshot: {
        schemaVersion: 1,
        request: {
          mode: "documents",
          operation: summary ? "summarize" : "question",
          question: "Các bước ôn tập gồm những gì?",
          documentId: docA,
        },
        response: {
          mode: "documents",
          answer:
            "Một: đọc đề cương. Hai: tự giải thích. Ba: làm bài tập [S1].",
          answerable: true,
          reasonCode: "ANSWER_GENERATED",
          ragEnabled: true,
          provider: "google",
          model: "fake-offline",
          promptVersion: "rag-v1",
          citations: [
            {
              sourceId: "S1",
              documentId: docA,
              chunkId: docB,
              title: "Tài liệu minh họa A.pdf",
              page: 1,
              chunkIndex: 0,
            },
          ],
        },
      },
    };
    if (c.kind === "long_summary")
      turn.snapshot.response.answer = "Nội dung minh họa [S1]. ".repeat(600);
    const storedHash = digest(turn.snapshot);
    const storedUser = c.kind === "foreign_user" ? docB : user;
    if (c.kind === "tampered_hash")
      turn.snapshot.response.answer = "Nội dung bị thay thế.";
    const request: AssistantChatRequest = {
      mode: "documents",
      message: c.question,
      documentId: c.kind === "summary_scope_reset" ? docB : docA,
      history: [turn],
    };
    if (c.kind === "same_course") {
      turn.snapshot.request.courseId = docB;
      request.courseId = docB;
    }
    if (c.kind === "seven_turns")
      request.history = Array.from({ length: 7 }, () => turn);
    if (c.kind === "seven_turns") {
      expect(validHistory(request.history, request)).toBe(false);
      return;
    }
    expect(validHistory(request.history, request)).toBe(true);
    const expectedHash =
      c.kind === "same_course" ? digest(turn.snapshot) : storedHash;
    const database = {
      workspaceTransaction: async (
        _principal: unknown,
        work: (tx: unknown) => Promise<void>,
      ) =>
        work({
          query: async (_sql: string, values: unknown[]) => ({
            rows:
              values[0] === turn.receiptId &&
              values[1] === workspace &&
              values[2] === storedUser &&
              values[3] === "documents" &&
              values[4] === expectedHash
                ? [{ id: turn.receiptId }]
                : [],
          }),
        }),
    };
    const receipts = new AnswerReceiptService(
      database as never,
      { authorize: async () => principal } as never,
    );
    if (
      ["tampered_hash", "foreign_user", "summary_scope_reset"].includes(c.kind)
    ) {
      await expect(
        receipts.verifyHistory(request, principal),
      ).rejects.toMatchObject({ response: { code: "HISTORY_INVALID" } });
      if (c.kind === "summary_scope_reset") {
        // A fresh scope must send no old context; the frontend hook has the
        // corresponding executable reset test rather than trusting this comment.
        request.history = [];
        await expect(
          receipts.verifyHistory(request, principal),
        ).resolves.toBeUndefined();
      }
      return;
    }
    await receipts.verifyHistory(request, principal);
    const history =
      c.kind === "budget"
        ? [
            ...Array.from({ length: 5 }, () => ({
              ...turn,
              snapshot: {
                ...turn.snapshot,
                response: {
                  ...turn.snapshot.response,
                  answer: "x".repeat(600),
                },
              },
            })),
            turn,
          ]
        : [turn];
    const context = buildConversationContext(history, 1000);
    expect(context.turns.at(-1)?.answer).not.toContain("[S1]");
    if (c.kind === "budget") {
      expect(context.truncated).toBe(true);
      expect(context.turns.length).toBeLessThan(6);
    }
    if (c.kind === "long_summary") {
      expect(context.truncated).toBe(true);
      expect(context.turns[0].answer).toContain("(đã rút gọn)");
    }
    const turns =
      c.kind === "two_questions"
        ? [
            {
              question: "Bước thứ nhất là gì?",
              answer: "Không phải bằng chứng.",
            },
            ...context.turns,
          ]
        : context.turns;
    const query = retrievalQuestion(c.question, turns);
    expect(query).toBe(
      [c.question, ...turns.slice(-2).map((t) => t.question)].join("\n"),
    );
    expect(query).not.toContain("Không phải bằng chứng.");
  });
