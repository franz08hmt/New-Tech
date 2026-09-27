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
import { CreateExamDto } from "./create-exam.dto.js";
import { ExamsService } from "./exams.service.js";
import { UpdateExamDto } from "./update-exam.dto.js";

@Controller("exams")
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  list() {
    return this.exams.list();
  }

  @Post()
  create(@Body() input: CreateExamDto) {
    return this.exams.create(input);
  }

  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateExamDto,
  ) {
    return this.exams.update(id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.exams.remove(id);
  }
}
