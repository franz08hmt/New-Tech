import { afterEach, expect, it, vi } from "vitest";
import { validHistory, boundedHistoryInput } from "./history-validation.js";
import { conversationConfig } from "../config/config.js";

function history(answer: string, count: number) {
  return Array.from({ length: count }, () => ({
    receiptId: "11111111-1111-4111-8111-111111111111",
    snapshot: {
      schemaVersion: 1,
      request: {
        mode: "general",
        operation: "question",
        question: "Câu trước",
      },
      response: {
        mode: "general",
        answer,
        answerable: true,
        reasonCode: "ANSWER_GENERATED",
        citations: [],
        ragEnabled: false,
        provider: "google",
        model: "fake",
        promptVersion: "general-v1",
      },
    },
  }));
}
afterEach(() => vi.unstubAllEnvs());
it("bounds total serialized characters even when each snapshot is valid", () => {
  expect(
    validHistory(history("a".repeat(21000), 2), {
      message: "Câu tiếp",
      mode: "general",
    }),
  ).toBe(true);
  expect(
    validHistory(history("a".repeat(22000), 3), {
      message: "Câu tiếp",
      mode: "general",
    }),
  ).toBe(false);
});
it("bounds total UTF-8 bytes separately for Vietnamese text", () => {
  expect(
    validHistory(history("ộ".repeat(10000), 2), {
      message: "Câu tiếp",
      mode: "general",
    }),
  ).toBe(true);
  expect(
    validHistory(history("ộ".repeat(10000), 3), {
      message: "Câu tiếp",
      mode: "general",
    }),
  ).toBe(false);
});
it("accepts empty workspace history as the unchanged one-turn path", () => {
  expect(validHistory([], { message: "Câu tiếp", mode: "workspace" })).toBe(
    true,
  );
});
it("bounds raw nesting before recursive DTO transformation", () => {
  let value: unknown = {};
  for (let i = 0; i < 100; i++) value = { child: value };
  expect(boundedHistoryInput(value)).toBe(false);
});
it("uses a 12000-character default context budget", () => {
  vi.stubEnv("ASSISTANT_CONTEXT_MAX_CHARS", undefined);
  expect(conversationConfig().maxChars).toBe(12000);
});
it.each(["0", "999", "24001", "abc", "1.5", ""])(
  "rejects unsafe context config %s",
  (value) => {
    vi.stubEnv("ASSISTANT_CONTEXT_MAX_CHARS", value);
    expect(() => conversationConfig()).toThrow("ASSISTANT_CONTEXT_MAX_CHARS");
  },
);
it.each(["1000", "24000"])("accepts context boundary %s", (value) => {
  vi.stubEnv("ASSISTANT_CONTEXT_MAX_CHARS", value);
  expect(conversationConfig().maxChars).toBe(Number(value));
});
