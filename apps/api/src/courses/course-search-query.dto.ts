import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from "class-validator";
import { PagedSearchQueryDto } from "../common/paged-search-query.dto.js";

const strictInteger = ({ value }: { value: unknown }) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return value;
  return Number(value);
};

export class CourseSearchQueryDto extends PagedSearchQueryDto {
  @IsIn(["name", "code", "progress"])
  sort: "name" | "code" | "progress" = "name";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "asc";

  @Transform(strictInteger)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressMin?: number;

  @Transform(strictInteger)
  @ValidateIf((query: CourseSearchQueryDto) => query.progressMax !== undefined)
  @IsInt()
  @Min(0)
  @Max(100)
  progressMax?: number;
}
