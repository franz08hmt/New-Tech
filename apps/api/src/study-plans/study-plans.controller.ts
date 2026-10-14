import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  CreateStudyPlanDto,
  UpdateStudyPlanCompletionDto,
} from "./create-study-plan.dto.js";
import { StudyPlansService } from "./study-plans.service.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("study-plans")
export class StudyPlansController {
  constructor(private readonly plans: StudyPlansService) {}

  @Get()
  list(@Req() req: AuthRequest) {
    return this.plans.list(req.principal);
  }

  @Post()
  create(@Body() input: CreateStudyPlanDto, @Req() req: AuthRequest) {
    return this.plans.create(input, req.principal);
  }

  @Patch(":id/completion")
  setCompletion(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateStudyPlanCompletionDto,
    @Req() req: AuthRequest,
  ) {
    return this.plans.setCompletion(id, input.completed, req.principal);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.plans.remove(id, req.principal);
  }
}
