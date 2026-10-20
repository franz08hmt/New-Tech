import { Transform } from "class-transformer";
import type {
  WorkspaceSearchKind,
  WorkspaceSearchQuery,
  WorkspaceSearchSort,
} from "@examate/contracts";
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export const MAX_WORKSPACE_SEARCH_PAGE = 1_000_000;
export const MAX_WORKSPACE_SEARCH_PAGE_SIZE = 50;
export const MAX_WORKSPACE_SEARCH_TEXT = 120;

const strictInteger = ({ value }: { value: unknown }) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return value;
  return Number(value);
};

const trimmedString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class WorkspaceSearchQueryDto implements WorkspaceSearchQuery {
  @Transform(trimmedString)
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_WORKSPACE_SEARCH_TEXT)
  @Matches(/[\p{L}\p{N}]/u, {
    message: "q must contain a letter or number",
  })
  q!: string;

  @IsIn(["all", "course", "exam", "plan", "document", "expense", "task"])
  kind: WorkspaceSearchKind = "all";

  @IsIn(["kind", "label"])
  sort: WorkspaceSearchSort = "kind";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_WORKSPACE_SEARCH_PAGE)
  page = 1;

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_WORKSPACE_SEARCH_PAGE_SIZE)
  pageSize = 12;
}
