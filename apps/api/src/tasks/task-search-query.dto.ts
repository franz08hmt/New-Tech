import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength, ValidateIf } from "class-validator";
import type {
  TaskSearchQuery,
  TaskSearchSort,
  TaskStatus,
} from "@examate/contracts";
import { PagedSearchQueryDto } from "../common/paged-search-query.dto.js";

const trimmedString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class TaskSearchQueryDto
  extends PagedSearchQueryDto
  implements TaskSearchQuery
{
  @IsIn(["all", "todo", "in_progress", "done"])
  status: TaskStatus | "all" = "all";

  @Transform(trimmedString)
  @ValidateIf(
    (query: { owner?: unknown }) =>
      query.owner !== undefined && query.owner !== "",
  )
  @IsString()
  @MaxLength(80)
  owner?: string;

  @IsIn(["title", "status", "due_date", "created_at"])
  sort: TaskSearchSort = "due_date";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";
}
