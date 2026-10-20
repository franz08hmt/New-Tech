import "reflect-metadata";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { EmbedContentParameters } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAdmissionError } from "./ai-admission.service.js";
import {
  EmbeddingError,
  GeminiEmbeddingService,
  type EmbeddingFailure,
} from "./gemini-embedding.service.js";

const { embedContent } = vi.hoisted(() => ({
  embedContent: vi.fn<
    (input: EmbedContentParameters) => Promise<{
      embeddings?: { values?: number[] }[];
    }>
  >(),
}));
vi.mock("@google/genai", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@google/genai")>();
  return {
    ...sdk,
    GoogleGenAI: vi.fn(function () {
      return { models: { embedContent } };
    }),
  };
});

const secret = "embedding-unit-test-key";
const rawVector = () => [3, 4, ...Array.from({ length: 766 }, () => 0)];

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", secret);
  vi.stubEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");
  vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", "768");
  vi.stubEnv("GEMINI_EMBEDDING_TIMEOUT_MS", "30000");
  vi.stubEnv("GEMINI_EMBEDDING_BATCH_SIZE", "16");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(GoogleGenAI).mockClear();
  embedContent.mockReset().mockImplementation(async ({ contents }) => ({
    embeddings: Array.from(
      { length: Array.isArray(contents) ? contents.length : 1 },
      () => ({ values: rawVector() }),
    ),
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GeminiEmbeddingService", () => {
  it("batches documents, applies retrieval metadata and L2 normalizes 768 dimensions", async () => {
    const texts = Array.from({ length: 17 }, (_, index) => `chunk ${index}`);
    const result = await new GeminiEmbeddingService().embedDocuments(
      "Study guide.pdf",
      texts,
    );
    expect(result).toHaveLength(17);
    expect(result[0]).toHaveLength(768);
    expect(result[0][0]).toBeCloseTo(0.6);
    expect(result[0][1]).toBeCloseTo(0.8);
    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(embedContent.mock.calls[0][0]).toMatchObject({
      model: "gemini-embedding-001",
      config: {
        taskType: "RETRIEVAL_DOCUMENT",
        title: "Study guide.pdf",
        outputDimensionality: 768,
        abortSignal: expect.any(AbortSignal),
        httpOptions: { retryOptions: { attempts: 1 } },
      },
    });
    expect((embedContent.mock.calls[0][0].contents as unknown[]).length).toBe(
      16,
    );
    expect(GoogleGenAI).toHaveBeenCalledExactlyOnceWith({
      apiKey: secret,
      vertexai: false,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    const logs = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(logs).not.toContain("chunk 0");
    expect(logs).not.toContain(secret);
  });

  it("records each provider batch without retaining embedded text or assuming token usage", async () => {
    const descriptors: unknown[] = [];
    const finished: unknown[][] = [];
    const usage = {
      startProviderCall: vi.fn((descriptor: unknown) => {
        descriptors.push(descriptor);
        return Symbol("provider call");
      }),
      authorizeProviderCall: vi.fn().mockResolvedValue(undefined),
      finishProviderCall: vi.fn((...args: unknown[]) => {
        finished.push(args);
      }),
    };
    await new GeminiEmbeddingService(usage as never).embedDocuments(
      "Synthetic title.pdf",
      Array.from(
        { length: 17 },
        (_, index) => `private synthetic chunk ${index}`,
      ),
    );
    expect(descriptors).toEqual([
      {
        type: "embedding_document_batch",
        provider: "google",
        model: "gemini-embedding-001",
      },
      {
        type: "embedding_document_batch",
        provider: "google",
        model: "gemini-embedding-001",
      },
    ]);
    expect(finished).toHaveLength(2);
    expect(finished.map((args) => args.slice(1))).toEqual([
      ["success"],
      ["success"],
    ]);
    expect(JSON.stringify(descriptors)).not.toContain(
      "private synthetic chunk",
    );
    expect(JSON.stringify(descriptors)).not.toContain("Synthetic title");
  });

  it("does not dispatch an embedding batch when admission denies its permit", async () => {
    const token = { provider: "synthetic-call" };
    const denied = new AiAdmissionError(
      "WORKSPACE_ACCESS_DENIED",
      403,
      "Synthetic membership denial.",
    );
    const usage = {
      startProviderCall: vi.fn(() => token),
      authorizeProviderCall: vi.fn().mockRejectedValue(denied),
      finishProviderCall: vi.fn(),
    };
    await expect(
      new GeminiEmbeddingService(usage as never).embedQuery("synthetic query"),
    ).rejects.toBe(denied);
    expect(usage.authorizeProviderCall).toHaveBeenCalledOnce();
    expect(embedContent).not.toHaveBeenCalled();
    expect(usage.finishProviderCall).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      "embedding.request.failed",
    );
  });

  it("embeds one query without a document title", async () => {
    await expect(
      new GeminiEmbeddingService().embedQuery("What is required?"),
    ).resolves.toHaveLength(768);
    expect(embedContent.mock.calls[0][0].config).toMatchObject({
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: 768,
    });
    expect(embedContent.mock.calls[0][0].config).not.toHaveProperty("title");
  });

  it.each([
    { embeddings: undefined },
    { embeddings: [] },
    { embeddings: [{ values: [1, 2] }] },
    { embeddings: [{ values: Array.from({ length: 768 }, () => 0) }] },
    {
      embeddings: [
        { values: [Number.NaN, ...Array.from({ length: 767 }, () => 1)] },
      ],
    },
  ])("rejects malformed provider vectors", async (response) => {
    embedContent.mockResolvedValue(response);
    await expect(
      new GeminiEmbeddingService().embedQuery("question"),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("rejects a provider count that differs from the document batch", async () => {
    embedContent.mockResolvedValue({ embeddings: [{ values: rawVector() }] });
    await expect(
      new GeminiEmbeddingService().embedDocuments("a.pdf", ["one", "two"]),
    ).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("aborts a timed-out batch, does not retry and clears the timer", async () => {
    vi.useFakeTimers();
    let aborted = false;
    embedContent.mockImplementation(
      ({ config }) =>
        new Promise((_resolve, reject) => {
          config?.abortSignal?.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error(secret));
            },
            { once: true },
          );
        }),
    );
    const pending = expect(
      new GeminiEmbeddingService().embedQuery("question"),
    ).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    expect(aborted).toBe(true);
    expect(embedContent).toHaveBeenCalledTimes(1);
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
  ] as const)("normalizes provider status %i", async (status, kind) => {
    embedContent.mockRejectedValue(
      new ApiError({ status, message: `${secret} private provider body` }),
    );
    await expect(
      new GeminiEmbeddingService().embedQuery("question"),
    ).rejects.toMatchObject({
      kind: kind satisfies EmbeddingFailure,
      message: "Embedding request failed.",
    });
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(
      secret,
    );
  });

  it("fails before SDK initialization when credentials are absent", async () => {
    vi.stubEnv("GEMINI_API_KEY", undefined);
    await expect(
      new GeminiEmbeddingService().embedQuery("question"),
    ).rejects.toMatchObject({ kind: "not_configured" });
    expect(GoogleGenAI).not.toHaveBeenCalled();
  });
});
