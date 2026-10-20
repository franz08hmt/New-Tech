import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AiUsageDashboardQuery,
  AiUsageDashboardResponse,
  AiUsageCostBreakdownResponse,
  AiUsageProviderCallsResponse,
} from "./api";
import { AiUsageDashboard } from "./AiUsageDashboard";
import { ApiError, api } from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      aiUsageDashboard: vi.fn(),
      aiUsageCostBreakdown: vi.fn(),
      aiUsageProviderCalls: vi.fn(),
    },
  };
});

const manager = {
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  role: "manager" as const,
};
const otherManager = {
  userId: "33333333-3333-4333-8333-333333333333",
  workspaceId: "44444444-4444-4444-8444-444444444444",
  role: "manager" as const,
};

function dashboardResponse(
  overrides: Partial<AiUsageDashboardResponse> = {},
): AiUsageDashboardResponse {
  const query = overrides;
  return {
    from: "2026-10-15",
    to: "2026-10-21",
    timezone: "Asia/Ho_Chi_Minh",
    modelCohort: "all",
    page: 1,
    pageSize: 20,
    totalPages: 1,
    summary: {
      operations: {
        total: "1",
        outcomes: {
          success: "1",
          error: "0",
          timeout: "0",
          cancelled: "0",
          rejected: "0",
          unknown: "0",
        },
        latency: { sampleCount: "1", averageMs: "12", p95Ms: "12" },
      },
      providerCalls: {
        total: "1",
        outcomes: {
          success: "1",
          error: "0",
          timeout: "0",
          cancelled: "0",
          unknown: "0",
        },
        usage: { complete: "1", partial: "0", missing: "0", invalid: "0" },
        tokens: {
          input: "0",
          inputSamples: "1",
          output: null,
          outputSamples: "0",
          total: null,
          totalSamples: "0",
        },
        cost: { estimatedCalls: "0", unknownCalls: "1" },
        latency: { sampleCount: "1", averageMs: "8", p95Ms: "8" },
      },
      daily: [{ day: "2026-10-21", operations: "1", providerCalls: "1" }],
      models: [
        {
          model: "fixture-model",
          providerCalls: "1",
          operations: "1",
          knownTotalTokens: null,
          tokenSamples: "0",
        },
      ],
      modelCoverage: {
        totalModels: "1",
        displayedModels: "1",
        omittedModels: "0",
        totalProviderCalls: "1",
        displayedProviderCalls: "1",
        omittedProviderCalls: "0",
        knownTotalTokens: null,
        displayedKnownTotalTokens: null,
        omittedKnownTotalTokens: null,
        tokenSamples: "0",
        displayedTokenSamples: "0",
        omittedTokenSamples: "0",
      },
      telemetryIsBestEffort: true,
      ttft: "not_collected",
      monetaryBudget: false,
    },
    operations: {
      items: [
        {
          operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          operation: "assistant_question",
          mode: "general",
          promptId: "prompt-general",
          promptVersion: String(query.page ?? "v1"),
          outcome: "success",
          startedAt: "2026-10-21T00:00:00.000Z",
          durationMs: 12,
          providerCalls: "1",
          knownTotalTokens: null,
          totalTokenSamples: "0",
        },
      ],
      total: "1",
      page: 1,
      pageSize: 20,
      totalPages: 1,
    },
    ...overrides,
  };
}

function providerCallsResponse(
  model = "fixture-model",
): AiUsageProviderCallsResponse {
  return {
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    page: 1,
    pageSize: 20,
    total: "1",
    totalPages: 1,
    items: [
      {
        callId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        model,
        type: "generate",
        outcome: "success",
        usageStatus: "missing",
        inputTokens: "0",
        outputTokens: null,
        totalTokens: null,
        costStatus: "unknown_usage",
        estimatedCost: null,
        pricingVersion: null,
        currency: null,
        durationMs: 8,
        startedAt: "2026-10-21T00:00:00.000Z",
      },
    ],
  };
}

function costBreakdownResponse(
  overrides: Partial<AiUsageCostBreakdownResponse> = {},
): AiUsageCostBreakdownResponse {
  return {
    group: "currency",
    currency: null,
    page: 1,
    pageSize: 20,
    totalGroups: "1",
    totalEstimatedCalls: "1",
    totalPages: 1,
    totalEstimatedCost: null,
    items: [
      {
        currency: "USD",
        pricingVersion: null,
        pricingVersionCount: "1",
        estimatedCalls: "1",
        estimatedCost: "0.000000000000",
      },
    ],
    ...overrides,
  };
}

function mount(principal: typeof manager | undefined = manager) {
  return render(
    <PilotPrincipalContext.Provider value={principal}>
      <AiUsageDashboard />
    </PilotPrincipalContext.Provider>,
  );
}

