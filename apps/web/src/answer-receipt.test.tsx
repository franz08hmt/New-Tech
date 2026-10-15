import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AssistantChatResponse } from "@examate/contracts";
import { useAssistant } from "./use-assistant";
import { api } from "./api";
import { configurePilotClient } from "./pilot-client";
const answerId = "87654321-4321-4321-8321-876543218765";
const response: AssistantChatResponse = {
  mode: "general",
  provider: "google",
  model: "fixture",
  promptVersion: "fixture",
  answer: "Câu trả lời minh họa.",
  answerable: true,
  reasonCode: "ANSWER_GENERATED",
  ragEnabled: false,
  citations: [],
};
const context = { pageId: "tasks", pageName: "Tasks" };
afterEach(() => {
  cleanup();
  configurePilotClient();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("new answer feedback uses the server receipt, never client randomness", async () => {
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("No client answer UUID");
    },
  });
  const { result } = renderHook(() =>
    useAssistant(async () => ({
      text: response.answer,
      citations: [],
      response,
      answerId,
    })),
  );
  act(() => result.current.setDraft("  Câu hỏi minh họa?  "));
  await act(async () => {
    await result.current.send(context);
  });
  expect(result.current.messages[1].feedback?.answerId).toBe(answerId);
  expect(result.current.messages[1].feedback?.snapshot.request.question).toBe(
    "Câu hỏi minh họa?",
  );
});
for (const id of [undefined, "not-a-uuid", "", answerId + ", " + answerId])
  it(`missing/malformed receipt ${String(id)} keeps answer but disables feedback`, async () => {
    const { result } = renderHook(() =>
      useAssistant(async () => ({
        text: response.answer,
        citations: [],
        response,
        answerId: id,
      })),
    );
    act(() => result.current.setDraft("Câu hỏi minh họa?"));
    await act(async () => {
      await result.current.send(context);
    });
    expect(result.current.messages[1].text).toBe(response.answer);
    expect(result.current.messages[1].feedback).toBeUndefined();
    expect(result.current.messages[1].feedbackUnavailable).toBe(true);
  });
it("HTTP transport forwards server answer header without changing the response body", async () => {
  configurePilotClient("synthetic-csrf", true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Assistant-Answer-ID": answerId,
        },
      }),
    ),
  );
  const observed = vi.fn();
  // Optional callback is the transport boundary, not a new HTTP JSON envelope.
  expect(
    await api.askAssistant({ mode: "general", message: "Câu hỏi?" }, observed),
  ).toEqual(response);
  expect(observed).toHaveBeenCalledWith(answerId);
});
