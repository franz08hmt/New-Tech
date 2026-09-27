import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateStudyPlanDto {
  @IsUUID()
  courseId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  detail?: string;

  /** A calendar day. Matches first so a malformed date fails on shape. */
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  ownerName?: string;
}

export class UpdateStudyPlanCompletionDto {
  @IsBoolean()
  completed!: boolean;
}
