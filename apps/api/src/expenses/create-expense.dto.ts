import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { expenseCategories } from "./expense.types.js";
import type { ExpenseCategory } from "./expense.types.js";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Matches the int4 ceiling the column CHECK enforces. */
const MAX_AMOUNT = 2_000_000_000;

export class CreateExpenseDto {
  /**
   * Whole dong only. `IsInt` rejects 12.5 and, just as importantly, rejects
   * the string "12" — a number arriving as text would pass a looser check and
   * then be concatenated instead of added when the UI totals it up.
   */
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount!: number;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description!: string;

  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  spentOn!: string;

  @IsIn(expenseCategories)
  category!: ExpenseCategory;

  /** Optional: not every expense belongs to a subject. */
  @IsOptional()
  @IsUUID()
  courseId?: string;
}
