import "reflect-metadata";
import { ApiError, GoogleGenAI } from "@google/genai";
import type { GenerateContentParameters } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiService } from "./gemini.service.js";

const { generateContent } = vi.hoisted(() => ({
  generateContent:
    vi.fn<(input: GenerateContentParameters) => Promise<{ text?: string }>>(),
}));
vi.mock("@google/genai", async (importOriginal) => {
  const sdk = await importOriginal<typeof import("@google/genai")>();
  return {
    ...sdk,
    GoogleGenAI: vi.fn(function () {
      return { models: { generateContent } };
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
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GeminiService", () => {
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

  it("status never initializes the SDK or returns credentials", () => {
    expect(new GeminiService().status()).toEqual({
      status: "ready",
      provider: "google",
      mode: "llm",
      model: "gemini-2.5-flash",
      ragEnabled: false,
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
        mode: "llm",
        ragEnabled: false,
        credentialsExposedToClient: false,
      });
      await expect(service.generate(input)).rejects.toMatchObject({
        kind: "not_configured",
      });
      expect(GoogleGenAI).not.toHaveBeenCalled();
      expect(generateContent).not.toHaveBeenCalled();
    },
  );

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
