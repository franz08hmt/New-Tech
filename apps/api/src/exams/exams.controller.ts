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
  Query,
  Req,
} from "@nestjs/common";
import { CreateExamDto } from "./create-exam.dto.js";
import { ExamSearchQueryDto } from "./exam-search-query.dto.js";
import { ExamsService } from "./exams.service.js";
import { UpdateExamDto } from "./update-exam.dto.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("exams")
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get("search")
  search(@Query() query: ExamSearchQueryDto, @Req() req: AuthRequest) {
    return this.exams.search(req.principal, query);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.exams.list(req.principal);
  }

  @Get(":id")
  getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.exams.getById(id, req.principal);
  }

  @Post()
  create(@Body() input: CreateExamDto, @Req() req: AuthRequest) {
    return this.exams.create(input, req.principal);
  }

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateExamDto,
    @Req() req: AuthRequest,
  ) {
    return this.exams.update(id, input, req.principal);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.exams.remove(id, req.principal);
  }
}
