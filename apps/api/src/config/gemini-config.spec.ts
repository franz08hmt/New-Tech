import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig, geminiConfig } from "./config.js";

beforeEach(() => {
  for (const name of [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_TIMEOUT_MS",
    "GEMINI_MAX_OUTPUT_TOKENS",
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
