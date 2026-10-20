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
        cost: { estimatedCalls: "0", unknownCalls: "1", breakdown: [] },
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

function providerCallsResponse(): AiUsageProviderCallsResponse {
  return {
    operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    page: 1,
    pageSize: 20,
    total: "1",
    totalPages: 1,
    items: [
      {
        callId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        model: "fixture-model",
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

function mount(principal: typeof manager | undefined = manager) {
  return render(
    <PilotPrincipalContext.Provider value={principal}>
      <AiUsageDashboard />
    </PilotPrincipalContext.Provider>,
  );
}

function mockOverview(response = dashboardResponse()) {
  vi.mocked(api.aiUsageDashboard).mockResolvedValue(response);
}

describe("AiUsageDashboard", () => {
  beforeEach(() => {
    vi.mocked(api.aiUsageDashboard).mockReset();
    vi.mocked(api.aiUsageProviderCalls).mockReset();
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
    expect(
      screen.getByText(/0 calls có giá đã lưu; 1 chưa ước tính/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Provider calls" }));
    await waitFor(() =>
      expect(api.aiUsageProviderCalls).toHaveBeenCalledTimes(1),
    );
    expect(screen.getAllByText("fixture-model").length).toBeGreaterThan(0);
    expect(api.aiUsageProviderCalls).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      1,
      20,
      expect.any(AbortSignal),
    );
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
});
