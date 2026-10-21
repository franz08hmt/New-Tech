import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.service.js";
import {
  assertStudyFlashcardToken,
  parseStudyFlashcardsPage,
  StudyFlashcardsConfirmDto,
  StudyFlashcardsGenerateDto,
  StudyFlashcardsReviewDto,
} from "./study-flashcards.dto.js";
import { StudyFlashcardsService } from "./study-flashcards.service.js";

@Controller("study-coach/flashcards")
export class StudyFlashcardsController {
  constructor(private readonly flashcards: StudyFlashcardsService) {}

  @Post("generate")
  @HttpCode(201)
  generate(@Body() input: StudyFlashcardsGenerateDto, @Req() req: AuthRequest) {
    return this.flashcards.generate(input, req.principal);
  }

  @Get()
  list(@Query() query: unknown, @Req() req: AuthRequest) {
    return this.flashcards.list(parseStudyFlashcardsPage(query), req.principal);
  }

  @Get("drafts/:id")
  reconcileDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("x-study-flashcard-draft-token") token: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.reconcileDraft(
      id,
      assertStudyFlashcardToken(token),
      req.principal,
    );
  }

  @Post("drafts/:id/confirm")
  @HttpCode(200)
  confirmDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyFlashcardsConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.confirmDraft(
      id,
      assertStudyFlashcardToken(input.draftToken),
      req.principal,
    );
  }

  @Delete("drafts/:id")
  @HttpCode(200)
  cancelDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyFlashcardsConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.cancelDraft(
      id,
      assertStudyFlashcardToken(input.draftToken),
      req.principal,
    );
  }

  @Get(":id/progress")
  progress(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.progress(id, req.principal);
  }

  @Post(":id/reviews")
  @HttpCode(201)
  submitReview(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyFlashcardsReviewDto,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.submitReview(id, input, req.principal);
  }

  @Get(":id")
  detail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.detail(id, req.principal);
  }

  @Delete(":id")
  @HttpCode(200)
  delete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.flashcards.delete(id, req.principal);
  }
}
