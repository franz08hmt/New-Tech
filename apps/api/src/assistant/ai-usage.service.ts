import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { HttpException, Injectable } from "@nestjs/common";
import type { PilotPrincipal } from "@examate/contracts";
import { requirePrincipal } from "../auth/principal.js";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { DatabaseService } from "../database/database.service.js";
import { errorCode, log, requestContext } from "../common/log.js";
import type { PromptReference } from "./prompt-registry.js";
import {
  estimateTokenCost,
  normalizeTokenUsage,
  type CostEstimate,
  type TokenUsage,
} from "./ai-usage-pricing.js";

export type AiOperationName =
  | "assistant_question"
  | "assistant_summary"
  | "assistant_course_info"
  | "document_index";
export type AiOperationMode = "general" | "documents" | "workspace";
export type AiOperationOutcome =
  "success" | "error" | "timeout" | "cancelled" | "rejected" | "unknown";
export type AiProviderCallType =
  | "generation"
  | "generation_stream"
  | "embedding_query"
  | "embedding_document_batch"
  | "ocr_page";
export type AiProviderOutcome =
  "success" | "error" | "timeout" | "cancelled" | "unknown";

export interface AiOperationDescriptor {
  readonly operation: AiOperationName;
  readonly mode?: AiOperationMode;
  readonly prompt?: PromptReference;
}

export interface AiProviderCallDescriptor {
  readonly type: AiProviderCallType;
  readonly provider: "google";
  readonly model: string;
  readonly prompt?: PromptReference;
}

interface MutableProviderCall {
  callId: string;
  provider: "google";
  model: string;
  type: AiProviderCallType;
  promptId: string | null;
  promptVersion: string | null;
  outcome: AiProviderOutcome;
  usage: TokenUsage;
  cost: CostEstimate;
  startedAt: Date;
  completedAt: Date;
  startedClock: number;
  durationMs: number;
  finished: boolean;
}

interface OperationScope {
  operationId: string;
  requestId: string;
  principal: PilotPrincipal;
  descriptor: AiOperationDescriptor;
  startedAt: Date;
  startedClock: number;
  outcome: AiOperationOutcome;
  calls: MutableProviderCall[];
}

export interface ProviderCallToken {
  readonly scope: OperationScope;
  readonly call: MutableProviderCall;
}

const persistenceDeadlineMs = 1_800;
const MAX_DURATION_MS = 2_147_483_647;

function logPersistenceSignal(
  event: "ai.usage.persistence_failed" | "ai.usage.persistence_unconfirmed",
  fields: Record<string, unknown>,
) {
  try {
    log("error", event, fields);
  } catch {
    // Telemetry and its diagnostic must not replace a determined response.
  }
}

function duration(startedClock: number) {
  const elapsed = Math.round(performance.now() - startedClock);
  return Number.isFinite(elapsed)
    ? Math.min(MAX_DURATION_MS, Math.max(0, elapsed))
    : MAX_DURATION_MS;
}

function safePrompt(prompt?: PromptReference) {
  if (
    !prompt ||
    !/^[a-z][a-z0-9._-]{1,79}$/.test(prompt.id) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(prompt.version)
  )
    return { id: null, version: null };
  return { id: prompt.id, version: prompt.version };
}

function safeModel(model: string) {
  return /^gemini-[A-Za-z0-9._-]{1,77}$/.test(model) ? model : "gemini-unknown";
}

export function classifyAiOutcome(error: unknown): AiOperationOutcome {
  const coded = error as { kind?: unknown; code?: unknown } | null;
  if (
    (error instanceof Error && error.name === "AbortError") ||
    (error instanceof Error && error.name === "CanceledError")
  )
    return "cancelled";
  if (
    error instanceof HttpException &&
    (error.getStatus() === 401 ||
      error.getStatus() === 403 ||
      (error.getStatus() >= 400 && error.getStatus() < 500))
  )
    return "rejected";
  if (
    error instanceof Error &&
    "rejection" in error &&
    typeof (error as { rejection?: unknown }).rejection === "string"
  )
    return "rejected";
  if (
    (error instanceof Error && coded?.kind === "timeout") ||
    coded?.code === "OCR_TIMEOUT"
  )
    return "timeout";
  return "error";
}

