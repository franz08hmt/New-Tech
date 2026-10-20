import { Transform } from "class-transformer";
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export const MAX_LIST_SEARCH_PAGE = 1_000_000;
export const MAX_LIST_SEARCH_PAGE_SIZE = 50;
export const DEFAULT_LIST_SEARCH_PAGE_SIZE = 20;
export const MAX_LIST_SEARCH_TEXT = 120;

const strictInteger = ({ value }: { value: unknown }) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return value;
  return Number(value);
};

const trimmedString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/** Shared scalar and pagination boundary; module DTOs keep their own allowlists. */
export abstract class PagedSearchQueryDto {
  @Transform(trimmedString)
  @ValidateIf(
    (query: { q?: unknown }) => query.q !== undefined && query.q !== "",
  )
  @IsString()
  @MinLength(2)
  @MaxLength(MAX_LIST_SEARCH_TEXT)
  @Matches(/[\p{L}\p{N}]/u, { message: "q must contain a letter or number" })
  q?: string;

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_SEARCH_PAGE)
  page = 1;

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_LIST_SEARCH_PAGE_SIZE)
  pageSize = DEFAULT_LIST_SEARCH_PAGE_SIZE;
}
