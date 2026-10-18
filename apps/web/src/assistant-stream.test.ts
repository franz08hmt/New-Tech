import { describe, expect, it } from "vitest";
import type { AssistantStreamEvent } from "@examate/contracts";
import { parseAssistantSse } from "./assistant-stream";

function readable(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

describe("assistant SSE parser", () => {
  it("handles CRLF, several events in one chunk, and a UTF-8 character split across chunks", async () => {
    const payload = [
      `data: ${JSON.stringify({ type: "start" })}\r\n\r\n`,
      `data: ${JSON.stringify({ type: "delta", text: "Xin chào, tiếng Việt!" })}\r\n\r\n`,
      `data: ${JSON.stringify({
        type: "done",
        response: {
          answer: "Xin chào, tiếng Việt!",
          answerable: true,
          reasonCode: "ANSWER_GENERATED",
          citations: [],
          provider: "google",
          model: "gemini-test",
          mode: "general",
          ragEnabled: false,
          promptVersion: "general-v1",
        },
        answerId: "77777777-7777-4777-8777-777777777777",
      })}\r\n\r\n`,
    ].join("");
    const bytes = new TextEncoder().encode(payload);
    const splitAt = bytes.findIndex((byte) => byte === 0xc3) + 1;
    const events = [];
    for await (const event of parseAssistantSse(
      readable([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
    ))
      events.push(event);

    expect(events.map((event) => event.type)).toEqual([
      "start",
      "delta",
      "done",
    ]);
    expect(events[1]).toEqual({
      type: "delta",
      text: "Xin chào, tiếng Việt!",
    });
    expect(events[2]).toMatchObject({
      type: "done",
      answerId: "77777777-7777-4777-8777-777777777777",
      response: { answer: "Xin chào, tiếng Việt!" },
    });
  });

  it("supports a frame delimiter and JSON payload split across arbitrary network chunks", async () => {
    const bytes = new TextEncoder().encode(
      'data: {"type":"start"}\n\ndata: {"type":"delta","text":"first"}\n\n',
    );
    const events = [];
    const chunks = [
      bytes.slice(0, 3),
      bytes.slice(3, 8),
      bytes.slice(8, 10),
      bytes.slice(10, 17),
      bytes.slice(17, 18),
      bytes.slice(18, 22),
      bytes.slice(22),
    ];
    for await (const event of parseAssistantSse(readable(chunks)))
      events.push(event);
    expect(events).toEqual([
      { type: "start" },
      { type: "delta", text: "first" },
    ]);
  });

  it("parses retrieval/query progress and done responses for every assistant path", async () => {
    const events = [
      { type: "start" },
      { type: "status", stage: "retrieving" },
      { type: "status", stage: "generating" },
      {
        type: "done",
        response: {
          answer: "Grounded answer [S1].",
          answerable: true,
          reasonCode: "ANSWER_GENERATED",
          citations: [],
          provider: "google",
          model: "gemini-test",
          mode: "documents",
          ragEnabled: true,
          promptVersion: "rag-v1",
        },
      },
    ];
    const bytes = new TextEncoder().encode(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    );
    const parsed = [];
    for await (const event of parseAssistantSse(readable([bytes])))
      parsed.push(event);
    expect(parsed.map((event) => event.type)).toEqual([
      "start",
      "status",
      "status",
      "done",
    ]);
    expect(parsed[1]).toEqual({ type: "status", stage: "retrieving" });
    expect(parsed[3]).toMatchObject({
      type: "done",
      response: { mode: "documents", ragEnabled: true },
    });
  });

  it("accepts a workspace done response without model deltas", async () => {
    const bytes = new TextEncoder().encode(
      [
        { type: "start" },
        { type: "status", stage: "querying_workspace" },
        {
          type: "done",
          response: {
            answer: "There are two tasks.",
            answerable: true,
            reasonCode: "WORKSPACE_ANSWER",
            citations: [],
            provider: "workspace",
            model: "database",
            mode: "workspace",
            ragEnabled: false,
            promptVersion: "workspace-v1",
            workspaceIntent: "tasks_open",
            workspaceSources: [],
            asOf: "2026-10-18",
          },
        },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(""),
    );
    const parsed = [];
    for await (const event of parseAssistantSse(readable([bytes])))
      parsed.push(event);
    expect(parsed.map((event) => event.type)).toEqual([
      "start",
      "status",
      "done",
    ]);
    expect(parsed[1]).toEqual({
      type: "status",
      stage: "querying_workspace",
    });
    expect(parsed[2]).toMatchObject({
      type: "done",
      response: { mode: "workspace", provider: "workspace" },
    });
  });

  it("fails closed for malformed frames", async () => {
    const stream = readable([new TextEncoder().encode("data: not-json\n\n")]);
    await expect(async () => {
      for await (const _event of parseAssistantSse(stream)) void _event;
    }).rejects.toThrow("không hợp lệ");
  });

  it.each([
    ["complete ASCII frame", "a".repeat(128_000), "\n\n"],
    ["complete UTF-8 frame", "ộ".repeat(43_000), "\n\n"],
    ["incomplete UTF-8 frame", "ộ".repeat(43_000), ""],
  ])(
    "rejects an oversized %s before emitting its event",
    async (_, text, end) => {
      const bytes = new TextEncoder().encode(
        `data: ${JSON.stringify({ type: "delta", text })}${end}`,
      );
      const events: AssistantStreamEvent[] = [];
      await expect(async () => {
        const chunks = end
          ? [bytes]
          : [bytes.slice(0, 64_000), bytes.slice(64_000)];
        for await (const event of parseAssistantSse(readable(chunks)))
          events.push(event);
      }).rejects.toThrow("vượt giới hạn");
      expect(events).toEqual([]);
    },
  );

  it("accepts a frame at the UTF-8 byte limit alongside other frames in one chunk", async () => {
    const prefix = 'data: {"type":"delta","text":"';
    const suffix = '"}';
    const text =
      "ộ".repeat(42_000) +
      "a".repeat(128_000 - prefix.length - suffix.length - 126_000);
    const bytes = new TextEncoder().encode(
      `data: {"type":"start"}\n\n${prefix}${text}${suffix}\n\n`,
    );
    const events = [];
    for await (const event of parseAssistantSse(readable([bytes])))
      events.push(event);
    expect(events).toEqual([{ type: "start" }, { type: "delta", text }]);
  });

  it.each(["\n\n", "\r\n\r\n"])(
    "accepts a frame at the byte limit when its %j delimiter spans chunks",
    async (delimiter) => {
      const prefix = 'data: {"type":"delta","text":"';
      const suffix = '"}';
      const text = "a".repeat(128_000 - prefix.length - suffix.length);
      const encoder = new TextEncoder();
      const chunks = [
        encoder.encode(prefix + text + suffix + delimiter.slice(0, -1)),
        encoder.encode(delimiter.slice(-1)),
      ];
      const events = [];
      for await (const event of parseAssistantSse(readable(chunks)))
        events.push(event);
      expect(events).toEqual([{ type: "delta", text }]);
    },
  );
});