export function classifyProviderOutcome(error: unknown): AiProviderOutcome {
  const outcome = classifyAiOutcome(error);
  return outcome === "rejected" ? "error" : outcome;
}

@Injectable()
export class AiUsageService {
  private readonly current = new AsyncLocalStorage<OperationScope>();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async runOperation<T>(
    principal: PilotPrincipal | undefined,
    descriptor: AiOperationDescriptor,
    work: () => Promise<T>,
  ): Promise<T> {
    // Direct service/unit calls without an authenticated controller context do
    // not manufacture attribution or an operation identity.
    if (!principal) return work();
    if (this.current.getStore()) return work();
    const verified = requirePrincipal(principal);
    const rawRequestId = requestContext.getStore()?.requestId;
    const scope: OperationScope = {
      operationId: randomUUID(),
      requestId:
        typeof rawRequestId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(rawRequestId)
          ? rawRequestId
          : randomUUID(),
      principal: verified,
      descriptor: {
        ...descriptor,
        prompt: descriptor.prompt
          ? {
              id: descriptor.prompt.id,
              version: descriptor.prompt.version,
            }
          : undefined,
      },
      startedAt: new Date(),
      startedClock: performance.now(),
      outcome: "unknown",
      calls: [],
    };
    return this.current.run(scope, async () => {
      try {
        const result = await work();
        if (
          scope.outcome === "unknown" &&
          scope.calls.every((call) => call.outcome !== "unknown")
        )
          scope.outcome = "success";
        return result;
      } catch (error) {
        if (scope.outcome === "unknown")
          scope.outcome = classifyAiOutcome(error);
        throw error;
      } finally {
        await this.persistBounded(scope);
      }
    });
  }

  markOutcome(outcome: AiOperationOutcome) {
    const scope = this.current.getStore();
    if (scope) scope.outcome = outcome;
  }

  startProviderCall(
    descriptor: AiProviderCallDescriptor,
  ): ProviderCallToken | undefined {
    const scope = this.current.getStore();
    if (!scope) return undefined;
    const prompt = safePrompt(descriptor.prompt);
    const startedAt = new Date();
    const call: MutableProviderCall = {
      callId: randomUUID(),
      provider: descriptor.provider,
      model: safeModel(descriptor.model),
      type: descriptor.type,
      promptId: prompt.id,
      promptVersion: prompt.version,
      outcome: "unknown",
      usage: {
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        status: "missing",
      },
      cost: {
        status: "unknown_usage",
        estimatedCost: null,
        pricingVersion: null,
        currency: null,
      },
      startedAt,
      completedAt: startedAt,
      startedClock: performance.now(),
      durationMs: 0,
      finished: false,
    };
    scope.calls.push(call);
    return { scope, call };
  }

  updateProviderUsage(token: ProviderCallToken | undefined, raw: unknown) {
    if (!token || token.call.finished) return;
    token.call.usage = normalizeTokenUsage(raw);
    token.call.cost = estimateTokenCost(token.call.model, token.call.usage);
  }

  updateProviderModel(token: ProviderCallToken | undefined, model: string) {
    if (!token || token.call.finished) return;
    token.call.model = safeModel(model);
    token.call.cost = estimateTokenCost(token.call.model, token.call.usage);
  }

  finishProviderCall(
    token: ProviderCallToken | undefined,
    outcome: AiProviderOutcome,
    rawUsage?: unknown,
  ) {
    if (!token || token.call.finished) return;
    if (rawUsage !== undefined) this.updateProviderUsage(token, rawUsage);
    if (outcome !== "success" && token.call.usage.status === "complete") {
      token.call.usage = { ...token.call.usage, status: "partial" };
      token.call.cost = estimateTokenCost(token.call.model, token.call.usage);
    }
    token.call.outcome = outcome;
    token.call.completedAt = new Date();
    token.call.durationMs = duration(token.call.startedClock);
    token.call.finished = true;
  }

