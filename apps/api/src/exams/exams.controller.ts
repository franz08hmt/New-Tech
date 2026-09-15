import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { CreateExamDto } from "./create-exam.dto.js";
import { ExamsService } from "./exams.service.js";

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

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.exams.remove(id);
  }
}
