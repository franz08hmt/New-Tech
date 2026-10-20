import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";
import type {
  StudyPlanSearchQuery,
  StudyPlanSearchSort,
} from "@examate/contracts";
import { PagedSearchQueryDto } from "../common/paged-search-query.dto.js";

export class StudyPlanSearchQueryDto
  extends PagedSearchQueryDto
  implements StudyPlanSearchQuery
{
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsIn(["all", "open", "completed"])
  completion: "all" | "open" | "completed" = "all";

  @IsOptional()
  @IsString()
  @MaxLength(80)
  owner?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueTo?: string;

  @IsIn(["due_date", "title", "course", "completed"])
  sort: StudyPlanSearchSort = "due_date";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";
}
