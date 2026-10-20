import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { CreateTaskDto } from "./create-task.dto.js";
import { TasksService } from "./tasks.service.js";
import { UpdateTaskStatusDto } from "./update-task-status.dto.js";
import { TaskSearchQueryDto } from "./task-search-query.dto.js";
import type { AuthRequest } from "../auth/auth.service.js";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get("search")
  search(@Query() query: TaskSearchQueryDto, @Req() req: AuthRequest) {
    return this.tasks.search(req.principal, query);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.tasks.list(req.principal);
  }

  @Get(":id")
  getById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasks.getById(id, req.principal);
  }

  @Post()
  create(@Body() input: CreateTaskDto, @Req() req: AuthRequest) {
    return this.tasks.create(input, req.principal);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateTaskStatusDto,
    @Req() req: AuthRequest,
  ) {
    return this.tasks.updateStatus(id, input.status, req.principal);
  }
}
