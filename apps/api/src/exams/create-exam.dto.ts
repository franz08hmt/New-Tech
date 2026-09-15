import {
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

export class CreateExamDto {
  @IsUUID()
  courseId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  topic!: string;

  /**
   * A calendar day, never a timestamp. Matches first so that "2026-13-40" is
   * rejected as the wrong shape before IsDateString reports it as invalid.
   */
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  examDate!: string;

  /** 24-hour clock, "09:00" or "09:00:00". */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  examTime!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  room!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  revisionNote?: string;
}
