import { describe, expect, it } from "vitest";
import { estimateTokenCost, normalizeTokenUsage } from "./ai-usage-pricing.js";

describe("AI usage token and pricing metadata", () => {
  it("uses installed Gemini usage field meanings and derives output from total", () => {
    expect(
      normalizeTokenUsage({
        promptTokenCount: 1_000_000,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 5,
        totalTokenCount: 1_000_030,
      }),
    ).toEqual({
      inputTokens: 1_000_000,
      outputTokens: 30,
      totalTokens: 1_000_030,
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
