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
} from "@nestjs/common";
import {
  CreateStudyPlanDto,
  UpdateStudyPlanCompletionDto,
} from "./create-study-plan.dto.js";
import { StudyPlansService } from "./study-plans.service.js";

@Controller("study-plans")
export class StudyPlansController {
  constructor(private readonly plans: StudyPlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  create(@Body() input: CreateStudyPlanDto) {
    return this.plans.create(input);
  }

  @Patch(":id/completion")
  setCompletion(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateStudyPlanCompletionDto,
  ) {
    return this.plans.setCompletion(id, input.completed);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.plans.remove(id);
  }
}
