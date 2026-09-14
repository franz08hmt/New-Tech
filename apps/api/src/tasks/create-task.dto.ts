import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";
import { taskStatuses } from "./task.types.js";
import type { TaskStatus } from "./task.types.js";

export class CreateTaskDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerName?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(taskStatuses)
  status?: TaskStatus;

  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  evidenceType?: string;
}