  private async persistBounded(scope: OperationScope) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    const persisted = this.persist(scope).then(
      () => true,
      (error: unknown) => {
        logPersistenceSignal("ai.usage.persistence_failed", {
          operation: scope.descriptor.operation,
          reasonCode: errorCode(error),
          providerCallCount: scope.calls.length,
        });
        return false;
      },
    );
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve(false);
      }, persistenceDeadlineMs);
    });
    const ok = await Promise.race([persisted, timeout]);
    clearTimeout(timer);
    if (!ok && timedOut)
      logPersistenceSignal("ai.usage.persistence_unconfirmed", {
        operation: scope.descriptor.operation,
        providerCallCount: scope.calls.length,
      });
  }

  private async persist(scope: OperationScope) {
    const prompt = safePrompt(scope.descriptor.prompt);
    await this.database.workspaceTransaction(scope.principal, async (tx) => {
      await tx.query("SET LOCAL statement_timeout = '1500ms'");
      await this.access.authorize(scope.principal, "read", tx);
      await tx.query(
        `INSERT INTO public.ai_usage_operations (
          operation_id,request_id,workspace_id,user_id,operation,mode,prompt_id,
          prompt_version,outcome,provider_call_count,started_at,completed_at,duration_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          scope.operationId,
          scope.requestId,
          scope.principal.workspaceId,
          scope.principal.userId,
          scope.descriptor.operation,
          scope.descriptor.mode ?? null,
          prompt.id,
          prompt.version,
          scope.outcome,
          scope.calls.length,
          scope.startedAt.toISOString(),
          new Date().toISOString(),
          duration(scope.startedClock),
        ],
      );
      if (scope.calls.length) {
        const calls = scope.calls.map((call) => ({
          call_id: call.callId,
          operation_id: scope.operationId,
          workspace_id: scope.principal.workspaceId,
          user_id: scope.principal.userId,
          provider: call.provider,
          model: call.model,
          call_type: call.type,
          prompt_id: call.promptId,
          prompt_version: call.promptVersion,
          outcome: call.outcome,
          usage_status: call.usage.status,
          input_tokens: call.usage.inputTokens,
          output_tokens: call.usage.outputTokens,
          total_tokens: call.usage.totalTokens,
          cost_status: call.cost.status,
          estimated_cost: call.cost.estimatedCost,
          pricing_version: call.cost.pricingVersion,
          currency: call.cost.currency,
          duration_ms: call.durationMs,
          started_at: call.startedAt.toISOString(),
          completed_at: call.completedAt.toISOString(),
        }));
        await tx.query(
          `INSERT INTO public.ai_usage_provider_calls (
            call_id,operation_id,workspace_id,user_id,provider,model,call_type,
            prompt_id,prompt_version,outcome,usage_status,input_tokens,output_tokens,
            total_tokens,cost_status,estimated_cost,pricing_version,currency,duration_ms,
            started_at,completed_at
          ) SELECT call_id,operation_id,workspace_id,user_id,provider,model,call_type,
            prompt_id,prompt_version,outcome,usage_status,input_tokens,output_tokens,
            total_tokens,cost_status,estimated_cost,pricing_version,currency,duration_ms,
            started_at,completed_at
          FROM jsonb_to_recordset($1::jsonb) AS calls(
            call_id uuid,operation_id uuid,workspace_id uuid,user_id uuid,provider text,
            model text,call_type text,prompt_id text,prompt_version text,outcome text,
            usage_status text,input_tokens bigint,output_tokens bigint,total_tokens bigint,
            cost_status text,estimated_cost numeric,pricing_version text,currency text,
            duration_ms integer,started_at timestamptz,completed_at timestamptz
          )`,
          [JSON.stringify(calls)],
        );
      }
    });
  }
}
