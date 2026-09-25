import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseFilters,
} from "@nestjs/common";
import { AssistantChatDto } from "./assistant-chat.dto.js";
import { AssistantExceptionFilter } from "./assistant-exception.filter.js";
import { AssistantService } from "./assistant.service.js";

@Controller("assistant")
@UseFilters(AssistantExceptionFilter)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get("status")
  status() {
    return this.assistant.status();
  }

  @Post("chat")
  @HttpCode(200)
  chat(@Body() input: AssistantChatDto) {
    return this.assistant.chat(input);
  }
}
