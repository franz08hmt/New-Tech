import { describe, expect, it } from "vitest";
import { estimateTokenCost, normalizeTokenUsage } from "./ai-usage-pricing.js";

describe("AI usage token and pricing metadata", () => {
  it("uses installed Gemini usage field meanings and derives output from total", () => {
    expect(
      normalizeTokenUsage({
        promptTokenCount: 1_000_000,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 5,
        totalTokenCount: 1_000_025,
      }),
    ).toEqual({
      inputTokens: 1_000_000,
      outputTokens: 25,
      totalTokens: 1_000_025,
      status: "complete",
    });
  });

  it.each([undefined, null, {}, { candidatesTokenCount: 12 }])(
    "preserves absent usage as unknown (%s)",
    (raw) => {
      const usage = normalizeTokenUsage(raw);
      expect(usage.status).toBe(
        raw && Object.keys(raw).length ? "partial" : "missing",
      );
      expect(estimateTokenCost("gemini-2.5-flash", usage)).toMatchObject({
        status: "unknown_usage",
        estimatedCost: null,
        pricingVersion: null,
      });
    },
  );

  it("does not turn malformed or negative token counts into zero", () => {
    expect(normalizeTokenUsage({ promptTokenCount: -1 })).toMatchObject({
      status: "invalid",
      inputTokens: null,
    });
    expect(
      normalizeTokenUsage({ totalTokenCount: Number.POSITIVE_INFINITY }),
    ).toMatchObject({
      status: "invalid",
    });
    expect(
      normalizeTokenUsage({ promptTokenCount: 30, totalTokenCount: 20 }),
    ).toMatchObject({
      status: "invalid",
    });
  });

  it("rejects cumulative totals smaller than reported response components", () => {
    const inconsistent = normalizeTokenUsage({
      promptTokenCount: 10,
      candidatesTokenCount: 100,
      totalTokenCount: 20,
    });

    expect(inconsistent).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      status: "invalid",
    });
    expect(estimateTokenCost("gemini-2.5-flash", inconsistent)).toMatchObject({
      status: "invalid",
      estimatedCost: null,
    });
  });

  it.each([
    {
      name: "thoughts",
      usage: {
        promptTokenCount: 10,
        candidatesTokenCount: 4,
        thoughtsTokenCount: 8,
        totalTokenCount: 20,
      },
    },
    {
      name: "tool-use prompt",
      usage: {
        promptTokenCount: 10,
        toolUsePromptTokenCount: 8,
        totalTokenCount: 15,
      },
    },
    {
      name: "multiple reported components",
      usage: {
        promptTokenCount: 10,
        candidatesTokenCount: 6,
        thoughtsTokenCount: 5,
        toolUsePromptTokenCount: 2,
        totalTokenCount: 22,
      },
    },
  ])("rejects a total inconsistent with $name", ({ usage }) => {
    expect(normalizeTokenUsage(usage).status).toBe("invalid");
  });

  it("keeps valid zero distinct from missing and prices only a complete zero", () => {
    const zero = normalizeTokenUsage({
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
      toolUsePromptTokenCount: 0,
      totalTokenCount: 0,
    });
    expect(zero).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      status: "complete",
    });
    expect(estimateTokenCost("gemini-2.5-flash", zero)).toMatchObject({
      status: "estimated",
      estimatedCost: "0.000000000000",
    });
    expect(normalizeTokenUsage({}).status).toBe("missing");
  });

  it("does not assign tool-use prompt tokens to output pricing", () => {
    const withToolInput = normalizeTokenUsage({
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      thoughtsTokenCount: 2,
      toolUsePromptTokenCount: 3,
      totalTokenCount: 20,
    });
    expect(withToolInput).toMatchObject({ status: "partial" });
    expect(estimateTokenCost("gemini-2.5-flash", withToolInput)).toMatchObject({
      status: "unknown_usage",
      estimatedCost: null,
    });
  });

  it("does not assign an unreported remainder to output tokens", () => {
    expect(
      normalizeTokenUsage({ promptTokenCount: 10, totalTokenCount: 20 }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: null,
      totalTokens: 20,
      status: "partial",
    });
    expect(
      estimateTokenCost("gemini-2.5-flash", {
        ...normalizeTokenUsage({ promptTokenCount: 10, totalTokenCount: 20 }),
      }),
    ).toMatchObject({ status: "unknown_usage", estimatedCost: null });

    expect(
      normalizeTokenUsage({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 20,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: null,
      totalTokens: 20,
      status: "partial",
    });
    // An absent optional field does not prevent a complete result when the
    // provider total exactly reconciles with the reported components.
    expect(
      normalizeTokenUsage({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      status: "complete",
    });
  });

  it("rejects cached input larger than its reported prompt and component overflow", () => {
    expect(
      normalizeTokenUsage({
        promptTokenCount: 10,
        cachedContentTokenCount: 11,
        candidatesTokenCount: 1,
        totalTokenCount: 11,
      }).status,
    ).toBe("invalid");
    expect(
      normalizeTokenUsage({
        promptTokenCount: Number.MAX_SAFE_INTEGER,
        candidatesTokenCount: Number.MAX_SAFE_INTEGER,
        thoughtsTokenCount: 1,
        totalTokenCount: Number.MAX_SAFE_INTEGER,
      }).status,
    ).toBe("invalid");
  });

  it("estimates only for an explicitly priced model and valid complete usage", () => {
    const usage = normalizeTokenUsage({
      promptTokenCount: 1_000_000,
      totalTokenCount: 1_000_000,
    });
    expect(estimateTokenCost("gemini-2.5-flash", usage)).toEqual({
      status: "estimated",
      estimatedCost: "0.300000000000",
      pricingVersion: "google-gemini-standard-paid-2026-10-19",
      currency: "USD",
    });
    expect(estimateTokenCost("gemini-embedding-001", usage)).toMatchObject({
      status: "unknown_price",
      estimatedCost: null,
      currency: null,
    });

    const outputOnly = normalizeTokenUsage({
      promptTokenCount: 0,
      candidatesTokenCount: 1_000_000,
      totalTokenCount: 1_000_000,
    });
    expect(estimateTokenCost("gemini-2.5-flash", outputOnly)).toMatchObject({
      estimatedCost: "2.500000000000",
      pricingVersion: "google-gemini-standard-paid-2026-10-19",
    });
  });

  it("does not estimate malformed or partial usage and bounds maximum valid cost", () => {
    const partial = normalizeTokenUsage({ promptTokenCount: 20 });
    expect(estimateTokenCost("gemini-2.5-flash", partial).status).toBe(
      "unknown_usage",
    );
    const enormous = {
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: Number.MAX_SAFE_INTEGER,
      totalTokens: Number.MAX_SAFE_INTEGER,
      status: "complete" as const,
    };
    const maxValid = estimateTokenCost("gemini-2.5-flash", enormous);
    expect(maxValid.status).toBe("estimated");
    expect(BigInt(maxValid.estimatedCost!.split(".")[0])).toBeLessThan(
      1_000_000_000_000n,
    );
    expect(
      normalizeTokenUsage({ promptTokenCount: Number.MAX_SAFE_INTEGER + 1 })
        .status,
    ).toBe("invalid");
  });

  it("does not use the uncached rate when provider metadata reports cached input", () => {
    const usage = normalizeTokenUsage({
      promptTokenCount: 100,
      candidatesTokenCount: 20,
      totalTokenCount: 120,
      cachedContentTokenCount: 60,
    });
    expect(usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      status: "partial",
    });
    expect(estimateTokenCost("gemini-2.5-flash", usage)).toMatchObject({
      status: "unknown_usage",
      estimatedCost: null,
      pricingVersion: null,
    });
  });

  it("marks an invalid cached-token count as invalid usage", () => {
    expect(
      normalizeTokenUsage({
        promptTokenCount: 100,
        totalTokenCount: 120,
        cachedContentTokenCount: -1,
      }).status,
    ).toBe("invalid");
  });
});
