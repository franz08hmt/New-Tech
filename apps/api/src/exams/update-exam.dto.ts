import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * A full replacement of an exam's own details, not a partial patch.
 *
 * The edit form shows every field filled in and submits all of them, so
 * "absent" would be ambiguous: it could mean "leave alone" or "clear". Only
 * revisionNote is optional, and there omitting it genuinely means "no note".
 *
 * The course is deliberately not editable here. Moving an exam to another
 * subject is a different act from correcting its time or room, and doing it by
 * accident in a small inline form would be too easy.
 */
export class UpdateExamDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  topic!: string;

  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  examDate!: string;

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
