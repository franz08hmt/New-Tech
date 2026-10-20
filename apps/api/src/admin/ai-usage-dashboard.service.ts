import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiUsageDashboardQuery, PilotPrincipal } from "@examate/contracts";
import { requireManager } from "../auth/principal.js";
import { DatabaseService } from "../database/database.service.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import type {
  AiUsageCallsQuery,
  AiUsageCostBreakdownQuery,
} from "./ai-usage-dashboard-query.js";

const sortSql = {
  started_at: "o.started_at",
  duration_ms: "o.duration_ms",
  operation: "o.operation",
  outcome: "o.outcome",
} as const;
const pageSortSql = {
  started_at: "started_at",
  duration_ms: "duration_ms",
  operation: "operation",
  outcome: "outcome",
} as const;

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T | null) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

@Injectable()
export class AiUsageDashboardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async overview(
    principal: PilotPrincipal | undefined,
    query: AiUsageDashboardQuery,
  ) {
    const verified = principal;
    const selectedSort = query.sort ?? "started_at";
    const sort = sortSql[selectedSort];
    const pageSort = pageSortSql[selectedSort];
    const direction = query.direction === "asc" ? "ASC" : "DESC";
    const offset = (query.page - 1) * query.pageSize;
    return this.database.workspaceTransaction(verified, async (tx) => {
      const current = await this.access.authorize(verified, "read", tx);
      requireManager(current);
      const result = await tx.query(
        `WITH filtered_operations AS MATERIALIZED (
           SELECT o.operation_id,o.workspace_id,o.user_id,o.operation,o.mode,o.prompt_id,
             o.prompt_version,o.outcome,o.provider_call_count,o.started_at,o.completed_at,
             o.duration_ms,o.expires_at
           FROM public.ai_usage_operations o
           WHERE o.workspace_id=$1
             AND o.expires_at>statement_timestamp()
             AND o.started_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
             AND o.started_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
             AND ($4::text IS NULL OR o.operation=$4)
             AND ($5::text IS NULL OR o.mode=$5)
             AND ($6::text IS NULL OR o.outcome=$6)
             AND ($7::text IS NULL OR EXISTS (
               SELECT 1 FROM public.ai_usage_provider_calls model_call
               WHERE model_call.operation_id=o.operation_id
                 AND model_call.workspace_id=o.workspace_id
                 AND model_call.user_id=o.user_id
                 AND model_call.expires_at>statement_timestamp()
                 AND model_call.model=$7
             ))
         ), filtered_calls AS MATERIALIZED (
           SELECT c.call_id,c.operation_id,c.workspace_id,c.user_id,c.provider,c.model,
             c.call_type,c.prompt_id,c.prompt_version,c.outcome,c.usage_status,
             c.input_tokens,c.output_tokens,c.total_tokens,c.cost_status,c.estimated_cost,
             c.pricing_version,c.currency,c.duration_ms,c.started_at,c.completed_at
           FROM filtered_operations o
           JOIN public.ai_usage_provider_calls c
             ON c.operation_id=o.operation_id AND c.workspace_id=o.workspace_id
            AND c.user_id=o.user_id
           WHERE c.expires_at>statement_timestamp()
             AND ($7::text IS NULL OR c.model=$7)
         ), op_metrics AS (
           SELECT count(*)::text AS total,
             count(*) FILTER (WHERE outcome='success')::text AS success,
             count(*) FILTER (WHERE outcome='error')::text AS error,
             count(*) FILTER (WHERE outcome='timeout')::text AS timeout,
             count(*) FILTER (WHERE outcome='cancelled')::text AS cancelled,
             count(*) FILTER (WHERE outcome='rejected')::text AS rejected,
             count(*) FILTER (WHERE outcome='unknown')::text AS unknown,
             count(*)::text AS sample_count,
             round(avg(duration_ms)::numeric,2)::text AS avg_ms,
             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric,2)::text AS p95_ms
           FROM filtered_operations
         ), call_metrics AS (
           SELECT count(*)::text AS total,
             count(*) FILTER (WHERE outcome='success')::text AS success,
             count(*) FILTER (WHERE outcome='error')::text AS error,
             count(*) FILTER (WHERE outcome='timeout')::text AS timeout,
             count(*) FILTER (WHERE outcome='cancelled')::text AS cancelled,
             count(*) FILTER (WHERE outcome='unknown')::text AS unknown,
             count(*) FILTER (WHERE usage_status='complete')::text AS usage_complete,
             count(*) FILTER (WHERE usage_status='partial')::text AS usage_partial,
             count(*) FILTER (WHERE usage_status='missing')::text AS usage_missing,
             count(*) FILTER (WHERE usage_status='invalid')::text AS usage_invalid,
             count(input_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS input_samples,
             sum(input_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS input_tokens,
             count(output_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS output_samples,
             sum(output_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS output_tokens,
             count(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS total_samples,
             sum(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS total_tokens,
             count(*) FILTER (WHERE cost_status='estimated' AND estimated_cost IS NOT NULL)::text AS estimated_calls,
             count(*) FILTER (WHERE cost_status<>'estimated' OR estimated_cost IS NULL)::text AS unknown_cost_calls,
             round(avg(duration_ms)::numeric,2)::text AS avg_ms,
             round(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::numeric,2)::text AS p95_ms
           FROM filtered_calls
         ), call_rollup AS (
           SELECT operation_id,count(*)::text AS visible_calls,
             count(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS total_token_samples,
             sum(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS known_total_tokens
           FROM filtered_calls GROUP BY operation_id
         ), daily AS (
           SELECT (o.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
             count(*)::text AS operations,
             (SELECT count(*)::text FROM filtered_calls c WHERE c.operation_id=o.operation_id) AS calls
           FROM filtered_operations o GROUP BY day,o.operation_id
         ), daily_aggregate AS (
           SELECT day,sum(operations::bigint)::text AS operations,
             sum(calls::bigint)::text AS provider_calls
           FROM daily GROUP BY day
         ), days AS (
           SELECT generate_series($2::date,$3::date,interval '1 day')::date AS day
         ), model_aggregate AS (
           SELECT model,count(*)::text AS calls,count(DISTINCT operation_id)::text AS operations,
             count(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS token_samples,
             sum(total_tokens) FILTER (WHERE usage_status IN ('complete','partial'))::text AS known_total_tokens
           FROM filtered_calls GROUP BY model
         ), ranked_models AS (
           SELECT model_aggregate.*,
             row_number() OVER (ORDER BY calls::bigint DESC,model) AS model_rank
           FROM model_aggregate
         ), visible_models AS (
           SELECT * FROM ranked_models WHERE model_rank<=20
         ), model_coverage AS (
           SELECT count(*)::text AS total_models,
             count(*) FILTER (WHERE model_rank<=20)::text AS displayed_models,
             (count(*)-count(*) FILTER (WHERE model_rank<=20))::text AS omitted_models,
             COALESCE(sum(calls::numeric),0)::text AS total_provider_calls,
             COALESCE((SELECT sum(calls::numeric) FROM visible_models),0)::text AS displayed_provider_calls,
             (COALESCE(sum(calls::numeric),0)-COALESCE((SELECT sum(calls::numeric) FROM visible_models),0))::text AS omitted_provider_calls,
             CASE WHEN COALESCE(sum(token_samples::numeric),0)=0 THEN NULL
               ELSE sum(known_total_tokens::numeric)::text END AS known_total_tokens,
             CASE WHEN COALESCE((SELECT sum(token_samples::numeric) FROM visible_models),0)=0 THEN NULL
               ELSE (SELECT sum(known_total_tokens::numeric)::text FROM visible_models) END AS displayed_known_total_tokens,
             CASE WHEN COALESCE(sum(token_samples::numeric),0)=0 THEN NULL
               ELSE (sum(known_total_tokens::numeric)-COALESCE((SELECT sum(known_total_tokens::numeric) FROM visible_models),0))::text END AS omitted_known_total_tokens,
             COALESCE(sum(token_samples::numeric),0)::text AS token_samples,
             COALESCE((SELECT sum(token_samples::numeric) FROM visible_models),0)::text AS displayed_token_samples,
             (COALESCE(sum(token_samples::numeric),0)-COALESCE((SELECT sum(token_samples::numeric) FROM visible_models),0))::text AS omitted_token_samples
           FROM ranked_models
         ), daily_json AS (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'day',to_char(days.day,'YYYY-MM-DD'),
             'operations',COALESCE(daily_aggregate.operations,'0'),
             'providerCalls',COALESCE(daily_aggregate.provider_calls,'0')
           ) ORDER BY days.day),'[]'::jsonb) AS value
           FROM days LEFT JOIN daily_aggregate USING(day)
         ), model_json AS (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'model',model,'providerCalls',calls,'operations',operations,
             'knownTotalTokens',known_total_tokens,'tokenSamples',token_samples
           ) ORDER BY calls::bigint DESC,model),'[]'::jsonb) AS value FROM visible_models
         ), page_rows AS (
           SELECT o.operation_id,o.operation,o.mode,o.prompt_id,o.prompt_version,
             o.outcome,o.started_at,o.duration_ms,
             COALESCE(r.visible_calls,'0') AS provider_calls,
             COALESCE(r.known_total_tokens,'0') AS known_total_tokens,
             COALESCE(r.total_token_samples,'0') AS total_token_samples
           FROM filtered_operations o LEFT JOIN call_rollup r USING(operation_id)
           ORDER BY ${sort} ${direction} NULLS LAST,o.operation_id ${direction}
           LIMIT $8 OFFSET $9
         ), page_json AS (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'operationId',operation_id,'operation',operation,'mode',mode,
             'promptId',prompt_id,'promptVersion',prompt_version,'outcome',outcome,
             'startedAt',started_at,'durationMs',duration_ms,'providerCalls',provider_calls,
             'knownTotalTokens',CASE WHEN total_token_samples='0' THEN NULL ELSE known_total_tokens END,
             'totalTokenSamples',total_token_samples
           ) ORDER BY ${pageSort} ${direction} NULLS LAST,operation_id ${direction}),'[]'::jsonb) AS value
           FROM page_rows
         )
         SELECT jsonb_build_object(
           'operations',jsonb_build_object(
             'total',op_metrics.total,
             'outcomes',jsonb_build_object('success',op_metrics.success,'error',op_metrics.error,
               'timeout',op_metrics.timeout,'cancelled',op_metrics.cancelled,
               'rejected',op_metrics.rejected,'unknown',op_metrics.unknown),
             'latency',jsonb_build_object('sampleCount',op_metrics.sample_count,
               'averageMs',op_metrics.avg_ms,'p95Ms',op_metrics.p95_ms)
           ),
           'providerCalls',jsonb_build_object(
             'total',call_metrics.total,
             'outcomes',jsonb_build_object('success',call_metrics.success,'error',call_metrics.error,
               'timeout',call_metrics.timeout,'cancelled',call_metrics.cancelled,'unknown',call_metrics.unknown),
             'usage',jsonb_build_object('complete',usage_complete,'partial',usage_partial,
               'missing',usage_missing,'invalid',usage_invalid),
             'tokens',jsonb_build_object(
               'input',CASE WHEN input_samples='0' THEN NULL ELSE input_tokens END,
               'inputSamples',input_samples,
               'output',CASE WHEN output_samples='0' THEN NULL ELSE output_tokens END,
               'outputSamples',output_samples,
               'total',CASE WHEN total_samples='0' THEN NULL ELSE total_tokens END,
               'totalSamples',total_samples
             ),
             'cost',jsonb_build_object('estimatedCalls',estimated_calls,
             'unknownCalls',unknown_cost_calls),
             'latency',jsonb_build_object('sampleCount',call_metrics.total,
               'averageMs',call_metrics.avg_ms,'p95Ms',call_metrics.p95_ms)
           ),
           'daily',daily_json.value,'models',model_json.value,
           'modelCoverage',jsonb_build_object(
             'totalModels',model_coverage.total_models,
             'displayedModels',model_coverage.displayed_models,
             'omittedModels',model_coverage.omitted_models,
             'totalProviderCalls',model_coverage.total_provider_calls,
             'displayedProviderCalls',model_coverage.displayed_provider_calls,
             'omittedProviderCalls',model_coverage.omitted_provider_calls,
             'knownTotalTokens',model_coverage.known_total_tokens,
             'displayedKnownTotalTokens',model_coverage.displayed_known_total_tokens,
             'omittedKnownTotalTokens',model_coverage.omitted_known_total_tokens,
             'tokenSamples',model_coverage.token_samples,
             'displayedTokenSamples',model_coverage.displayed_token_samples,
             'omittedTokenSamples',model_coverage.omitted_token_samples
           ),
           'operationsPage',page_json.value,'totalPages',
             CASE WHEN op_metrics.total::bigint=0 THEN 0
               ELSE ceil(op_metrics.total::numeric/$8)::int END
         ) AS dashboard
         FROM op_metrics CROSS JOIN call_metrics CROSS JOIN daily_json CROSS JOIN model_json
           CROSS JOIN model_coverage CROSS JOIN page_json`,
        [
          current.workspaceId,
          query.from,
          query.to,
          query.operation ?? null,
          query.mode ?? null,
          query.outcome ?? null,
          query.model ?? null,
          query.pageSize,
          offset,
        ],
      );
      const data = jsonValue<Record<string, unknown>>(
        result.rows[0]?.dashboard,
        {},
      );
      return {
        from: query.from,
        to: query.to,
        timezone: "Asia/Ho_Chi_Minh" as const,
        modelCohort: query.model
          ? "operations_with_matching_provider_call; calls_limited_to_selected_model"
          : "all_non_expired_provider_calls_of_matching_operations",
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Number(data.totalPages ?? 0),
        summary: {
          operations: data.operations,
          providerCalls: data.providerCalls,
          daily: jsonValue(data.daily, []),
          models: jsonValue(data.models, []),
          modelCoverage: jsonValue(data.modelCoverage, {
            totalModels: "0",
            displayedModels: "0",
            omittedModels: "0",
            totalProviderCalls: "0",
            displayedProviderCalls: "0",
            omittedProviderCalls: "0",
            knownTotalTokens: null,
            displayedKnownTotalTokens: null,
            omittedKnownTotalTokens: null,
            tokenSamples: "0",
            displayedTokenSamples: "0",
            omittedTokenSamples: "0",
          }),
          telemetryIsBestEffort: true,
          ttft: "not_collected",
          monetaryBudget: false,
        },
        operations: {
          items: jsonValue(data.operationsPage, []),
          total:
            (data.operations as { total?: string } | undefined)?.total ?? "0",
          page: query.page,
          pageSize: query.pageSize,
          totalPages: Number(data.totalPages ?? 0),
        },
      };
    });
  }

  async providerCalls(
    principal: PilotPrincipal | undefined,
    operationId: string,
    query: AiUsageCallsQuery,
  ) {
    return this.database.workspaceTransaction(principal, async (tx) => {
      const current = await this.access.authorize(principal, "read", tx);
      requireManager(current);
      const result = await tx.query(
        `WITH target AS MATERIALIZED (
           SELECT operation_id,workspace_id,user_id FROM public.ai_usage_operations
           WHERE operation_id=$1 AND workspace_id=$2 AND expires_at>statement_timestamp()
         ), scoped_calls AS MATERIALIZED (
           SELECT c.call_id,c.operation_id,c.model,c.call_type,c.outcome,c.usage_status,
             c.input_tokens,c.output_tokens,c.total_tokens,c.cost_status,c.estimated_cost,
             c.pricing_version,c.currency,c.duration_ms,c.started_at
           FROM target o JOIN public.ai_usage_provider_calls c
             ON c.operation_id=o.operation_id AND c.workspace_id=o.workspace_id AND c.user_id=o.user_id
           WHERE c.expires_at>statement_timestamp()
             AND ($5::text IS NULL OR c.model=$5)
         ), selected AS (
           SELECT * FROM scoped_calls ORDER BY started_at DESC,call_id DESC
           LIMIT $3 OFFSET $4
         )
         SELECT (SELECT count(*)::text FROM scoped_calls) AS total,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'callId',call_id,'model',model,'type',call_type,'outcome',outcome,
             'usageStatus',usage_status,'inputTokens',input_tokens::text,
             'outputTokens',output_tokens::text,'totalTokens',total_tokens::text,
             'costStatus',cost_status,'estimatedCost',estimated_cost::text,
             'pricingVersion',pricing_version,'currency',currency,
             'durationMs',duration_ms,'startedAt',started_at
           ) ORDER BY started_at DESC,call_id DESC) FROM selected),'[]'::jsonb) AS items,
           EXISTS(SELECT 1 FROM target) AS operation_exists`,
        [
          operationId,
          current.workspaceId,
          query.pageSize,
          (query.page - 1) * query.pageSize,
          query.model ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row?.operation_exists)
        throw new NotFoundException({
          code: "AI_USAGE_OPERATION_NOT_FOUND",
          message: "Không tìm thấy operation trong workspace hiện tại.",
        });
      const total = String(row.total ?? "0");
      const totalPages = Math.ceil(Number(total) / query.pageSize);
      return {
        operationId,
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
        items: jsonValue(row.items, []),
      };
    });
  }

  async costBreakdown(
    principal: PilotPrincipal | undefined,
    query: AiUsageCostBreakdownQuery,
  ) {
    return this.database.workspaceTransaction(principal, async (tx) => {
      const current = await this.access.authorize(principal, "read", tx);
      requireManager(current);
      const result = await tx.query(
        `WITH filtered_operations AS MATERIALIZED (
           SELECT o.operation_id,o.workspace_id,o.user_id
           FROM public.ai_usage_operations o
           WHERE o.workspace_id=$1
             AND o.expires_at>statement_timestamp()
             AND o.started_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
             AND o.started_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
             AND ($4::text IS NULL OR o.operation=$4)
             AND ($5::text IS NULL OR o.mode=$5)
             AND ($6::text IS NULL OR o.outcome=$6)
             AND ($7::text IS NULL OR EXISTS (
               SELECT 1 FROM public.ai_usage_provider_calls model_call
               WHERE model_call.operation_id=o.operation_id
                 AND model_call.workspace_id=o.workspace_id
                 AND model_call.user_id=o.user_id
                 AND model_call.expires_at>statement_timestamp()
                 AND model_call.model=$7
             ))
         ), priced_calls AS MATERIALIZED (
           SELECT c.currency,c.pricing_version,c.estimated_cost
           FROM filtered_operations o
           JOIN public.ai_usage_provider_calls c
             ON c.operation_id=o.operation_id AND c.workspace_id=o.workspace_id
            AND c.user_id=o.user_id
           WHERE c.expires_at>statement_timestamp()
             AND ($7::text IS NULL OR c.model=$7)
             AND c.cost_status='estimated' AND c.estimated_cost IS NOT NULL
         ), grouped AS (
           SELECT currency::text AS currency,NULL::text AS pricing_version,
             count(*)::text AS calls,sum(estimated_cost)::text AS estimated_cost,
             count(DISTINCT pricing_version)::text AS pricing_version_count
           FROM priced_calls WHERE $8::text='currency' GROUP BY currency
           UNION ALL
           SELECT currency::text AS currency,pricing_version::text AS pricing_version,
             count(*)::text AS calls,sum(estimated_cost)::text AS estimated_cost,
             NULL::text AS pricing_version_count
           FROM priced_calls
           WHERE $8::text='pricing_version' AND currency=$9
           GROUP BY currency,pricing_version
         ), metrics AS (
           SELECT count(*)::text AS total_groups,
             COALESCE(sum(calls::numeric),0)::text AS total_calls,
             CASE WHEN $8::text='pricing_version'
               THEN COALESCE((SELECT sum(estimated_cost) FROM priced_calls WHERE currency=$9),0)::text
               ELSE NULL END AS total_estimated_cost
           FROM grouped
         ), selected AS (
           SELECT * FROM grouped ORDER BY currency,pricing_version NULLS FIRST
           LIMIT $10 OFFSET $11
         ), items AS (
           SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'currency',currency,'pricingVersion',pricing_version,
             'pricingVersionCount',pricing_version_count,
             'estimatedCalls',calls,'estimatedCost',estimated_cost
           ) ORDER BY currency,pricing_version NULLS FIRST),'[]'::jsonb) AS value
           FROM selected
         )
         SELECT metrics.total_groups,metrics.total_calls,metrics.total_estimated_cost,
           CASE WHEN metrics.total_groups::bigint=0 THEN 0
             ELSE ceil(metrics.total_groups::numeric/$10)::int END AS total_pages,
           items.value AS items
         FROM metrics CROSS JOIN items`,
        [
          current.workspaceId,
          query.from,
          query.to,
          query.operation ?? null,
          query.mode ?? null,
          query.outcome ?? null,
          query.model ?? null,
          query.group,
          query.currency ?? null,
          query.pageSize,
          (query.page - 1) * query.pageSize,
        ],
      );
      const row = result.rows[0];
      return {
        group: query.group,
        currency: query.currency ?? null,
        page: query.page,
        pageSize: query.pageSize,
        totalGroups: String(row?.total_groups ?? "0"),
        totalEstimatedCalls: String(row?.total_calls ?? "0"),
        totalPages: Number(row?.total_pages ?? 0),
        totalEstimatedCost: row?.total_estimated_cost ?? null,
        items: jsonValue(row?.items, []),
      };
    });
  }
}
