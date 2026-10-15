import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AssistantChatResponse,
  AssistantHistoryTurn,
  AssistantMode,
  AssistantOperation,
} from "@examate/contracts";
import {
  useAssistant,
  type AssistantContext,
  type AskTransport,
} from "./use-assistant";

type TransportOptions = {
  history?: AssistantHistoryTurn[];
  signal?: AbortSignal;
};
type Reply = Awaited<ReturnType<AskTransport>>;
type ConversationTransport = (
  question: string,
  context: AssistantContext,
  mode: AssistantMode,
  operation: AssistantOperation,
  options?: TransportOptions,
) => Promise<Reply>;

const context: AssistantContext = {
  pageId: "courses",
  pageName: "Môn học",
  courseId: "11111111-1111-4111-8111-111111111111",
  documentId: "22222222-2222-4222-8222-222222222222",
};

function receiptId(index: number) {
  return `87654321-4321-4321-8321-${String(index).padStart(12, "0")}`;
}

function reply(index: number, overrides: Partial<Reply> = {}): Reply {
  const response: AssistantChatResponse = {
    mode: "documents",
    provider: "google",
    model: "fixture",
    promptVersion: "fixture",
    answer: `Câu trả lời gốc ${index}`,
    answerable: true,
    reasonCode: "ANSWER_GENERATED",
    ragEnabled: true,
    citations: [],
  };
  return {
    text: `Câu trả lời hiển thị ${index}`,
    citations: [],
    response,
    answerId: receiptId(index),
    ...overrides,
  };
}

