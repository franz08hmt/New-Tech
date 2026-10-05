import { Body, Controller, Post } from "@nestjs/common";
import { CreateFeedbackDto } from "./create-feedback.dto.js";
import { FeedbackService } from "./feedback.service.js";

@Controller("assistant/feedback")
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}
  @Post() create(@Body() input: CreateFeedbackDto) {
    return this.feedback.create(input);
  }
}
