import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from "class-validator";
import type {
  ExpenseCategory,
  ExpenseSearchQuery,
  ExpenseSearchSort,
} from "@examate/contracts";
import { expenseCategories } from "./expense.types.js";
import { PagedSearchQueryDto } from "../common/paged-search-query.dto.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ExpenseSearchQueryDto
  extends PagedSearchQueryDto
  implements ExpenseSearchQuery
{
  @IsIn(["all", ...expenseCategories])
  category: "all" | ExpenseCategory = "all";

  @Transform(trim)
  @ValidateIf(
    (query: ExpenseSearchQueryDto) =>
      query.courseId !== undefined && query.courseId !== "unassigned",
  )
  @IsUUID()
  courseId?: string;

  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ValidateIf((query: ExpenseSearchQueryDto) => query.fromDate !== undefined)
  fromDate?: string;

  @IsString()
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @ValidateIf((query: ExpenseSearchQueryDto) => query.toDate !== undefined)
  toDate?: string;

  @IsIn(["spent_on", "amount", "description"])
  sort: ExpenseSearchSort = "spent_on";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "desc";
}
