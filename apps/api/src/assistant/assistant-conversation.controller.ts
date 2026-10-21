import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.service.js";
import {
  AssistantConversationCreateDto,
  AssistantConversationPageQuery,
  AssistantConversationSaveRetryDto,
} from "./assistant-conversation.dto.js";
import { AssistantConversationService } from "./assistant-conversation.service.js";

@Controller("assistant/conversations")
export class AssistantConversationController {
  constructor(private readonly conversations: AssistantConversationService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body() input: AssistantConversationCreateDto,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.create(input, req.principal);
  }

  @Get()
  list(
    @Query() query: AssistantConversationPageQuery,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.list(req.principal, query.page, query.pageSize);
  }

  @Get("create-keys/:createKey")
  reconcileCreate(
    @Param("createKey", new ParseUUIDPipe()) createKey: string,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.reconcileCreate(createKey, req.principal);
  }

  @Get(":id/messages")
  messages(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: AssistantConversationPageQuery,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.messages(
      id,
      req.principal,
      query.page,
      query.pageSize,
    );
  }

  @Post(":id/turns")
  @HttpCode(200)
  retrySave(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: AssistantConversationSaveRetryDto,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.retryAppend(id, input, req.principal);
  }

  @Delete(":id")
  @HttpCode(200)
  delete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.conversations.delete(id, req.principal);
  }
}
