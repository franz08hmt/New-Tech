import { Body, Controller, Post, Req } from "@nestjs/common";
import { CreateFeedbackDto } from "./create-feedback.dto.js";
import { FeedbackService } from "./feedback.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("assistant/feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}
  @Post() create(@Body() input: CreateFeedbackDto, @Req() req: AuthRequest) {
    return this.feedback.create(input, req.principal);
  }
}
