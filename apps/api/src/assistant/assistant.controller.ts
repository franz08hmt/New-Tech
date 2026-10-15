import {
  Body,
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
import type { AssistantAnswerIdHeader } from "@examate/contracts";
import { AnswerReceiptService } from "./answer-receipt.service.js";
import { requestContext } from "../common/log.js";
import { randomUUID } from "node:crypto";

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
}
