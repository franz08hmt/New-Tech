import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "./api";
import type {
  AiUsageDashboardQuery,
  AiUsageDashboardResponse,
  AiUsageOperationMode,
  AiUsageOperationName,
  AiUsageOperationOutcome,
  AiUsageDashboardSort,
  AiUsageCostBreakdownResponse,
  AiUsageProviderCallsResponse,
} from "./api";
import { PilotPrincipalContext } from "./PilotPrincipalContext";

type Filters = AiUsageDashboardQuery;
type ReadError = {
  key: string;
  forbidden: boolean;
  invalid: boolean;
  message: string;
};
type Selection = { operationId: string; page: number; baseKey: string };
type CostView = {
  cohortKey: string;
  group: "currency" | "pricing_version";
  currency?: string;
  page: number;
};

function hcmToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysBefore(day: string, count: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}

function formatInteger(value: string | null | undefined) {
  if (value === null || value === undefined) return "Chưa có dữ liệu";
  try {
    return new Intl.NumberFormat("vi-VN").format(BigInt(value));
  } catch {
    return value;
  }
}

function percent(value: string, maximum: bigint) {
  if (maximum <= 0n) return 0;
  try {
    const amount = BigInt(value);
    if (amount <= 0n) return 0;
    return Number((amount * 10_000n) / maximum) / 100;
  } catch {
    return 0;
  }
}

function friendlyError(error: unknown) {
  if (error instanceof ApiError) {
    if (
      error.status === 403 ||
      ["ROLE_FORBIDDEN", "WORKSPACE_ACCESS_DENIED"].includes(error.code)
    )
      return {
        forbidden: true,
        invalid: false,
        message: "Chỉ manager có membership hiện tại mới xem được trang này.",
      };
    if (error.status === 401 || error.code === "AUTH_REQUIRED")
      return {
        forbidden: true,
        invalid: false,
        message: "Phiên đăng nhập không còn quyền xem trang này.",
      };
    if (error.status === 400 && error.code === "AI_USAGE_QUERY_INVALID")
      return {
        forbidden: false,
        invalid: true,
        message:
          "Ngày hoặc bộ lọc không hợp lệ. Chọn ngày từ 0001-01-01 đến 9999-12-30 và khoảng tối đa 90 ngày.",
      };
  }
  return {
    forbidden: false,
    invalid: false,
    message:
      "Chưa tải được telemetry. Hãy thử tải lại; thao tác này chỉ đọc dữ liệu.",
  };
}

function outcomeLabel(value: string) {
  const labels: Record<string, string> = {
    success: "Thành công",
    error: "Lỗi",
    timeout: "Hết giờ",
    cancelled: "Đã hủy",
    rejected: "Bị từ chối",
    unknown: "Chưa rõ",
  };
  return labels[value] ?? value;
}

const operationOptions: Array<[AiUsageOperationName, string]> = [
  ["assistant_question", "Câu hỏi Assistant"],
  ["assistant_summary", "Tóm tắt"],
  ["assistant_course_info", "Thông tin môn học"],
  ["document_index", "Lập chỉ mục tài liệu"],
];
const modeOptions: Array<[AiUsageOperationMode, string]> = [
  ["general", "Chung"],
  ["documents", "Tài liệu"],
  ["workspace", "Workspace"],
];
const outcomeOptions: Array<[AiUsageOperationOutcome, string]> = [
  ["success", "Thành công"],
  ["error", "Lỗi"],
  ["timeout", "Hết giờ"],
  ["cancelled", "Đã hủy"],
  ["rejected", "Bị từ chối"],
  ["unknown", "Chưa rõ"],
];

