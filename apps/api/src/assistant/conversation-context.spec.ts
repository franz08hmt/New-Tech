import { describe, expect, it } from "vitest";
import {
  buildConversationContext,
  stripPriorSources,
  retrievalQuestion,
} from "./conversation-context.js";
import type { AssistantHistoryTurn } from "@examate/contracts";

const turn = (question: string, answer: string) =>
  ({
    receiptId: "11111111-1111-4111-8111-111111111111",
    snapshot: { request: { question }, response: { answer } },
  }) as AssistantHistoryTurn;

describe("verified conversation context", () => {
  it("reserves retrieval space for the latest question when the penultimate one is long", () => {
    const query = retrievalQuestion("Câu mới", [
      { question: "a".repeat(3000), answer: "" },
      { question: "Câu gần nhất", answer: "" },
    ]);
    expect(query).toContain("\nCâu gần nhất");
    expect(query.length).toBeLessThanOrEqual(4000);
  });
  it("neutralizes every source-like bracket recognized by the citation validator", () => {
    expect(stripPriorSources("A [S1] B [S1, S2] C [S999]")).toBe(
      "A (nguồn ở lượt trước) B (nguồn ở lượt trước) C (nguồn ở lượt trước)",
    );
  });
  it("drops oldest whole turns, preserving recent order", () => {
    const result = buildConversationContext(
      [turn("old", "a".repeat(700)), turn("new", "b".repeat(700))],
      1000,
    );
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].question).toBe("new");
    expect(result.truncated).toBe(true);
  });
  it("shortens an oversized summary only after neutralizing markers without changing snapshot", () => {
    const original = turn(
      "Tóm tắt?",
      "a".repeat(2000) + "[S1]" + "b".repeat(2000),
    );
    const before = JSON.stringify(original);
    const result = buildConversationContext([original], 1000);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].answer).toContain("(đã rút gọn)");
    expect(result.turns[0].answer).not.toContain("[S");
    expect(
      result.turns[0].question.length + result.turns[0].answer.length,
    ).toBeLessThanOrEqual(1000);
    expect(JSON.stringify(original)).toBe(before);
    expect(result.truncated).toBe(true);
  });
  it("keeps refusal text as context, without inventing evidence", () => {
    expect(
      buildConversationContext([turn("Câu hỏi?", "Không đủ bằng chứng.")], 1000)
        .turns[0].answer,
    ).toBe("Không đủ bằng chứng.");
  });
  it("retrieval uses current question then at most two previous questions, never answers", () => {
    expect(
      retrievalQuestion("Câu mới", [
        { question: "cũ 1", answer: "secret1" },
        { question: "cũ 2", answer: "secret2" },
        { question: "cũ 3", answer: "secret3" },
      ]),
    ).toBe("Câu mới\ncũ 2\ncũ 3");
  });
  it("retrieval preserves the existing 4000-character ceiling and no-history query", () => {
    expect(
      retrievalQuestion("x".repeat(3999), [{ question: "trước", answer: "a" }]),
    ).toHaveLength(3999);
    expect(retrievalQuestion("Câu nguyên gốc", [])).toBe("Câu nguyên gốc");
  });
});
