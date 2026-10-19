import "reflect-metadata";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { GenerateContentParameters } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiService } from "./gemini.service.js";

const { generateContent, generateContentStream } = vi.hoisted(() => ({
  generateContent:
    vi.fn<
      (
        input: GenerateContentParameters,
      ) => Promise<{ text?: string; modelVersion?: string }>
    >(),
  generateContentStream: vi.fn<
    (input: GenerateContentParameters) => Promise<
      AsyncIterable<{
        text?: string;
        modelVersion?: string;
        usageMetadata?: unknown;
      }>
    >
  >(),
}));
vi.mock("@google/genai", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@google/genai")>();
  return {
    ...sdk,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent, generateContentStream } };
    }),
  };
});

const secret = "unit-test-credential-not-a-real-key";
const input = {
  systemInstruction: "Private system instruction",
  userParts: ["Private user message"],
};

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", secret);
  vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
  vi.stubEnv("GEMINI_TIMEOUT_MS", "30000");
  vi.stubEnv("GEMINI_MAX_OUTPUT_TOKENS", "1024");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(GoogleGenAI).mockClear();
  generateContent
    .mockReset()
    .mockResolvedValue({ text: "  A useful answer.  " });
  generateContentStream.mockReset().mockImplementation(async () => ({
    async *[Symbol.asyncIterator]() {
      yield { text: "A useful answer that is long enough to show " };
      yield { text: "the provider is streaming its generated text." };
    },
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GeminiService", () => {
  it("maps verified conversation to alternating SDK roles before the current user", async () => {
    await new GeminiService().generate({
      ...input,
      conversation: [
        { role: "user", text: "Câu trước" },
        { role: "model", text: "Đáp trước (nguồn ở lượt trước)" },
      ],
    });
    expect(generateContent.mock.calls[0][0].contents).toEqual([
      { role: "user", parts: [{ text: "Câu trước" }] },
      { role: "model", parts: [{ text: "Đáp trước (nguồn ở lượt trước)" }] },
      { role: "user", parts: [{ text: "Private user message" }] },
    ]);
  });
  it("reads text, sends a single user turn, and limits generation without tools or retries", async () => {
    const service = new GeminiService();
    await expect(service.generate(input)).resolves.toBe("A useful answer.");
    expect(generateContent).toHaveBeenCalledExactlyOnceWith({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Private user message" }] }],
      config: {
        systemInstruction: "Private system instruction",
        maxOutputTokens: 1024,
        candidateCount: 1,
        responseModalities: ["TEXT"],
        abortSignal: expect.any(AbortSignal),
        httpOptions: { retryOptions: { attempts: 1 } },
      },
    });
    expect(GoogleGenAI).toHaveBeenCalledExactlyOnceWith({
      apiKey: secret,
      vertexai: false,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logs).not.toContain("Private");
    expect(logs).not.toContain(secret);
  });

  it("records the model version reported by a successful generation", async () => {
    const token = { provider: "synthetic-call" };
    const usage = {
      startProviderCall: vi.fn(() => token),
      updateProviderModel: vi.fn(),
      finishProviderCall: vi.fn(),
    };
    generateContent.mockResolvedValueOnce({
      text: "A useful answer.",
      modelVersion: "gemini-2.5-flash-001",
    });

    await expect(
      new GeminiService(usage as never).generate({
        ...input,
        prompt: { id: "assistant.general", version: "general-v1" },
      }),
    ).resolves.toBe("A useful answer.");

    expect(usage.updateProviderModel).toHaveBeenCalledExactlyOnceWith(
      token,
      "gemini-2.5-flash-001",
    );
  });

  it("yields provider text incrementally using Gemini's streaming API", async () => {
    const service = new GeminiService();
    const parts: string[] = [];
    for await (const part of service.generateStream(input)) parts.push(part);
    expect(parts.join("")).toBe(
      "A useful answer that is long enough to show the provider is streaming its generated text.",
    );
    expect(parts.length).toBeGreaterThan(1);
    expect(generateContentStream).toHaveBeenCalledExactlyOnceWith({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: "Private user message" }] }],
      config: {
        systemInstruction: "Private system instruction",
        maxOutputTokens: 1024,
        candidateCount: 1,
        responseModalities: ["TEXT"],
        abortSignal: expect.any(AbortSignal),
        httpOptions: { retryOptions: { attempts: 1 } },
      },
    });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("stores the latest cumulative stream usage snapshot once, without summing chunks", async () => {
    const token = {
      call: { usage: { status: "missing" } as { status: string } },
    };
    const finishProviderCall = vi.fn(
      (_call: unknown, _outcome: string, _raw?: unknown) => {},
    );
    const usage = {
      startProviderCall: vi.fn(() => token),
      updateProviderModel: vi.fn(),
      updateProviderUsage: vi.fn(
        (providerToken: typeof token, raw: unknown) => {
          const value = raw as {
            promptTokenCount?: number;
            totalTokenCount?: number;
          };
          providerToken.call.usage = {
            status:
              typeof value.promptTokenCount === "number" &&
              typeof value.totalTokenCount === "number"
                ? "complete"
                : "partial",
          };
        },
      ),
      finishProviderCall,
    };
    generateContentStream.mockResolvedValueOnce({
      async *[Symbol.asyncIterator]() {
        yield {
          text: "A first cumulative stream segment.",
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 14 },
        };
        yield {
          text: " A second cumulative stream segment.",
          modelVersion: "gemini-2.5-flash-001",
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 20 },
        };
      },
    });
    const parts: string[] = [];
    for await (const part of new GeminiService(usage as never).generateStream(
      input,
    ))
      parts.push(part);
    expect(parts.join()).toContain("first cumulative");
    expect(usage.updateProviderUsage).toHaveBeenCalledTimes(2);
    expect(usage.updateProviderModel).toHaveBeenCalledExactlyOnceWith(
      token,
      "gemini-2.5-flash-001",
    );
    expect(finishProviderCall).toHaveBeenCalledOnce();
    expect(finishProviderCall).toHaveBeenCalledWith(token, "success", {
      promptTokenCount: 10,
      totalTokenCount: 20,
    });
  });

  it("does not mark a normally closed stream successful when final usage is missing", async () => {
    const token = { call: { usage: { status: "missing" } } };
    const finishProviderCall = vi.fn();
    const usage = {
      startProviderCall: vi.fn(() => token),
      updateProviderUsage: vi.fn(),
      finishProviderCall,
    };
    generateContentStream.mockResolvedValueOnce({
      async *[Symbol.asyncIterator]() {
        yield {
          text: "The first cumulative stream event has valid usage metadata.",
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 16 },
        };
        yield { text: " The final stream event has no usage metadata." };
      },
    });
    const parts: string[] = [];
    for await (const part of new GeminiService(usage as never).generateStream(
      input,
    ))
      parts.push(part);
    expect(parts.join()).toContain("final stream event");
    expect(finishProviderCall).toHaveBeenCalledWith(token, "unknown", {
      promptTokenCount: 10,
      totalTokenCount: 16,
    });
  });

  it("records a provider stream read failure as error rather than cancellation", async () => {
    const token = { call: { usage: { status: "missing" } } };
    const finishProviderCall = vi.fn();
    const usage = {
      startProviderCall: vi.fn(() => token),
      updateProviderUsage: vi.fn(),
      finishProviderCall,
    };
    const failure = new Error("synthetic stream failure");
    generateContentStream.mockResolvedValueOnce({
      async *[Symbol.asyncIterator]() {
        yield {
          text: "partial answer",
          usageMetadata: { promptTokenCount: 12, totalTokenCount: 18 },
        };
        throw failure;
      },
    });

    const received: string[] = [];
    await expect(async () => {
      for await (const part of new GeminiService(usage as never).generateStream(
        input,
      ))
        received.push(part);
    }).rejects.toMatchObject({ kind: "upstream" });
    expect(received.join()).toContain("partial answer");
    expect(finishProviderCall).toHaveBeenCalledOnce();
    expect(finishProviderCall).toHaveBeenCalledWith(token, "error", {
      promptTokenCount: 12,
      totalTokenCount: 18,
    });
  });

  it("forwards ordinary first-token text without waiting for another provider chunk", async () => {
    let nextCalls = 0;
    generateContentStream.mockResolvedValueOnce({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            nextCalls++;
            return nextCalls === 1
              ? { done: false as const, value: { text: "Xin chào" } }
              : { done: true as const, value: undefined };
          },
        };
      },
    });

    const iterator = new GeminiService().generateStream(input);
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: "Xin chào",
    });
    expect(nextCalls).toBe(1);
    await iterator.return(undefined);
  });

  it("never emits a credential split across provider chunks", async () => {
    generateContentStream.mockResolvedValueOnce({
      async *[Symbol.asyncIterator]() {
        yield {
          text: `safe text that is definitely more than ${secret.length} characters long `,
        };
        yield { text: secret.slice(0, 12) };
        yield { text: secret.slice(12) };
      },
    });
    const service = new GeminiService();
    const emitted: string[] = [];
    await expect(async () => {
      for await (const part of service.generateStream(input))
        emitted.push(part);
    }).rejects.toMatchObject({ kind: "upstream" });
    expect(emitted.join("")).not.toContain(secret);
  });

  it("aborts the provider transport and closes its iterator on early return", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    let closed = false;
    generateContentStream.mockImplementationOnce(async ({ config }) => {
      providerSignal = config?.abortSignal;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return {
                done: false as const,
                value: { text: "First answer chunk" },
              };
            },
            async return() {
              closed = true;
              return { done: true as const, value: undefined };
            },
          };
        },
      };
    });
    const iterator = new GeminiService().generateStream(input);
    await expect(iterator.next()).resolves.toMatchObject({
      value: "First answer chunk",
    });

    await iterator.return(undefined);

    expect(providerSignal?.aborted).toBe(true);
    expect(closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["synchronous", "asynchronous"])(
    "handles %s iterator cleanup failure after cancellation",
    async (failureType) => {
      let providerSignal: AbortSignal | undefined;
      generateContentStream.mockImplementationOnce(async ({ config }) => {
        providerSignal = config?.abortSignal;
        return {
          [Symbol.asyncIterator]() {
            return {
              async next() {
                return {
                  done: false as const,
                  value: { text: "First answer chunk" },
                };
              },
              return() {
                const failure = new Error("Synthetic cleanup failure");
                if (failureType === "synchronous") throw failure;
                return Promise.reject(failure);
              },
            };
          },
        };
      });
      const iterator = new GeminiService().generateStream(input);
      await iterator.next();

      await expect(iterator.return(undefined)).resolves.toMatchObject({
        done: true,
      });
      expect(providerSignal?.aborted).toBe(true);
    },
  );

  it("preserves its deadline when upstream reads and cleanup never settle", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    const close = vi.fn(
      () => new Promise<IteratorResult<{ text?: string }>>(() => {}),
    );
    generateContentStream.mockImplementationOnce(async ({ config }) => {
      providerSignal = config?.abortSignal;
      return {
        [Symbol.asyncIterator]() {
          return {
            next: () =>
              new Promise<IteratorResult<{ text?: string }>>(() => {}),
            return: close,
          };
        },
      };
    });
    const iterator = new GeminiService().generateStream(input);
    const pending = expect(iterator.next()).rejects.toMatchObject({
      kind: "timeout",
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await pending;

    expect(providerSignal?.aborted).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates client cancellation to the Gemini stream and stops yielding", async () => {
    let providerSignal: AbortSignal | undefined;
    generateContentStream.mockImplementationOnce(async ({ config }) => {
      providerSignal = config?.abortSignal;
      return {
        async *[Symbol.asyncIterator]() {
          yield {
            text: "This first streamed answer is longer than the credential key itself ",
          };
          yield { text: "this should not be sent" };
        },
      };
    });
    const cancellation = new AbortController();
    const iterator = new GeminiService().generateStream(
      input,
      cancellation.signal,
    );
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value).toContain("This first streamed answer");
    cancellation.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" });
    expect(providerSignal?.aborted).toBe(true);
  });

  it("status never initializes the SDK or returns credentials", () => {
    expect(new GeminiService().status()).toEqual({
      status: "ready",
      provider: "google",
      modes: ["general", "documents"],
      model: "gemini-2.5-flash",
      ragEnabled: true,
      credentialsExposedToClient: false,
    });
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   ", " REPLACE_GEMINI_API_KEY "])(
    "missing or placeholder key fails safely",
    async (key) => {
      vi.stubEnv("GEMINI_API_KEY", key);
      const service = new GeminiService();
      expect(service.status()).toEqual({
        status: "not_configured",
        provider: "google",
        modes: ["general", "documents"],
        ragEnabled: true,
        credentialsExposedToClient: false,
      });
      await expect(service.generate(input)).rejects.toMatchObject({
        kind: "not_configured",
      });
      expect(GoogleGenAI).not.toHaveBeenCalled();
      expect(generateContent).not.toHaveBeenCalled();
    },
  );

  it("passes the grounded-answer JSON schema to Gemini", async () => {
    const schema = {
      type: "object",
      required: ["answer"],
      properties: { answer: { type: "string" } },
    };
    await new GeminiService().generate({
      ...input,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    });
    expect(generateContent.mock.calls[0][0].config).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: schema,
    });
  });

  it("aborts the in-flight provider request and clears its timer at the deadline", async () => {
    vi.useFakeTimers();
    let aborted = false;
    generateContent.mockImplementation(
      ({ config }) =>
        new Promise((_resolve, reject) => {
          config?.abortSignal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error(`transport error ${secret}`));
            },
            { once: true },
          );
        }),
    );
    const pending = expect(
      new GeminiService().generate(input),
    ).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    expect(aborted).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      secret,
    );
  });

  it("clears timeout after successful completion", async () => {
    vi.useFakeTimers();
    await new GeminiService().generate(input);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [429, "quota"],
    [408, "timeout"],
    [504, "timeout"],
    [400, "unavailable"],
    [503, "unavailable"],
    [500, "upstream"],
  ] as const)(
    "normalizes provider status %i without exposing details",
    async (status, kind) => {
      generateContent.mockRejectedValue(
        new ApiError({
          status,
          message: `${secret} Private user message raw headers/body`,
        }),
      );
      const failure = new GeminiService().generate(input);
      await expect(failure).rejects.toMatchObject({
        kind,
        message: "AI assistant request failed.",
      });
      await expect(failure).rejects.not.toHaveProperty("cause");
      expect(generateContent).toHaveBeenCalledTimes(1);
      const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
      expect(logs).not.toContain(secret);
      expect(logs).not.toContain("Private");
      expect(logs).not.toContain("raw headers/body");
    },
  );

  it.each([undefined, "", "   ", secret])(
    "rejects empty or credential-bearing output",
    async (text) => {
      generateContent.mockResolvedValue({ text });
      await expect(new GeminiService().generate(input)).rejects.toMatchObject({
        kind: "upstream",
      });
    },
  );

  it("sanitizes unexpected SDK errors", async () => {
    generateContent.mockRejectedValue(new Error(secret));
    await expect(new GeminiService().generate(input)).rejects.toMatchObject({
      kind: "upstream",
      message: "AI assistant request failed.",
    });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      secret,
    );
  });
});
