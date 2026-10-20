import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from "class-validator";
import { PagedSearchQueryDto } from "../common/paged-search-query.dto.js";

export class ExamSearchQueryDto extends PagedSearchQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  fromDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  toDate?: string;

  @IsIn(["exam_date", "topic", "course"])
  sort: "exam_date" | "topic" | "course" = "exam_date";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";
}