function fixture() {
  let index = 0;
  const transport = vi.fn<ConversationTransport>(async () => reply(++index));
  const hook = renderHook(() => useAssistant(transport));
  async function send(
    message: string,
    scope = context,
    operation: AssistantOperation = "question",
  ) {
    await act(async () => {
      await hook.result.current.send(scope, { message, operation });
    });
  }
  return { ...hook, transport, send };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("receipted conversation memory", () => {
  it("sends zero, one and two previous receipts on three consecutive questions", async () => {
    const { transport, send } = fixture();
    await send("Câu một");
    await send("Câu hai");
    await send("Câu ba");

    expect(
      transport.mock.calls.map((call) => call[4]?.history?.length),
    ).toEqual([0, 1, 2]);
    expect(
      transport.mock.calls[2][4]?.history?.map((turn) => turn.receiptId),
    ).toEqual([receiptId(1), receiptId(2)]);
  });

  it("retains a missing-receipt answer in the UI but excludes it from future history", async () => {
    const { result, transport, send } = fixture();
    transport.mockResolvedValueOnce(reply(1, { answerId: undefined }));
    await send("Câu chưa có biên nhận");
    expect(result.current.messages[1].feedbackUnavailable).toBe(true);
    expect(result.current.messages[1].text).toBe("Câu trả lời hiển thị 1");
    await send("Câu tiếp theo");
    expect(transport.mock.calls[1][4]?.history).toEqual([]);
  });

  it("stores the server response snapshot exactly, without substituting display text or adding history", async () => {
    const { result, transport, send } = fixture();
    const original = reply(1);
    transport.mockResolvedValueOnce(original);
    await send("  Câu hỏi gốc  ");
    await send("Nói tiếp");
    const expected = {
      schemaVersion: 1,
      request: {
        mode: "documents",
        operation: "question",
        question: "Câu hỏi gốc",
        courseId: context.courseId,
        documentId: context.documentId,
      },
      response: original.response,
    };
    expect(result.current.messages[1].feedback?.snapshot).toEqual(expected);
    expect(transport.mock.calls[1][4]?.history).toEqual([
      { receiptId: receiptId(1), snapshot: expected },
    ]);
    expect(original.response?.answer).toBe("Câu trả lời gốc 1");
  });

  it("only sends the six most recent completed receipts", async () => {
    const { transport, send } = fixture();
    for (let i = 1; i <= 8; i++) await send(`Câu ${i}`);
    expect(
      transport.mock.calls[7][4]?.history?.map((turn) => turn.receiptId),
    ).toEqual([2, 3, 4, 5, 6, 7].map(receiptId));
  });

  it.each([
    ["character", "a".repeat(20_000)],
    ["UTF-8 byte", "ộ".repeat(10_000)],
  ])(
    "drops oldest whole turns before exceeding the %s history budget",
    async (_, answer) => {
      const { transport, send } = fixture();
      let index = 0;
      transport.mockImplementation(async () => {
        const value = reply(++index);
        return { ...value, response: { ...value.response!, answer } };
      });
      for (let i = 1; i <= 5; i++) await send(`Câu ${i}`);
      const history = transport.mock.calls[4][4]?.history;
      expect(history).toBeDefined();
      expect(history!.length).toBeGreaterThan(0);
      expect(history!.length).toBeLessThan(4);
      expect(history!.at(-1)?.receiptId).toBe(receiptId(4));
      const serialized = JSON.stringify(history);
      expect(serialized.length).toBeLessThanOrEqual(64_000);
      expect(
        new TextEncoder().encode(serialized).byteLength,
      ).toBeLessThanOrEqual(81_920);
      expect(history![0].receiptId).not.toBe(receiptId(1));
    },
  );
});

describe("conversation boundaries", () => {
  it("automatically resets memory when send changes document or course scope", async () => {
    const { transport, send } = fixture();
    await send("Tài liệu đầu");
    await send("Tài liệu khác", {
      ...context,
      documentId: "33333333-3333-4333-8333-333333333333",
    });
    await send("Môn khác", {
      ...context,
      courseId: "44444444-4444-4444-8444-444444444444",
    });
    expect(transport.mock.calls[1][4]?.history).toEqual([]);
    expect(transport.mock.calls[2][4]?.history).toEqual([]);
  });

  it("keeps memory when only page presentation changes", async () => {
    const { transport, send } = fixture();
    await send("Tài liệu đầu");
    await send("Trang khác", {
      ...context,
      pageId: "tasks",
      pageName: "Việc cần làm",
    });
    expect(transport.mock.calls[1][4]?.history).toHaveLength(1);
  });

  it("syncContext invalidates the previous scope immediately before another send", async () => {
    const pending = deferred<Reply>();
    const { result, transport } = fixture();
    transport.mockReturnValueOnce(pending.promise);
    let request!: Promise<void>;
    act(() => {
      request = result.current.send(context, { message: "Câu cũ" });
    });
    const signal = transport.mock.calls[0][4]?.signal;
    act(() =>
      result.current.syncContext({
        ...context,
        documentId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    expect(signal?.aborted).toBe(true);
    expect(result.current.status).toBe("idle");
    await act(async () => {
      pending.resolve(reply(1));
      await request;
    });
    expect(
      result.current.messages.some(
        (message) => message.text === "Câu trả lời hiển thị 1",
      ),
    ).toBe(false);
  });

  it("new conversation removes previous receipts", async () => {
    const { result, transport, send } = fixture();
    await send("Trước khi làm mới");
    act(() => result.current.resetConversation());
    await send("Sau khi làm mới");
    expect(transport.mock.calls[1][4]?.history).toEqual([]);
  });

  it("changing mode clears memory even after returning to the original mode", async () => {
    const { result, transport, send } = fixture();
    await send("Câu theo tài liệu");
    act(() => result.current.setMode("general"));
    await send("Câu tổng quát");
    act(() => result.current.setMode("documents"));
    await send("Quay lại tài liệu");
    expect(transport.mock.calls[1][4]?.history).toEqual([]);
    expect(transport.mock.calls[2][4]?.history).toEqual([]);
  });
});

describe("one-turn operation requests", () => {
  it("workspace questions omit history and do not reuse a previous mode's receipts", async () => {
    const { result, transport, send } = fixture();
    await send("Câu theo tài liệu");
    act(() => result.current.setMode("workspace"));
    await send("Lịch học của tôi");
    await send("Còn tuần sau?");
    expect(transport.mock.calls[1][4]).not.toHaveProperty("history");
    expect(transport.mock.calls[2][4]).not.toHaveProperty("history");
  });

  it.each(["summarize", "course_info"] as const)(
    "%s omits history entirely while its returned receipt can ground the next question",
    async (operation) => {
      const { transport, send } = fixture();
      await send("Câu có sẵn trong hội thoại");
      await send("Thực hiện thao tác", context, operation);
      const options = transport.mock.calls[1][4];
      expect(options).toBeDefined();
      expect(options).not.toHaveProperty("history");
      await send("Giải thích thêm kết quả đó");
      expect(transport.mock.calls[2][4]?.history?.at(-1)).toMatchObject({
        receiptId: receiptId(2),
        snapshot: { request: { operation } },
      });
    },
  );
});

describe("reset during an outstanding answer", () => {
  it.each(["success", "failure"] as const)(
    "a stale %s cannot change a fresh request, append an answer, or release its send lock",
    async (outcome) => {
      const first = deferred<Reply>();
      const second = deferred<Reply>();
      const { result, transport } = fixture();
      transport
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      let oldRequest!: Promise<void>;
      act(() => {
        oldRequest = result.current.send(context, { message: "Câu cũ" });
      });
      const oldSignal = transport.mock.calls[0][4]?.signal;
      act(() => result.current.resetConversation());
      expect(oldSignal?.aborted).toBe(true);
      let freshRequest!: Promise<void>;
      act(() => {
        freshRequest = result.current.send(context, { message: "Câu mới" });
      });
      expect(transport).toHaveBeenCalledTimes(2);
      await act(async () => {
        if (outcome === "success") first.resolve(reply(1));
        else first.reject(new Error("Lỗi của hội thoại cũ"));
        await oldRequest;
      });
      expect(result.current.status).toBe("sending");
      expect(result.current.errorMessage).toBe("");
      expect(
        result.current.messages.some(
          (message) => message.text === "Câu trả lời hiển thị 1",
        ),
      ).toBe(false);
      await act(async () => {
        await result.current.send(context, {
          message: "Không được chen ngang",
        });
      });
      expect(transport).toHaveBeenCalledTimes(2);
      await act(async () => {
        second.resolve(reply(2));
        await freshRequest;
      });
      expect(result.current.status).toBe("idle");
      expect(
        result.current.messages
          .filter((message) => message.role === "assistant")
          .map((message) => message.text),
      ).toEqual(["Câu trả lời hiển thị 2"]);
    },
  );
});
