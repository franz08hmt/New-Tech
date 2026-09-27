import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appConfig,
  geminiConfig,
  geminiEmbeddingConfig,
  ragConfig,
} from "./config.js";

beforeEach(() => {
  for (const name of [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_TIMEOUT_MS",
    "GEMINI_MAX_OUTPUT_TOKENS",
    "GEMINI_EMBEDDING_MODEL",
    "GEMINI_EMBEDDING_DIMENSIONS",
    "GEMINI_EMBEDDING_TIMEOUT_MS",
    "GEMINI_EMBEDDING_BATCH_SIZE",
    "RAG_TOP_K",
    "RAG_CANDIDATE_LIMIT",
    "RAG_MIN_SCORE",
    "RAG_PROMPT_VERSION",
  ])
    vi.stubEnv(name, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("Gemini configuration", () => {
  it("defaults to an unconfigured assistant without preventing application configuration", () => {
    vi.stubEnv("DATABASE_URL", "postgres://fixture:fixture@localhost/test");
    vi.stubEnv("DATABASE_SSL", "false");
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_fixture");
    vi.stubEnv("SUPABASE_STORAGE_BUCKET", "test-bucket");
    expect(appConfig().gemini).toEqual({
      configured: false,
      apiKey: undefined,
      model: "gemini-2.5-flash",
      timeoutMs: 30000,
      maxOutputTokens: 1024,
    });
    expect(appConfig().embedding).toEqual({
      configured: false,
      apiKey: undefined,
      model: "gemini-embedding-001",
      dimensions: 768,
      timeoutMs: 30000,
      batchSize: 16,
    });
    expect(appConfig().rag).toEqual({
      topK: 6,
      candidateLimit: 10,
      minScore: 0.55,
      promptVersion: "rag-v1",
    });
  });
  it("trims configured values", () => {
    vi.stubEnv("GEMINI_API_KEY", "  test-credential  ");
    vi.stubEnv("GEMINI_MODEL", " gemini-test-model ");
    vi.stubEnv("GEMINI_TIMEOUT_MS", " 5000 ");
    vi.stubEnv("GEMINI_MAX_OUTPUT_TOKENS", " 512 ");
    expect(geminiConfig()).toEqual({
      configured: true,
      apiKey: "test-credential",
      model: "gemini-test-model",
      timeoutMs: 5000,
      maxOutputTokens: 512,
    });
  });
  it.each(["REPLACE_GEMINI_API_KEY", "prefix_REPLACE_secret", "", "   "])(
    "ignores placeholder/empty keys",
    (key) => {
      vi.stubEnv("GEMINI_API_KEY", key);
      expect(geminiConfig()).toMatchObject({
        configured: false,
        apiKey: undefined,
      });
    },
  );
  it.each(["GEMINI_TIMEOUT_MS", "GEMINI_MAX_OUTPUT_TOKENS"])(
    "bounds integer %s",
    (name) => {
      const max = name === "GEMINI_TIMEOUT_MS" ? 60000 : 8192;
      for (const value of [
        "0",
        "-1",
        "1.5",
        "NaN",
        "Infinity",
        "",
        " ",
        String(max + 1),
        "secret-invalid-value",
      ]) {
        vi.stubEnv(name, value);
        expect(() => geminiConfig()).toThrow(
          `Invalid configuration: ${name} must be 1..${max}`,
        );
      }
      vi.stubEnv(name, String(max));
      expect(() => geminiConfig()).not.toThrow();
    },
  );
  it("uses the model default for blank input and rejects unsafe identifiers", () => {
    vi.stubEnv("GEMINI_MODEL", " ");
    expect(geminiConfig().model).toBe("gemini-2.5-flash");
    vi.stubEnv("GEMINI_MODEL", "https://private.example/secret");
    expect(() => geminiConfig()).toThrow("Invalid configuration: GEMINI_MODEL");
  });
});

describe("RAG foundation configuration", () => {
  it("trims the embedding model and shares the backend-only Gemini key", () => {
    vi.stubEnv("GEMINI_API_KEY", "  embedding-test-credential  ");
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", " gemini-embedding-test ");
    vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", " 768 ");
    vi.stubEnv("GEMINI_EMBEDDING_TIMEOUT_MS", " 5000 ");
    vi.stubEnv("GEMINI_EMBEDDING_BATCH_SIZE", " 8 ");
    expect(geminiEmbeddingConfig()).toEqual({
      configured: true,
      apiKey: "embedding-test-credential",
      model: "gemini-embedding-test",
      dimensions: 768,
      timeoutMs: 5000,
      batchSize: 8,
    });
  });

  it.each([
    ["GEMINI_EMBEDDING_TIMEOUT_MS", 60000],
    ["GEMINI_EMBEDDING_BATCH_SIZE", 100],
  ] as const)("bounds embedding integer %s", (name, max) => {
    for (const value of ["0", "1.5", "NaN", "", String(max + 1)]) {
      vi.stubEnv(name, value);
      expect(() => geminiEmbeddingConfig()).toThrow(name);
    }
    vi.stubEnv(name, String(max));
    expect(() => geminiEmbeddingConfig()).not.toThrow();
  });

  it("rejects embedding identifiers and dimensions that cannot match VECTOR(768)", () => {
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", "https://private.example/embedding");
    expect(() => geminiEmbeddingConfig()).toThrow(
      "Invalid configuration: GEMINI_EMBEDDING_MODEL",
    );
    vi.stubEnv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001");
    for (const dimensions of ["0", "767", "1536", "NaN", "", "secret"]) {
      vi.stubEnv("GEMINI_EMBEDDING_DIMENSIONS", dimensions);
      expect(() => geminiEmbeddingConfig()).toThrow(
        /GEMINI_EMBEDDING_DIMENSIONS/,
      );
    }
  });

  it("parses bounded retrieval defaults and configured values", () => {
    vi.stubEnv("RAG_TOP_K", " 4 ");
    vi.stubEnv("RAG_CANDIDATE_LIMIT", " 8 ");
    vi.stubEnv("RAG_MIN_SCORE", " 0.7 ");
    vi.stubEnv("RAG_PROMPT_VERSION", " rag-v2 ");
    expect(ragConfig()).toEqual({
      topK: 4,
      candidateLimit: 8,
      minScore: 0.7,
      promptVersion: "rag-v2",
    });
  });

  it("rejects unsafe retrieval bounds and prompt versions", () => {
    vi.stubEnv("RAG_TOP_K", "6");
    vi.stubEnv("RAG_CANDIDATE_LIMIT", "5");
    expect(() => ragConfig()).toThrow(/greater than or equal/);

    vi.stubEnv("RAG_CANDIDATE_LIMIT", "10");
    for (const score of ["-0.1", "1.1", "NaN", "", "secret"]) {
      vi.stubEnv("RAG_MIN_SCORE", score);
      expect(() => ragConfig()).toThrow(/RAG_MIN_SCORE/);
    }

    vi.stubEnv("RAG_MIN_SCORE", "0.55");
    vi.stubEnv("RAG_PROMPT_VERSION", "../private prompt");
    expect(() => ragConfig()).toThrow(/RAG_PROMPT_VERSION/);
  });
});
