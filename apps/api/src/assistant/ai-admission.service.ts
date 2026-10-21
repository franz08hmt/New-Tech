import { HttpException, Injectable } from "@nestjs/common";
import type { PilotPrincipal } from "@examate/contracts";
import { DocumentAccessService } from "../documents/document-access.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { DatabaseTransaction } from "../database/database.service.js";
import { aiAdmissionConfig } from "../config/config.js";
import { errorCode, log } from "../common/log.js";
import type { AiOperationDescriptor } from "./ai-usage.service.js";

export type AiAdmissionPermission = "read" | "write";
export interface AiAdmissionReservation {
  readonly operationId: string;
  readonly principal: PilotPrincipal;
  readonly operation: string;
  readonly permission: AiAdmissionPermission;
  readonly plannedProviderCalls: number;
  readonly maxProviderCalls: number;
}

export class AiAdmissionError extends HttpException {
  readonly code: string;

  constructor(code: string, status: number, message: string) {
    super({ code, message }, status);
    this.code = code;
  }
}

function rejection(code: string) {
  const messages: Record<string, string> = {
    AI_DAILY_LIMIT:
      "Bạn đã dùng hết lượt AI hôm nay. Hãy thử lại vào ngày mai.",
    AI_CONCURRENT_LIMIT:
      "Bạn đang có quá nhiều yêu cầu AI chạy cùng lúc. Hãy thử lại sau.",
    AI_FANOUT_LIMIT:
      "Yêu cầu cần vượt giới hạn xử lý AI hiện tại. Hãy thu gọn yêu cầu.",
    AI_ADMISSION_RESERVATION_EXPIRED:
      "Yêu cầu AI đã hết thời gian chờ trước khi bắt đầu. Bạn có thể gửi lại thủ công.",
    AI_ADMISSION_UNAVAILABLE:
      "Không thể kiểm tra lượt dùng AI an toàn lúc này. Hãy thử lại sau.",
  };
  const status = code === "AI_ADMISSION_UNAVAILABLE" ? 503 : 429;
  return new AiAdmissionError(
    code,
    status,
    messages[code] ?? "Yêu cầu AI chưa được chấp nhận.",
  );
}

const admissionStatusByCode: Readonly<Record<string, number>> = {
  AI_DAILY_LIMIT: 429,
  AI_CONCURRENT_LIMIT: 429,
  AI_FANOUT_LIMIT: 429,
  AI_ADMISSION_RESERVATION_EXPIRED: 429,
  AI_ADMISSION_UNAVAILABLE: 503,
  AUTH_REQUIRED: 401,
  WORKSPACE_ACCESS_DENIED: 403,
  ROLE_FORBIDDEN: 403,
};

const admissionMessageByCode: Readonly<Record<string, string>> = {
  AI_DAILY_LIMIT: "Bạn đã dùng hết lượt AI hôm nay. Hãy thử lại vào ngày mai.",
  AI_CONCURRENT_LIMIT:
    "Bạn đang có quá nhiều yêu cầu AI chạy cùng lúc. Hãy thử lại sau.",
  AI_FANOUT_LIMIT:
    "Yêu cầu cần vượt giới hạn xử lý AI hiện tại. Hãy thu gọn yêu cầu.",
  AI_ADMISSION_RESERVATION_EXPIRED:
    "Yêu cầu AI đã hết thời gian chờ trước khi bắt đầu. Bạn có thể gửi lại thủ công.",
  AI_ADMISSION_UNAVAILABLE:
    "Không thể kiểm tra lượt dùng AI an toàn lúc này. Hãy thử lại sau.",
  AUTH_REQUIRED: "Đăng nhập lại để tiếp tục yêu cầu AI.",
  WORKSPACE_ACCESS_DENIED: "Bạn không còn quyền vào workspace này.",
  ROLE_FORBIDDEN: "Vai trò hiện tại không cho phép yêu cầu này.",
};

/** Preserve only known, server-authored admission/auth failures. */
export function safeAiAdmissionError(
  error: unknown,
): AiAdmissionError | undefined {
  if (error instanceof AiAdmissionError) return error;
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  const code =
    typeof response === "object" && response !== null && "code" in response
      ? response.code
      : undefined;
  if (
    typeof code !== "string" ||
    admissionStatusByCode[code] !== error.getStatus()
  )
    return undefined;
  return new AiAdmissionError(
    code,
    admissionStatusByCode[code],
    admissionMessageByCode[code],
  );
}

function permissionFor(
  descriptor: AiOperationDescriptor,
): AiAdmissionPermission {
  return descriptor.operation === "document_index" ? "write" : "read";
}