function mockOverview(response = dashboardResponse()) {
  vi.mocked(api.aiUsageDashboard).mockResolvedValue(response);
  vi.mocked(api.aiUsageCostBreakdown).mockResolvedValue(
    costBreakdownResponse(),
  );
}

describe("AiUsageDashboard", () => {
  beforeEach(() => {
    vi.mocked(api.aiUsageDashboard).mockReset();
    vi.mocked(api.aiUsageCostBreakdown).mockReset();
    vi.mocked(api.aiUsageProviderCalls).mockReset();
    vi.mocked(api.aiUsageCostBreakdown).mockResolvedValue(
      costBreakdownResponse(),
    );
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows unknown usage separately from a known zero and reads provider calls on demand", async () => {
    mockOverview();
    vi.mocked(api.aiUsageProviderCalls).mockResolvedValue(
      providerCallsResponse(),
    );
    mount();

    await screen.findByText(/prompt-general/);
    expect(screen.getAllByText(/Chưa có dữ liệu/).length).toBeGreaterThan(0);
    expect(screen.getByText(/chưa ước tính/)).toBeTruthy();
    expect(screen.getByText(/0 calls có giá đã lưu/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Provider calls" }));
    await waitFor(() =>
      expect(api.aiUsageProviderCalls).toHaveBeenCalledTimes(1),
    );
    expect(screen.getAllByText("fixture-model").length).toBeGreaterThan(0);
    expect(api.aiUsageProviderCalls).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      1,
      20,
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("passes the active model filter to provider-call detail", async () => {
    mockOverview();
    vi.mocked(api.aiUsageProviderCalls).mockResolvedValue(
      providerCallsResponse(),
    );
    mount();
    await screen.findByText(/prompt-general/);
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gemini-2.5-flash" },
    });
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(2));
    await screen.findByText(/prompt-general/);
    fireEvent.click(screen.getByRole("button", { name: "Provider calls" }));
    await waitFor(() =>
      expect(api.aiUsageProviderCalls).toHaveBeenCalledWith(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        1,
        20,
        "gemini-2.5-flash",
        expect.any(AbortSignal),
      ),
    );
  });

  it("ignores a late provider-call response after the model filter changes", async () => {
    let resolveOld!: (value: AiUsageProviderCallsResponse) => void;
    mockOverview();
    vi.mocked(api.aiUsageProviderCalls)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOld = resolve)),
      )
      .mockResolvedValueOnce(providerCallsResponse("gemini-2.5-flash"));
    mount();
    await screen.findByText(/prompt-general/);
    fireEvent.click(screen.getByRole("button", { name: "Provider calls" }));
    await waitFor(() =>
      expect(api.aiUsageProviderCalls).toHaveBeenCalledTimes(1),
    );

    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gemini-2.5-flash" },
    });
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Provider calls" }));
    await screen.findByText("gemini-2.5-flash");

    await act(async () => resolveOld(providerCallsResponse("old-model")));
    expect(screen.queryByText("old-model")).toBeNull();
    expect(screen.getAllByText("gemini-2.5-flash").length).toBeGreaterThan(0);
  });

  it("shows safe date-filter guidance for a structured validation response", async () => {
    vi.mocked(api.aiUsageDashboard).mockRejectedValue(
      new ApiError("invalid", "AI_USAGE_QUERY_INVALID", 400),
    );
    vi.mocked(api.aiUsageCostBreakdown).mockRejectedValue(
      new ApiError("invalid", "AI_USAGE_QUERY_INVALID", 400),
    );
    mount();
    await screen.findByRole("heading", { name: "Bộ lọc không hợp lệ" });
    expect(screen.getByText(/0001-01-01 đến 9999-12-30/)).toBeTruthy();
    expect(
      screen.queryByText(/chưa tải được telemetry.*thử tải lại/i),
    ).toBeNull();
  });

  it("resets to page one in the first request after a filter change", async () => {
    mockOverview(
      dashboardResponse({
        totalPages: 2,
        operations: {
          ...dashboardResponse().operations,
          totalPages: 2,
        },
      }),
    );
    mount();
    await screen.findByText(/prompt-general/);

    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Trang operations" }),
      ).getByRole("button", { name: "Sau" }),
    );
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.aiUsageDashboard).mock.calls[1][0].page).toBe(2);

    fireEvent.change(screen.getByLabelText("Thao tác"), {
      target: { value: "assistant_summary" },
    });
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(3));
    const nextQuery = vi.mocked(api.aiUsageDashboard).mock.calls[2][0];
    expect(nextQuery.operation).toBe("assistant_summary");
    expect(nextQuery.page).toBe(1);
  });

  it("ignores a late response from the previous principal", async () => {
    let resolveOld!: (value: AiUsageDashboardResponse) => void;
    vi.mocked(api.aiUsageDashboard)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOld = resolve)),
      )
      .mockResolvedValueOnce(dashboardResponse());
    const view = mount(manager);
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(1));

    view.rerender(
      <PilotPrincipalContext.Provider value={otherManager}>
        <AiUsageDashboard />
      </PilotPrincipalContext.Provider>,
    );
    await screen.findByText(/prompt-general/);

    await act(async () =>
      resolveOld(
        dashboardResponse({
          operations: {
            ...dashboardResponse().operations,
            items: [
              {
                ...dashboardResponse().operations.items[0],
                promptVersion: "old-principal",
              },
            ],
          },
        }),
      ),
    );
    expect(screen.queryByText(/old-principal/)).toBeNull();
    expect(screen.getByText(/prompt-general/)).toBeTruthy();
  });

  it("renders forbidden as a distinct state without a retry action", async () => {
    vi.mocked(api.aiUsageDashboard).mockRejectedValue(
      new ApiError("forbidden", "ROLE_FORBIDDEN", 403),
    );
    mount();
    await screen.findByText(
      "Chỉ manager có membership hiện tại mới xem được trang này.",
    );
    expect(
      screen.getByRole("heading", { name: "Không có quyền xem" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
  });

  it("sends only bounded GET reads and never derives summary from the current page", async () => {
    mockOverview(
      dashboardResponse({
        operations: {
          ...dashboardResponse().operations,
          total: "41",
          totalPages: 3,
        },
      }),
    );
    mount();
    await screen.findByText(/prompt-general/);
    expect(screen.getByText(/41 operations trong cohort/)).toBeTruthy();
    expect(api.aiUsageDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.any(AbortSignal),
    );
    expect(api.aiUsageProviderCalls).not.toHaveBeenCalled();
  });

  it("keeps complete cost currency totals independent of operation pagination", async () => {
    mockOverview(
      dashboardResponse({
        totalPages: 2,
        operations: {
          ...dashboardResponse().operations,
          totalPages: 2,
        },
      }),
    );
    mount();
    await screen.findByRole("heading", { name: "Chi phí theo currency" });
    await waitFor(() =>
      expect(api.aiUsageCostBreakdown).toHaveBeenCalledTimes(1),
    );
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Trang operations" }),
      ).getByRole("button", { name: "Sau" }),
    );
    await waitFor(() => expect(api.aiUsageDashboard).toHaveBeenCalledTimes(2));
    expect(api.aiUsageCostBreakdown).toHaveBeenCalledTimes(1);
  });

  it("labels the model table as top-20 and discloses omitted coverage", async () => {
    const response = dashboardResponse();
    response.summary.modelCoverage = {
      totalModels: "23",
      displayedModels: "20",
      omittedModels: "3",
      totalProviderCalls: "41",
      displayedProviderCalls: "38",
      omittedProviderCalls: "3",
      knownTotalTokens: "9007199254741000",
      displayedKnownTotalTokens: "9007199254740997",
      omittedKnownTotalTokens: "3",
      tokenSamples: "41",
      displayedTokenSamples: "38",
      omittedTokenSamples: "3",
    };
    mockOverview(response);
    mount();
    await screen.findByText(/prompt-general/);
    expect(screen.getByText(/Top 20 \/ 23 model/)).toBeTruthy();
    expect(screen.getByText(/Bỏ qua 3 model \(3 calls\)/)).toBeTruthy();
    expect(
      screen.getByText(/token đã biết bị bỏ qua: 3 trong 3 mẫu/),
    ).toBeTruthy();
  });

  it("drops a late cost breakdown when its cohort changes", async () => {
    let resolveOld!: (value: AiUsageCostBreakdownResponse) => void;
    vi.mocked(api.aiUsageDashboard).mockResolvedValue(dashboardResponse());
    vi.mocked(api.aiUsageCostBreakdown)
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveOld = resolve)),
      )
      .mockResolvedValueOnce(
        costBreakdownResponse({
          items: [
            {
              currency: "EUR",
              pricingVersion: null,
              pricingVersionCount: "1",
              estimatedCalls: "1",
              estimatedCost: "8.000000000000",
            },
          ],
        }),
      );
    mount();
    await screen.findByText(/prompt-general/);
    await waitFor(() =>
      expect(api.aiUsageCostBreakdown).toHaveBeenCalledTimes(1),
    );
    fireEvent.change(screen.getByLabelText("Model ID"), {
      target: { value: "gemini-2.5-flash" },
    });
    await waitFor(() =>
      expect(api.aiUsageCostBreakdown).toHaveBeenCalledTimes(2),
    );
    await screen.findByText("8.000000000000 EUR");
    await act(async () => resolveOld(costBreakdownResponse()));
    expect(screen.queryByText("0.000000000000 USD")).toBeNull();
    expect(screen.getByText("8.000000000000 EUR")).toBeTruthy();
  });
});
