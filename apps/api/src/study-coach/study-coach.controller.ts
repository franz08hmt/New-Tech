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
  assertStudyQuizToken,
  parseStudyQuizPage,
  StudyQuizAttemptDto,
  StudyQuizConfirmDto,
  StudyQuizGenerateDto,
} from "./study-coach.dto.js";
import { StudyCoachService } from "./study-coach.service.js";

@Controller("study-coach/quizzes")
export class StudyCoachController {
  constructor(private readonly quizzes: StudyCoachService) {}

  @Post("generate")
  @HttpCode(201)
  generate(@Body() input: StudyQuizGenerateDto, @Req() req: AuthRequest) {
    return this.quizzes.generate(input, req.principal);
  }

  @Get()
  list(@Query() query: unknown, @Req() req: AuthRequest) {
    return this.quizzes.list(parseStudyQuizPage(query), req.principal);
  }

  @Get("drafts/:id")
  reconcileDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("x-study-quiz-draft-token") token: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.reconcileDraft(
      id,
      assertStudyQuizToken(token),
      req.principal,
    );
  }

  @Post("drafts/:id/confirm")
  @HttpCode(200)
  confirmDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyQuizConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.confirmDraft(
      id,
      assertStudyQuizToken(input.draftToken),
      req.principal,
    );
  }

  @Delete("drafts/:id")
  @HttpCode(200)
  cancelDraft(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyQuizConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.cancelDraft(
      id,
      assertStudyQuizToken(input.draftToken),
      req.principal,
    );
  }

  @Get(":id/progress")
  progress(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.progress(id, req.principal);
  }

  @Post(":id/attempts")
  @HttpCode(201)
  submitAttempt(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: StudyQuizAttemptDto,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.submitAttempt(id, input, req.principal);
  }

  @Get(":id")
  detail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.detail(id, req.principal);
  }

  @Delete(":id")
  @HttpCode(200)
  delete(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.quizzes.delete(id, req.principal);
  }
}
