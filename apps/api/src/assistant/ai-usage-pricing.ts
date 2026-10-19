export interface TokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly status: "complete" | "partial" | "missing" | "invalid";
}

export interface CostEstimate {
  readonly status: "estimated" | "unknown_price" | "unknown_usage" | "invalid";
  readonly estimatedCost: string | null;
  readonly pricingVersion: string | null;
  readonly currency: "USD" | null;
}

const STANDARD_PAID_PRICING = {
  // Official Gemini Developer API Standard paid-tier rates, per million tokens.
  // Pricing page checked 2026-10-19; estimate only, not billing data.
  // https://ai.google.dev/gemini-api/docs/pricing
  "gemini-2.5-flash": {
    inputUsdPerMillion: 0.3,
    outputUsdPerMillion: 2.5,
    version: "google-gemini-standard-paid-2026-10-19",
  },
} as const;

function safeTokenCount(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : "invalid";
}

/** Read only SDK fields documented by the installed @google/genai response type. */
export function normalizeTokenUsage(raw: unknown): TokenUsage {
  if (!raw || typeof raw !== "object")
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      status: "missing",
    };
  const metadata = raw as Record<string, unknown>;
  const input = safeTokenCount(metadata.promptTokenCount);
  const candidates = safeTokenCount(metadata.candidatesTokenCount);
  const total = safeTokenCount(metadata.totalTokenCount);
  const thoughts = safeTokenCount(metadata.thoughtsTokenCount);
  const tool = safeTokenCount(metadata.toolUsePromptTokenCount);
  const cached = safeTokenCount(metadata.cachedContentTokenCount);
  if (
    input === "invalid" ||
    candidates === "invalid" ||
    total === "invalid" ||
    thoughts === "invalid" ||
    tool === "invalid" ||
    cached === "invalid"
  )
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      status: "invalid",
    };
  if (
    input === null &&
    candidates === null &&
    total === null &&
    thoughts === null &&
    tool === null &&
    cached === null
  )
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      status: "missing",
    };

  if (input !== null && total !== null) {
    if (total < input)
      return {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        status: "invalid",
      };
    return {
      inputTokens: input,
      outputTokens: total - input,
      totalTokens: total,
      // Cached input has a different rate and may add storage charges. This
      // schema does not retain its full billing breakdown, so do not estimate.
      status: cached !== null && cached > 0 ? "partial" : "complete",
    };
  }
  return {
    inputTokens: typeof input === "number" ? input : null,
    outputTokens: typeof candidates === "number" ? candidates : null,
    totalTokens: typeof total === "number" ? total : null,
    status: "partial",
  };
}

export function estimateTokenCost(
  model: string,
  usage: TokenUsage,
): CostEstimate {
  if (usage.status === "invalid")
    return {
      status: "invalid",
      estimatedCost: null,
      pricingVersion: null,
      currency: null,
    };
  if (
    usage.status !== "complete" ||
    usage.inputTokens === null ||
    usage.outputTokens === null
  )
    return {
      status: "unknown_usage",
      estimatedCost: null,
      pricingVersion: null,
      currency: null,
    };
  const pricing =
    STANDARD_PAID_PRICING[model as keyof typeof STANDARD_PAID_PRICING];
  if (!pricing)
    return {
      status: "unknown_price",
      estimatedCost: null,
      pricingVersion: null,
      currency: null,
    };
  const inputRateTenths = BigInt(pricing.inputUsdPerMillion * 10);
  const outputRateTenths = BigInt(pricing.outputUsdPerMillion * 10);
  const scaled =
    (BigInt(usage.inputTokens) * inputRateTenths +
      BigInt(usage.outputTokens) * outputRateTenths) *
    100_000n;
  const whole = scaled / 1_000_000_000_000n;
  if (whole > 999_999_999_999n)
    return {
      status: "invalid",
      estimatedCost: null,
      pricingVersion: null,
      currency: null,
    };
  const fraction = (scaled % 1_000_000_000_000n).toString().padStart(12, "0");
  const estimatedCost = `${whole}.${fraction}`;
  return {
    status: "estimated",
    estimatedCost,
    pricingVersion: pricing.version,
    currency: "USD",
  };
}
