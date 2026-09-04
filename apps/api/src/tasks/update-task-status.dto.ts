import { IsIn } from "class-validator";
import { taskStatuses } from "./task.types.js";
import type { TaskStatus } from "./task.types.js";

export class UpdateTaskStatusDto {
  @IsIn(taskStatuses)
  status!: TaskStatus;
}