function providerLimit(
  descriptor: AiOperationDescriptor,
  limits: ReturnType<typeof aiAdmissionConfig>["maxProviderCalls"],
) {
  if (descriptor.operation === "document_index") return limits.documentIndex;
  if (descriptor.operation === "assistant_summary") return limits.summary;
  if (descriptor.mode === "general") return limits.general;
  return limits.documentsQuestion;
}

function initiallyPlannedProviderCalls(descriptor: AiOperationDescriptor) {
  if (
    descriptor.operation !== "assistant_question" &&
    descriptor.operation !== "study_quiz" &&
    descriptor.operation !== "study_flashcards"
  )
    return 0;
  if (descriptor.mode === "workspace") return 0;
  return descriptor.mode === "general" ? 1 : 2;
}

function lockKey(scope: "user" | "workspace", id: string) {
  return `examate.ai.${scope}:${id}`;
}

@Injectable()
export class AiAdmissionService {
  private readonly config = aiAdmissionConfig();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: DocumentAccessService,
  ) {}

  async reserve(
    principal: PilotPrincipal,
    descriptor: AiOperationDescriptor,
    operationId: string,
  ): Promise<AiAdmissionReservation> {
    const verified = principal;
    const permission = permissionFor(descriptor);
    const operation = descriptor.operation;
    const maxProviderCalls = providerLimit(
      descriptor,
      this.config.maxProviderCalls,
    );
    const plannedProviderCalls = initiallyPlannedProviderCalls(descriptor);
    try {
      await this.database.workspaceTransaction(verified, async (tx) => {
        await this.access.authorize(verified, permission, tx);
        if (plannedProviderCalls > maxProviderCalls)
          throw rejection("AI_FANOUT_LIMIT");
        await this.lockScopes(tx, verified);
        await tx.query(
          `WITH stale AS (
             SELECT operation_id FROM public.ai_admission_operations
             WHERE user_id=$1 AND state='reserved'
               AND lease_expires_at < clock_timestamp()
             ORDER BY lease_expires_at LIMIT 100 FOR UPDATE
           ) UPDATE public.ai_admission_operations o SET state='expired',
               lease_expires_at=NULL,finished_at=clock_timestamp()
             FROM stale WHERE o.operation_id=stale.operation_id`,
          [verified.userId],
        );
        await tx.query(
          `WITH expired AS (
             SELECT operation_id FROM public.ai_admission_operations
             WHERE user_id=$1 AND state IN ('completed','failed','cancelled','expired')
               AND expires_at < now()
             ORDER BY expires_at LIMIT 100 FOR UPDATE
           ) DELETE FROM public.ai_admission_operations o
             USING expired e WHERE o.operation_id=e.operation_id`,
          [verified.userId],
        );
        await tx.query(
          `INSERT INTO public.ai_admission_user_daily(user_id,budget_day,used_operations)
           VALUES($1,(timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date,0)
           ON CONFLICT(user_id) DO NOTHING`,
          [verified.userId],
        );
        const daily = await tx.query<{
          budget_day: string;
          used_operations: number;
        }>(
          `SELECT budget_day::text,used_operations
           FROM public.ai_admission_user_daily WHERE user_id=$1 FOR UPDATE`,
          [verified.userId],
        );
        if (!daily.rows[0]) throw rejection("AI_ADMISSION_UNAVAILABLE");
        const date = await tx.query<{ budget_day: string }>(
          `SELECT (timezone('Asia/Ho_Chi_Minh',clock_timestamp()))::date::text AS budget_day`,
        );
        const budgetDay = date.rows[0]?.budget_day;
        if (!budgetDay) throw rejection("AI_ADMISSION_UNAVAILABLE");
        let used = Number(daily.rows[0].used_operations);
        if (daily.rows[0].budget_day !== budgetDay) {
          used = 0;
          await tx.query(
            `UPDATE public.ai_admission_user_daily
             SET budget_day=$2,used_operations=0,updated_at=clock_timestamp()
             WHERE user_id=$1`,
            [verified.userId, budgetDay],
          );
        }
        if (used >= this.config.dailyOperationsPerUser)
          throw rejection("AI_DAILY_LIMIT");

        const counts = await tx.query<{
          user_active: number;
          workspace_active: number;
        }>(
          `SELECT
             count(*) FILTER (WHERE user_id=$1 AND
               (state IN ('running','unknown') OR
                (state='reserved' AND lease_expires_at > clock_timestamp())))::int AS user_active,
             count(*) FILTER (WHERE workspace_id=$2 AND
               (state IN ('running','unknown') OR
                (state='reserved' AND lease_expires_at > clock_timestamp())))::int AS workspace_active
           FROM public.ai_admission_operations
           WHERE user_id=$1 OR workspace_id=$2`,
          [verified.userId, verified.workspaceId],
        );
        if (
          Number(counts.rows[0]?.user_active ?? 0) >=
            this.config.concurrentOperationsPerUser ||
          Number(counts.rows[0]?.workspace_active ?? 0) >=
            this.config.concurrentOperationsPerWorkspace
        )
          throw rejection("AI_CONCURRENT_LIMIT");

        await tx.query(
          `INSERT INTO public.ai_admission_operations(
             operation_id,workspace_id,user_id,operation,state,provider_attempts,
             planned_provider_calls,max_provider_calls,lease_expires_at
           ) VALUES($1,$2,$3,$4,'reserved',0,$5,$6,
             clock_timestamp()+($7::int * interval '1 second'))`,
          [
            operationId,
            verified.workspaceId,
            verified.userId,
            operation,
            plannedProviderCalls,
            maxProviderCalls,
            this.config.undispatchedLeaseSeconds,
          ],
        );
        await tx.query(
          `UPDATE public.ai_admission_user_daily
           SET used_operations=$2,updated_at=clock_timestamp() WHERE user_id=$1`,
          [verified.userId, used + 1],
        );
      });
    } catch (error) {
      if (
        error instanceof AiAdmissionError ||
        (error instanceof HttpException &&
          error.getStatus() >= 400 &&
          error.getStatus() < 500)
      )
        throw error;
      // Reserve has not returned to the caller, so this operation ID has not
      // been dispatched. If COMMIT lost its acknowledgement, inspect this
      // exact reservation and close it only when it is still undispatched.
      await this.reconcileUndispatchedReservation(verified, operationId);
      throw rejection("AI_ADMISSION_UNAVAILABLE");
    }
    return {
      operationId,
      principal: verified,
      operation,
      permission,
      plannedProviderCalls,
      maxProviderCalls,
    };
  }

  async preflight(reservation: AiAdmissionReservation, providerCalls: number) {
    if (
      !Number.isSafeInteger(providerCalls) ||
      providerCalls < 0 ||
      providerCalls > reservation.maxProviderCalls
    )
      throw rejection("AI_FANOUT_LIMIT");
    let expired = false;
    try {
      await this.database.workspaceTransaction(
        reservation.principal,
        async (tx) => {
          await this.access.authorize(
            reservation.principal,
            reservation.permission,
            tx,
          );
          const row = await this.readOperation(tx, reservation, true);
          if (!row || !["reserved", "running"].includes(row.state))
            throw rejection("AI_ADMISSION_RESERVATION_EXPIRED");
          if (
            row.state === "reserved" &&
            row.lease_expires_at &&
            row.lease_active === false
          ) {
            await this.expireReserved(tx, reservation);
            expired = true;
            return;
          }
          if (providerCalls < row.provider_attempts)
            throw rejection("AI_FANOUT_LIMIT");
          await tx.query(
            `UPDATE public.ai_admission_operations
             SET planned_provider_calls=GREATEST(planned_provider_calls,$2)
             WHERE operation_id=$1`,
            [reservation.operationId, providerCalls],
          );
        },
      );
    } catch (error) {
      this.rethrowSafe(error);
    }
    if (expired) throw rejection("AI_ADMISSION_RESERVATION_EXPIRED");
  }

  async beginProviderAttempt(reservation: AiAdmissionReservation) {
    let expired = false;
    try {
      await this.database.workspaceTransaction(
        reservation.principal,
        async (tx) => {
          await this.access.authorize(
            reservation.principal,
            reservation.permission,
            tx,
          );
          await this.lockScopes(tx, reservation.principal);
          const row = await this.readOperation(tx, reservation, true);
          if (!row || !["reserved", "running"].includes(row.state))
            throw rejection("AI_ADMISSION_RESERVATION_EXPIRED");
          if (
            row.state === "reserved" &&
            row.lease_expires_at &&
            row.lease_active === false
          ) {
            await this.expireReserved(tx, reservation);
            expired = true;
            return;
          }
          if (row.provider_attempts >= row.planned_provider_calls)
            throw rejection("AI_FANOUT_LIMIT");
          await tx.query(
            `UPDATE public.ai_admission_operations SET state='running',
               provider_attempts=provider_attempts+1,
               lease_expires_at=NULL,
               started_at=COALESCE(started_at,clock_timestamp())
             WHERE operation_id=$1`,
            [reservation.operationId],
          );
        },
      );
    } catch (error) {
      this.rethrowSafe(error);
    }
    if (expired) throw rejection("AI_ADMISSION_RESERVATION_EXPIRED");
  }

  async finish(
    reservation: AiAdmissionReservation,
    providerStopped: boolean,
    outcome: string,
  ) {
    try {
      await this.database.workspaceTransaction(
        reservation.principal,
        async (tx) => {
          await tx.query(
            `UPDATE public.ai_admission_operations SET
               state=$4,
               lease_expires_at=NULL,
               finished_at=CASE WHEN $4 IN ('completed','failed','cancelled','expired')
                 THEN clock_timestamp() ELSE NULL END
             WHERE operation_id=$1 AND workspace_id=$2 AND user_id=$3
               AND state IN ('reserved','running')`,
            [
              reservation.operationId,
              reservation.principal.workspaceId,
              reservation.principal.userId,
              providerStopped
                ? outcome === "success" || outcome === "unknown"
                  ? "completed"
                  : outcome === "cancelled"
                    ? "cancelled"
                    : "failed"
                : "unknown",
            ],
          );
        },
      );
    } catch (error) {
      // A finalized response must not be replaced by an accounting outage.
      // The row remains active if its final state was not committed.
      try {
        log("error", "ai.admission.finalize_unconfirmed", {
          operation: reservation.operation,
          reasonCode: errorCode(error),
        });
      } catch {
        // Safe diagnostic only.
      }
    }
  }

  private async lockScopes(tx: DatabaseTransaction, principal: PilotPrincipal) {
    // Every reserve/dispatch obtains these two transaction locks in this order.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      lockKey("user", principal.userId),
    ]);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      lockKey("workspace", principal.workspaceId),
    ]);
  }

  private async readOperation(
    tx: DatabaseTransaction,
    reservation: AiAdmissionReservation,
    forUpdate: boolean,
  ) {
    const result = await tx.query<{
      state: string;
      provider_attempts: number;
      planned_provider_calls: number;
      lease_expires_at: string | null;
      lease_active: boolean | null;
    }>(
      `SELECT state,provider_attempts,planned_provider_calls,lease_expires_at::text,
         lease_expires_at > clock_timestamp() AS lease_active
       FROM public.ai_admission_operations WHERE operation_id=$1
         AND workspace_id=$2 AND user_id=$3${forUpdate ? " FOR UPDATE" : ""}`,
      [
        reservation.operationId,
        reservation.principal.workspaceId,
        reservation.principal.userId,
      ],
    );
    return result.rows[0];
  }

  private async expireReserved(
    tx: DatabaseTransaction,
    reservation: AiAdmissionReservation,
  ) {
    await tx.query(
      `UPDATE public.ai_admission_operations SET state='expired',
         lease_expires_at=NULL,finished_at=clock_timestamp()
       WHERE operation_id=$1 AND workspace_id=$2 AND user_id=$3
         AND state='reserved'`,
      [
        reservation.operationId,
        reservation.principal.workspaceId,
        reservation.principal.userId,
      ],
    );
  }

  private async reconcileUndispatchedReservation(
    principal: PilotPrincipal,
    operationId: string,
  ) {
    try {
      await this.database.workspaceTransaction(principal, async (tx) => {
        await this.access.authorize(principal, "read", tx);
        const result = await tx.query<{ provider_attempts: number }>(
          `SELECT provider_attempts FROM public.ai_admission_operations
           WHERE operation_id=$1 AND workspace_id=$2 AND user_id=$3
             AND state='reserved' FOR UPDATE`,
          [operationId, principal.workspaceId, principal.userId],
        );
        if (result.rows[0]?.provider_attempts !== 0) return;
        await tx.query(
          `UPDATE public.ai_admission_operations SET state='failed',
             lease_expires_at=NULL,finished_at=clock_timestamp()
           WHERE operation_id=$1 AND workspace_id=$2 AND user_id=$3
             AND state='reserved' AND provider_attempts=0`,
          [operationId, principal.workspaceId, principal.userId],
        );
      });
    } catch (error) {
      try {
        log("error", "ai.admission.reserve_reconciliation_unconfirmed", {
          reasonCode: errorCode(error),
        });
      } catch {
        // Keep admission failure safe even if its diagnostic sink is down.
      }
    }
  }

  private rethrowSafe(error: unknown): never {
    if (
      error instanceof AiAdmissionError ||
      (error instanceof HttpException &&
        error.getStatus() >= 400 &&
        error.getStatus() < 500)
    )
      throw error;
    throw rejection("AI_ADMISSION_UNAVAILABLE");
  }
}