export function AiUsageDashboard() {
  const principal = useContext(PilotPrincipalContext);
  const identity = principal
    ? `${principal.userId}:${principal.workspaceId}:${principal.role}`
    : "anonymous";
  const today = hcmToday();
  const [filters, setFilters] = useState<Filters>(() => ({
    from: daysBefore(today, 6),
    to: today,
    sort: "started_at",
    direction: "desc",
    page: 1,
    pageSize: 20,
  }));
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [payload, setPayload] = useState<{
    key: string;
    data: AiUsageDashboardResponse;
  }>();
  const [error, setError] = useState<ReadError>();
  const [selection, setSelection] = useState<Selection>();
  const [callsPayload, setCallsPayload] = useState<{
    key: string;
    data: AiUsageProviderCallsResponse;
  }>();
  const [callsError, setCallsError] = useState<ReadError>();
  const [callsRevision, setCallsRevision] = useState(0);
  const [callsPage, setCallsPage] = useState(1);
  const [costView, setCostView] = useState<CostView>();
  const [costRevision, setCostRevision] = useState(0);
  const [costPayload, setCostPayload] = useState<{
    key: string;
    data: AiUsageCostBreakdownResponse;
  }>();
  const [costError, setCostError] = useState<ReadError>();
  const requestRevision = useRef(0);
  const callsRequestRevision = useRef(0);
  const costRequestRevision = useRef(0);
  const key = JSON.stringify([identity, filters]);
  const overviewRequestKey = JSON.stringify([key, refreshGeneration]);
  const overviewRequestKeyRef = useRef(overviewRequestKey);
  overviewRequestKeyRef.current = overviewRequestKey;
  const costCohortKey = JSON.stringify([
    identity,
    filters.from,
    filters.to,
    filters.operation,
    filters.mode,
    filters.outcome,
    filters.model,
  ]);
  const activeCostView: CostView =
    costView?.cohortKey === costCohortKey
      ? costView
      : { cohortKey: costCohortKey, group: "currency", page: 1 };
  const costKey = JSON.stringify([
    costCohortKey,
    activeCostView.group,
    activeCostView.currency,
    activeCostView.page,
  ]);
  const costRequestKey = JSON.stringify([costKey, refreshGeneration]);
  const costRequestKeyRef = useRef(costRequestKey);
  costRequestKeyRef.current = costRequestKey;

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestRevision.current;
    setPayload(undefined);
    setError(undefined);
    if (!principal) return () => controller.abort();
    void api
      .aiUsageDashboard(filters, controller.signal)
      .then((data) => {
        if (
          !controller.signal.aborted &&
          requestId === requestRevision.current &&
          overviewRequestKeyRef.current === overviewRequestKey
        )
          setPayload({ key: overviewRequestKey, data });
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== requestRevision.current ||
          overviewRequestKeyRef.current !== overviewRequestKey
        )
          return;
        const state = friendlyError(reason);
        setError({ key: overviewRequestKey, ...state });
      });
    return () => controller.abort();
  }, [overviewRequestKey]);

  useEffect(() => {
    setCostView(undefined);
    setSelection(undefined);
    setCallsPage(1);
  }, [identity]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++costRequestRevision.current;
    setCostPayload(undefined);
    setCostError(undefined);
    if (!principal) return () => controller.abort();
    void api
      .aiUsageCostBreakdown(
        {
          from: filters.from,
          to: filters.to,
          operation: filters.operation,
          mode: filters.mode,
          outcome: filters.outcome,
          model: filters.model,
          group: activeCostView.group,
          currency: activeCostView.currency,
          page: activeCostView.page,
          pageSize: 20,
        },
        controller.signal,
      )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          requestId === costRequestRevision.current &&
          costRequestKeyRef.current === costRequestKey
        )
          setCostPayload({ key: costRequestKey, data });
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== costRequestRevision.current ||
          costRequestKeyRef.current !== costRequestKey
        )
          return;
        setCostError({ key: costRequestKey, ...friendlyError(reason) });
      });
    return () => controller.abort();
  }, [costRequestKey, costRevision]);

  const active = payload?.key === overviewRequestKey ? payload.data : undefined;
  const activeError = error?.key === overviewRequestKey ? error : undefined;
  const loading = !active && !activeError && Boolean(principal);
  const summary = active?.summary;
  const dailyMaximum = useMemo(() => {
    let maximum = 0n;
    for (const item of summary?.daily ?? []) {
      for (const value of [item.operations, item.providerCalls]) {
        try {
          const amount = BigInt(value);
          if (amount > maximum) maximum = amount;
        } catch {
          // An invalid stored count is rendered as text and has no chart width.
        }
      }
    }
    return maximum;
  }, [summary?.daily]);

  const updateFilter = <K extends keyof Filters>(
    field: K,
    value: Filters[K],
  ) => {
    setFilters((current) => ({ ...current, [field]: value, page: 1 }));
    setCostView(undefined);
    setSelection(undefined);
    setCallsPage(1);
  };
  const clearFilters = () => {
    setFilters((current) => ({
      from: daysBefore(hcmToday(), 6),
      to: hcmToday(),
      sort: "started_at",
      direction: "desc",
      page: 1,
      pageSize: current.pageSize,
    }));
    setCostView(undefined);
    setSelection(undefined);
    setCallsPage(1);
  };

  const callsKey =
    selection?.baseKey === key
      ? JSON.stringify([
          identity,
          selection.operationId,
          filters.model,
          callsPage,
        ])
      : "";
  const callsRequestKey = callsKey
    ? JSON.stringify([callsKey, refreshGeneration])
    : "";
  const callsRequestKeyRef = useRef(callsRequestKey);
  callsRequestKeyRef.current = callsRequestKey;
  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++callsRequestRevision.current;
    setCallsPayload(undefined);
    setCallsError(undefined);
    if (!callsRequestKey || !selection || selection.baseKey !== key)
      return () => controller.abort();
    void api
      .aiUsageProviderCalls(
        selection.operationId,
        callsPage,
        20,
        filters.model,
        controller.signal,
      )
      .then((data) => {
        if (
          !controller.signal.aborted &&
          requestId === callsRequestRevision.current &&
          callsRequestKeyRef.current === callsRequestKey
        )
          setCallsPayload({ key: callsRequestKey, data });
      })
      .catch((reason: unknown) => {
        if (
          controller.signal.aborted ||
          requestId !== callsRequestRevision.current ||
          callsRequestKeyRef.current !== callsRequestKey
        )
          return;
        setCallsError({
          key: callsRequestKey,
          ...friendlyError(reason),
        });
      });
    return () => controller.abort();
  }, [callsRequestKey, callsRevision]);

  const calls =
    callsPayload?.key === callsRequestKey ? callsPayload.data : undefined;
  const visibleCallsError =
    callsError?.key === callsRequestKey ? callsError : undefined;
  const callsLoading = Boolean(callsRequestKey) && !calls && !visibleCallsError;
  const totalPages = active?.operations.totalPages ?? 0;
  const activeCost =
    costPayload?.key === costRequestKey ? costPayload.data : undefined;
  const activeCostError =
    costError?.key === costRequestKey ? costError : undefined;
  const costLoading = Boolean(principal) && !activeCost && !activeCostError;

  if (!principal)
    return (
      <section className="panel" role="status">
        <h2>Dashboard không khả dụng</h2>
        <p>Hãy đăng nhập và kiểm tra quyền workspace.</p>
      </section>
    );

  return (
    <section className="ai-usage-dashboard" aria-label="AI usage dashboard">
      <p className="ai-usage-caveat" role="note">
        Chỉ hiển thị telemetry đã được ghi nhận. Ghi telemetry là best-effort,
        có thể thiếu; đây không phải hóa đơn, nguồn quota hay bảng theo dõi trực
        tiếp. Các request bị chặn trước khi ghi operation không được đảm bảo
        xuất hiện.
      </p>

      <div className="ai-usage-filters" aria-label="Bộ lọc telemetry">
        <label>
          Từ ngày
          <input
            type="date"
            value={filters.from}
            min="0001-01-01"
            max={filters.to}
            onChange={(event) => updateFilter("from", event.target.value)}
          />
        </label>
        <label>
          Đến ngày
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max="9999-12-30"
            onChange={(event) => updateFilter("to", event.target.value)}
          />
        </label>
        <label>
          Thao tác
          <select
            value={filters.operation ?? ""}
            onChange={(event) =>
              updateFilter(
                "operation",
                (event.target.value || undefined) as
                  AiUsageOperationName | undefined,
              )
            }
          >
            <option value="">Tất cả thao tác</option>
            {operationOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chế độ
          <select
            value={filters.mode ?? ""}
            onChange={(event) =>
              updateFilter(
                "mode",
                (event.target.value || undefined) as
                  AiUsageOperationMode | undefined,
              )
            }
          >
            <option value="">Tất cả chế độ</option>
            {modeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kết quả
          <select
            value={filters.outcome ?? ""}
            onChange={(event) =>
              updateFilter(
                "outcome",
                (event.target.value || undefined) as
                  AiUsageOperationOutcome | undefined,
              )
            }
          >
            <option value="">Tất cả kết quả</option>
            {outcomeOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model ID
          <input
            type="text"
            maxLength={84}
            pattern="[A-Za-z0-9._-]{1,84}"
            value={filters.model ?? ""}
            onChange={(event) =>
              updateFilter("model", event.target.value.trim() || undefined)
            }
          />
        </label>
        <label>
          Sắp xếp
          <select
            value={filters.sort}
            onChange={(event) =>
              updateFilter("sort", event.target.value as AiUsageDashboardSort)
            }
          >
            <option value="started_at">Thời điểm</option>
            <option value="duration_ms">Thời lượng</option>
            <option value="operation">Thao tác</option>
            <option value="outcome">Kết quả</option>
          </select>
        </label>
        <label>
          Chiều
          <select
            value={filters.direction}
            onChange={(event) =>
              updateFilter("direction", event.target.value as "asc" | "desc")
            }
          >
            <option value="desc">Giảm dần</option>
            <option value="asc">Tăng dần</option>
          </select>
        </label>
        <label>
          Kết quả mỗi trang
          <select
            value={filters.pageSize}
            onChange={(event) =>
              updateFilter("pageSize", Number(event.target.value))
            }
          >
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
        <div className="ai-usage-filter-actions">
          <button type="button" onClick={clearFilters}>
            Đặt lại bộ lọc
          </button>
          <button
            type="button"
            onClick={() => setRefreshGeneration((generation) => generation + 1)}
          >
            Tải lại
          </button>
        </div>
      </div>

      {loading && (
        <p role="status" aria-busy="true" className="ai-usage-state">
          Đang tải telemetry…
        </p>
      )}
      {activeError && (
        <section className="panel ai-usage-state" role="alert">
          <h2>
            {activeError.forbidden
              ? "Không có quyền xem"
              : activeError.invalid
                ? "Bộ lọc không hợp lệ"
                : "Chưa tải được telemetry"}
          </h2>
          <p>{activeError.message}</p>
          {!activeError.forbidden && (
            <button
              type="button"
              onClick={() =>
                setRefreshGeneration((generation) => generation + 1)
              }
            >
              Thử lại
            </button>
          )}
        </section>
      )}

      {active && summary && (
        <>
          <p className="ai-usage-report-range" role="status">
            Ngày báo cáo {active.from} → {active.to} theo múi giờ{" "}
            {active.timezone}.
            {filters.model
              ? ` Cohort gồm operations có provider call model ${filters.model}; provider calls hiển thị chỉ gồm model đó.`
              : " Cohort operation được chọn theo bộ lọc; provider calls tính toàn bộ calls chưa hết hàn của các operation đó."}
          </p>
          <p className="ai-usage-caption">
            Time to first token (TTFT): chưa thu thập.
          </p>
          <div className="ai-usage-kpis">
            <article className="panel">
              <h2>Logical operations</h2>
              <strong>{formatInteger(summary.operations.total)}</strong>
              <small>
                {Object.entries(summary.operations.outcomes)
                  .map(
                    ([name, count]) =>
                      `${outcomeLabel(name)} ${formatInteger(count)}`,
                  )
                  .join(" · ")}
              </small>
            </article>
            <article className="panel">
              <h2>Provider calls</h2>
              <strong>{formatInteger(summary.providerCalls.total)}</strong>
              <small>
                Count các provider call được ghi nhận, không phải số HTTP
                request.{" "}
                {Object.entries(summary.providerCalls.outcomes)
                  .map(
                    ([name, count]) =>
                      `${outcomeLabel(name)} ${formatInteger(count)}`,
                  )
                  .join(" · ")}
              </small>
              <small>
                Usage metadata: complete{" "}
                {formatInteger(summary.providerCalls.usage.complete)} · partial{" "}
                {formatInteger(summary.providerCalls.usage.partial)} · missing{" "}
                {formatInteger(summary.providerCalls.usage.missing)} · invalid{" "}
                {formatInteger(summary.providerCalls.usage.invalid)}.
              </small>
            </article>
            <article className="panel">
              <h2>Total tokens đã biết</h2>
              <strong>
                {formatInteger(summary.providerCalls.tokens.total)}
              </strong>
              <small>
                Input: {formatInteger(summary.providerCalls.tokens.input)} (
                {formatInteger(summary.providerCalls.tokens.inputSamples)} mẫu);
                output: {formatInteger(summary.providerCalls.tokens.output)} (
                {formatInteger(summary.providerCalls.tokens.outputSamples)}{" "}
                mẫu); total:{" "}
                {formatInteger(summary.providerCalls.tokens.totalSamples)} /{" "}
                {formatInteger(summary.providerCalls.total)} calls. Giá trị
                thiếu không được coi là 0.
              </small>
            </article>
            <article className="panel">
              <h2>Chi phí ước tính đã biết</h2>
              <strong>
                {formatInteger(summary.providerCalls.cost.estimatedCalls)} calls
                có giá đã lưu
              </strong>
              <small>
                {formatInteger(summary.providerCalls.cost.unknownCalls)} chưa
                ước tính. Chi tiết theo currency và pricing version bên dưới,
                không phải billing.
              </small>
            </article>
            <article className="panel">
              <h2>Operation latency</h2>
              <strong>
                {summary.operations.latency.averageMs ?? "Chưa có dữ liệu"} ms
                avg
              </strong>
              <small>
                p95 {summary.operations.latency.p95Ms ?? "—"} ms · n=
                {formatInteger(summary.operations.latency.sampleCount)}
              </small>
            </article>
            <article className="panel">
              <h2>Provider-call latency</h2>
              <strong>
                {summary.providerCalls.latency.averageMs ?? "Chưa có dữ liệu"}{" "}
                ms avg
              </strong>
              <small>
                p95 {summary.providerCalls.latency.p95Ms ?? "—"} ms · n=
                {formatInteger(summary.providerCalls.latency.sampleCount)}
              </small>
            </article>
          </div>

          <div className="ai-usage-analysis-grid">
            <section className="panel" aria-labelledby="ai-usage-daily-title">
              <h2 id="ai-usage-daily-title">
                Operations và provider calls theo ngày
              </h2>
              <p className="ai-usage-caption">
                Calls được gắn với ngày bắt đầu của operation; chỉ có tối đa 90
                ngày.
              </p>
              <ul className="ai-usage-daily-list">
                {summary.daily.map((item) => (
                  <li key={item.day}>
                    <time>{item.day}</time>
                    <span
                      className="ai-usage-bars"
                      aria-label={`${item.operations} operations, ${item.providerCalls} provider calls`}
                    >
                      <span
                        className="ai-usage-bar-operation"
                        style={{
                          width: `${percent(item.operations, dailyMaximum)}%`,
                        }}
                      />
                      <span
                        className="ai-usage-bar-calls"
                        style={{
                          width: `${percent(item.providerCalls, dailyMaximum)}%`,
                        }}
                      />
                    </span>
                    <span>
                      {formatInteger(item.operations)} ops ·{" "}
                      {formatInteger(item.providerCalls)} calls
                    </span>
                  </li>
                ))}
              </ul>
              <p className="ai-usage-legend">
                <i className="ai-usage-legend-operation" /> Operations{" "}
                <i className="ai-usage-legend-calls" /> Provider calls
              </p>
            </section>
            <section className="panel" aria-labelledby="ai-usage-model-title">
              <h2 id="ai-usage-model-title">Provider calls theo model</h2>
              {summary.models.length ? (
                <div className="ai-usage-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Calls</th>
                        <th>Operations</th>
                        <th>Total token đã biết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.models.map((model) => (
                        <tr key={model.model}>
                          <th scope="row">{model.model}</th>
                          <td>{formatInteger(model.providerCalls)}</td>
                          <td>{formatInteger(model.operations)}</td>
                          <td>
                            {formatInteger(model.knownTotalTokens)} (
                            {formatInteger(model.tokenSamples)} mẫu)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p role="status">Không có provider call trong cohort này.</p>
              )}
              <p className="ai-usage-caption">
                Top 20 / {formatInteger(summary.modelCoverage.totalModels)}{" "}
                model. Bỏ qua{" "}
                {formatInteger(summary.modelCoverage.omittedModels)} model (
                {formatInteger(summary.modelCoverage.omittedProviderCalls)}{" "}
                calls); token đã biết bị bỏ qua:{" "}
                {formatInteger(summary.modelCoverage.omittedKnownTotalTokens)}{" "}
                trong {formatInteger(summary.modelCoverage.omittedTokenSamples)}{" "}
                mẫu.
              </p>
            </section>
          </div>

          <section
            className="panel ai-usage-cost-breakdown"
            aria-labelledby="ai-usage-cost-title"
          >
            <header className="ai-usage-section-heading">
              <div>
                <h2 id="ai-usage-cost-title">Chi phí theo currency</h2>
                <p>
                  Tổng tiền được giữ riêng theo currency. Pricing version được
                  phân trang; không quy đổi hoặc cộng chéo currency.
                </p>
              </div>
              {activeCostView.group === "pricing_version" && (
                <button
                  type="button"
                  onClick={() =>
                    setCostView({
                      cohortKey: costCohortKey,
                      group: "currency",
                      page: 1,
                    })
                  }
                >
                  Tất cả currency
                </button>
              )}
            </header>
            <p>
              {activeCostView.group === "pricing_version"
                ? "Currency " +
                  activeCostView.currency +
                  "; tổng đủ pricing version: " +
                  (activeCost?.totalEstimatedCost ?? "đang tải") +
                  " " +
                  activeCostView.currency +
                  "."
                : "Mỗi dòng là tổng của toàn bộ pricing version trong cohort."}
            </p>
            {costLoading && (
              <p role="status" aria-busy="true">
                Đang tải breakdown chi phí…
              </p>
            )}
            {activeCostError && (
              <div role="alert">
                <p>{activeCostError.message}</p>
                {!activeCostError.forbidden && (
                  <button
                    type="button"
                    onClick={() => setCostRevision((value) => value + 1)}
                  >
                    Thử tải breakdown
                  </button>
                )}
              </div>
            )}
            {activeCost && (
              <>
                {activeCost.items.length ? (
                  <div className="ai-usage-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Currency</th>
                          <th>Pricing version</th>
                          <th>Calls có estimate</th>
                          <th>Chi phí ước tính đã biết</th>
                          <th>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeCost.items.map((item) => (
                          <tr
                            key={
                              item.currency +
                              ":" +
                              (item.pricingVersion ?? "all")
                            }
                          >
                            <th scope="row">{item.currency}</th>
                            <td>
                              {item.pricingVersion ??
                                formatInteger(item.pricingVersionCount) +
                                  " versions"}
                            </td>
                            <td>{formatInteger(item.estimatedCalls)}</td>
                            <td>
                              {item.estimatedCost} {item.currency}
                            </td>
                            <td>
                              {activeCostView.group === "currency" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCostView({
                                      cohortKey: costCohortKey,
                                      group: "pricing_version",
                                      currency: item.currency,
                                      page: 1,
                                    })
                                  }
                                >
                                  Pricing versions
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p role="status">
                    Không có chi phí estimate đã ghi trong cohort này.
                  </p>
                )}
                <nav
                  className="ai-usage-pagination"
                  aria-label="Trang nhóm chi phí"
                >
                  <button
                    type="button"
                    disabled={activeCost.page <= 1 || costLoading}
                    onClick={() =>
                      setCostView({
                        ...activeCostView,
                        page: activeCost.page - 1,
                      })
                    }
                  >
                    Trước
                  </button>
                  <span>
                    Trang {activeCost.page} /{" "}
                    {Math.max(1, activeCost.totalPages)} ·{" "}
                    {formatInteger(activeCost.totalGroups)} nhóm ·{" "}
                    {formatInteger(activeCost.totalEstimatedCalls)} calls có
                    estimate
                  </span>
                  <button
                    type="button"
                    disabled={
                      activeCost.page >= activeCost.totalPages || costLoading
                    }
                    onClick={() =>
                      setCostView({
                        ...activeCostView,
                        page: activeCost.page + 1,
                      })
                    }
                  >
                    Sau
                  </button>
                </nav>
              </>
            )}
          </section>

          <section
            className="panel ai-usage-operations"
            aria-labelledby="ai-usage-operations-title"
          >
            <header className="ai-usage-section-heading">
              <div>
                <h2 id="ai-usage-operations-title">Logical operations</h2>
                <p>
                  {formatInteger(active.operations.total)} operations trong
                  cohort; bảng không là nguồn quyết định quota.
                </p>
              </div>
            </header>
            {active.operations.items.length ? (
              <div className="ai-usage-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Bắt đầu</th>
                      <th>Operation</th>
                      <th>Mode</th>
                      <th>Outcome</th>
                      <th>Provider calls</th>
                      <th>Token đã biết</th>
                      <th>Latency</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.operations.items.map((item) => (
                      <tr key={item.operationId}>
                        <td>
                          {new Date(item.startedAt).toLocaleString("vi-VN", {
                            timeZone: active.timezone,
                          })}
                        </td>
                        <td>
                          {item.operation}
                          <small>
                            {item.promptId
                              ? `${item.promptId} · ${item.promptVersion}`
                              : "Không dùng prompt"}
                          </small>
                        </td>
                        <td>{item.mode ?? "—"}</td>
                        <td>{outcomeLabel(item.outcome)}</td>
                        <td>{formatInteger(item.providerCalls)}</td>
                        <td>
                          {formatInteger(item.knownTotalTokens)} (
                          {formatInteger(item.totalTokenSamples)} mẫu)
                        </td>
                        <td>{item.durationMs} ms</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => {
                              setCallsPage(1);
                              setSelection({
                                operationId: item.operationId,
                                page: 1,
                                baseKey: key,
                              });
                            }}
                          >
                            Provider calls
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p role="status">
                Không có operation được ghi nhận trong khoảng lọc này.
              </p>
            )}
            <nav className="ai-usage-pagination" aria-label="Trang operations">
              <button
                type="button"
                disabled={filters.page <= 1 || loading}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page - 1,
                  }))
                }
              >
                Trước
              </button>
              <span>
                Trang {filters.page} / {Math.max(1, totalPages)} ·{" "}
                {formatInteger(active.operations.total)} operations
              </span>
              <button
                type="button"
                disabled={filters.page >= totalPages || loading}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
              >
                Sau
              </button>
            </nav>
          </section>

          {selection?.baseKey === key && (
            <section
              className="panel ai-usage-calls"
              aria-labelledby="ai-usage-calls-title"
            >
              <header className="ai-usage-section-heading">
                <div>
                  <h2 id="ai-usage-calls-title">
                    Provider calls cho operation
                  </h2>
                  <p>ID operation: {selection.operationId}</p>
                </div>
                <button type="button" onClick={() => setSelection(undefined)}>
                  Đóng chi tiết
                </button>
              </header>
              {callsLoading && (
                <p role="status" aria-busy="true">
                  Đang tải provider calls…
                </p>
              )}
              {visibleCallsError && (
                <div role="alert">
                  <p>{visibleCallsError.message}</p>
                  {!visibleCallsError.forbidden && (
                    <button
                      type="button"
                      onClick={() => setCallsRevision((value) => value + 1)}
                    >
                      Thử lại
                    </button>
                  )}
                </div>
              )}
              {calls &&
                (calls.items.length ? (
                  <>
                    <div className="ai-usage-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>Loại</th>
                            <th>Outcome</th>
                            <th>Usage</th>
                            <th>Input</th>
                            <th>Output</th>
                            <th>Total</th>
                            <th>Cost</th>
                            <th>Latency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {calls.items.map((call) => (
                            <tr key={call.callId}>
                              <td>{call.model}</td>
                              <td>{call.type}</td>
                              <td>{outcomeLabel(call.outcome)}</td>
                              <td>{call.usageStatus}</td>
                              <td>{formatInteger(call.inputTokens)}</td>
                              <td>{formatInteger(call.outputTokens)}</td>
                              <td>{formatInteger(call.totalTokens)}</td>
                              <td>
                                {call.estimatedCost === null
                                  ? "Chưa ước tính"
                                  : `${call.estimatedCost} ${call.currency} · ${call.pricingVersion}`}
                              </td>
                              <td>{call.durationMs} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <nav
                      className="ai-usage-pagination"
                      aria-label="Trang provider calls"
                    >
                      <button
                        type="button"
                        disabled={callsPage <= 1 || callsLoading}
                        onClick={() => setCallsPage((page) => page - 1)}
                      >
                        Trước
                      </button>
                      <span>
                        Trang {callsPage} / {Math.max(1, calls.totalPages)} ·{" "}
                        {formatInteger(calls.total)} calls
                      </span>
                      <button
                        type="button"
                        disabled={callsPage >= calls.totalPages || callsLoading}
                        onClick={() => setCallsPage((page) => page + 1)}
                      >
                        Sau
                      </button>
                    </nav>
                  </>
                ) : (
                  <p role="status">
                    Operation này không có provider call còn trong telemetry.
                  </p>
                ))}
            </section>
          )}
        </>
      )}
    </section>
  );
}
