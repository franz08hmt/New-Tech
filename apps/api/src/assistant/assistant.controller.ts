import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseFilters,
} from "@nestjs/common";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantExceptionFilter } from "./assistant-exception.filter.js";
import { AssistantService } from "./assistant.service.js";
import { WorkspaceAssistantService } from "./workspace-assistant.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("assistant")
@UseFilters(AssistantExceptionFilter)
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly workspace: WorkspaceAssistantService,
  ) {}

  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Post("chat")
  @HttpCode(200)
  chat(@Body() input: AssistantChatDto, @Req() req?: AuthRequest) {
    // Workspace questions are answered from records by their own read-only
    // service. Other modes receive only the guard-verified server principal.
    if (input.mode === "workspace")
      return this.workspace.chat(input, req?.principal);
    return this.assistant.chat(input, req?.principal);
  }
}
