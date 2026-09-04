import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { CreateTaskDto } from "./create-task.dto.js";
import { TasksService } from "./tasks.service.js";
import { UpdateTaskStatusDto } from "./update-task-status.dto.js";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list() {
    return this.tasks.list();
  }

  @Post()
  create(@Body() input: CreateTaskDto) {
    return this.tasks.create(input);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateTaskStatusDto,
  ) {
    return this.tasks.updateStatus(id, input.status);
  }
}
