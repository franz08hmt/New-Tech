import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Post,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantExceptionFilter } from "./assistant-exception.filter.js";
import { AssistantService } from "./assistant.service.js";
import { WorkspaceAssistantService } from "./workspace-assistant.service.js";
import type { AuthRequest } from "../auth/auth.service.js";
import type {
  AssistantAnswerIdHeader,
  AssistantChatResponse,
} from "@examate/contracts";
import { AnswerReceiptService } from "./answer-receipt.service.js";
import { requestContext } from "../common/log.js";
import { randomUUID } from "node:crypto";
import { AssistantError } from "./assistant.types.js";
import type { AssistantStreamEvent } from "@examate/contracts";

interface StreamRequest extends AuthRequest {
  on(event: "aborted", listener: () => void): this;
  off(event: "aborted", listener: () => void): this;
}

interface StreamResponse {
  status(code: number): this;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?(): void;
  on(event: "close" | "drain", listener: () => void): this;
  off(event: "close" | "drain", listener: () => void): this;
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
}

function assistantStreamFailure(error: unknown): AssistantStreamEvent {
  if (error instanceof AssistantError) {
    const details = {
      not_configured: ["AI_NOT_CONFIGURED", "AI chưa được cấu hình."],
      timeout: ["AI_TIMEOUT", "AI phản hồi quá lâu. Bạn thử lại nhé."],
      quota: ["AI_QUOTA", "AI đang quá tải. Bạn thử lại sau nhé."],
      authentication: ["AI_AUTHENTICATION", "AI tạm thời không khả dụng."],
      unavailable: ["AI_UNAVAILABLE", "AI tạm thời không khả dụng."],
      upstream: ["AI_UPSTREAM", "Chưa tạo được câu trả lời. Bạn thử lại nhé."],
    }[error.kind];
    return { type: "error", code: details[0], message: details[1] };
  }
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (body && typeof body === "object") {
      const value = body as { code?: unknown; message?: unknown };
      return {
        type: "error",
        code:
          typeof value.code === "string" && /^[A-Z0-9_]{1,64}$/.test(value.code)
            ? value.code
            : "REQUEST_REJECTED",
        message:
          typeof value.message === "string"
            ? value.message
            : "Không thể xử lý câu hỏi này. Bạn thử lại nhé.",
      };
    }
  }
  return {
    type: "error",
    code: "AI_UPSTREAM",
    message: "Chưa tạo được câu trả lời. Bạn thử lại nhé.",
  };
}

async function writeSse(
  response: StreamResponse,
  event: AssistantStreamEvent,
  signal: AbortSignal,
) {
  if (signal.aborted || response.destroyed || response.writableEnded)
    return false;
  const accepted = response.write(`data: ${JSON.stringify(event)}\n\n`);
  if (accepted) return true;
  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("close", onClose);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      cleanup();
      resolve(
        !signal.aborted && !response.destroyed && !response.writableEnded,
      );
    };
    const onDrain = finish;
    const onClose = finish;
    const onAbort = finish;
    response.on("drain", onDrain);
    response.on("close", onClose);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted || response.destroyed || response.writableEnded)
      finish();
  });
}

@Controller("assistant")
@UseFilters(AssistantExceptionFilter)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly workspace: WorkspaceAssistantService,
    private readonly receipts: AnswerReceiptService,
  ) {}

  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Post("chat")
  @HttpCode(200)
  async chat(
    @Body() input: AssistantChatDto,
    @Req() req?: AuthRequest,
    @Res({ passthrough: true })
    res?: { setHeader(name: string, value: string): void },
  ) {
    await this.receipts.verifyHistory(input, req?.principal);
    // Workspace questions are answered from records by their own read-only
    // service. Other modes receive only the guard-verified server principal.
    const answer =
      input.mode === "workspace"
        ? await this.workspace.chat(input, req?.principal)
        : await this.assistant.chat(input, req?.principal);
    try {
      const id = await this.receipts.issue(
        input,
        answer,
        req?.principal,
        requestContext.getStore()?.requestId ?? randomUUID(),
      );
      const header: AssistantAnswerIdHeader = "X-Assistant-Answer-ID";
      res?.setHeader(header, id);
    } catch (error) {
      // Only receipt persistence is best-effort after a validated answer.
      // The receipt service logs its fixed outage code; revoked access is not
      // an outage and must still block delivery.
      if (!(error instanceof HttpException) || error.getStatus() < 500)
        throw error;
    }
    return answer;
  }

  @Post("chat/stream")
  @HttpCode(200)
  async streamChat(
    @Body() input: AssistantChatDto,
    @Req() req: StreamRequest,
    @Res() res: StreamResponse,
  ) {
    const mode = input.mode ?? "documents";
    if (
      (mode !== "general" && mode !== "documents" && mode !== "workspace") ||
      (input.operation !== undefined && input.operation !== "question") ||
      (mode !== "documents" && input.documentId)
    )
      throw new BadRequestException({
        code: "STREAM_QUESTION_ONLY",
        message:
          "Streaming hỗ trợ câu hỏi AI Chat và Hỏi workspace; thao tác tài liệu riêng dùng endpoint chat thông thường.",
      });
    await this.receipts.verifyHistory(input, req.principal);

    const controller = new AbortController();
    const onRequestAborted = () => controller.abort();
    const onResponseClosed = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.on("aborted", onRequestAborted);
    res.on("close", onResponseClosed);
    res
      .status(200)
      .setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    try {
      if (!(await writeSse(res, { type: "start" }, controller.signal))) return;
      let answer: AssistantChatResponse | undefined;
      if (mode === "workspace") {
        if (
          !(await writeSse(
            res,
            { type: "status", stage: "querying_workspace" },
            controller.signal,
          ))
        )
          return;
        answer = await this.workspace.chat(input, req.principal);
      } else {
        const stream =
          mode === "general"
            ? this.assistant.streamGeneralChat(
                input,
                req.principal,
                controller.signal,
              )
            : this.assistant.streamDocumentChat(
                input,
                req.principal,
                controller.signal,
              );
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          if (event.type === "status" || event.type === "delta") {
            if (!(await writeSse(res, event, controller.signal))) break;
          } else {
            answer = event.answer;
          }
        }
      }
      if (controller.signal.aborted) return;
      if (!answer) throw new AssistantError("upstream");

      let answerId: string | undefined;
      try {
        answerId = await this.receipts.issue(
          input,
          answer,
          req.principal,
          requestContext.getStore()?.requestId ?? randomUUID(),
        );
      } catch (error) {
        // Preserve the JSON endpoint's policy: transient receipt outages do
        // not discard a completed answer, but authorization failures do.
        if (!(error instanceof HttpException) || error.getStatus() < 500)
          throw error;
      }
      await writeSse(
        res,
        {
          type: "done",
          response: answer,
          ...(answerId ? { answerId } : {}),
        },
        controller.signal,
      );
    } catch (error: unknown) {
      if (!controller.signal.aborted)
        await writeSse(res, assistantStreamFailure(error), controller.signal);
    } finally {
      req.off("aborted", onRequestAborted);
      res.off("close", onResponseClosed);
      if (!res.destroyed && !res.writableEnded) res.end();
    }
  }
}
