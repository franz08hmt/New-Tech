import { Transform } from "class-transformer";
import type {
  DocumentSearchQuery,
  DocumentSearchSort,
} from "@examate/contracts";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";

export const MAX_DOCUMENT_SEARCH_PAGE = 1_000_000;
export const MAX_DOCUMENT_SEARCH_PAGE_SIZE = 50;
export const MAX_DOCUMENT_SEARCH_TEXT = 120;

const strictInteger = ({ value }: { value: unknown }) => {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return value;
  return Number(value);
};

const trimmedString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class DocumentSearchQueryDto implements DocumentSearchQuery {
  @Transform(trimmedString)
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DOCUMENT_SEARCH_TEXT)
  // Only skip the content rule for the contract's empty query. Keeping the
  // other validators active for arrays/objects prevents repeated query keys
  // from bypassing @IsString and reaching DocumentsService.search().
  @ValidateIf((_object, value) => value !== "")
  @Matches(/[\p{L}\p{N}]/u, {
    message: "q must contain at least one letter or number",
  })
  q?: string;

  @IsString()
  @ValidateIf((_object, value) => value !== "all" && value !== "unassigned")
  @IsUUID()
  course = "all";

  @IsOptional()
  @IsIn(["stored", "deleting", "legacy"])
  storage_status?: "stored" | "deleting" | "legacy";

  @IsOptional()
  @IsIn(["pending", "processing", "ready", "failed"])
  processing_status?: "pending" | "processing" | "ready" | "failed";

  @IsIn([
    "created_at",
    "name",
    "course_name",
    "storage_status",
    "processing_status",
  ])
  sort: DocumentSearchSort = "created_at";

  @IsIn(["asc", "desc"])
  direction: "asc" | "desc" = "desc";

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_SEARCH_PAGE)
  page = 1;

  @Transform(strictInteger)
  @IsInt()
  @Min(1)
  @Max(MAX_DOCUMENT_SEARCH_PAGE_SIZE)
  pageSize = 20;
}

export class SetDocumentCourseDto {
  /**
   * null detaches the document from every subject, which is a real choice and
   * not the same as omitting the field. ValidateIf lets null through while
   * still rejecting anything that is neither null nor a UUID.
   */
  @ValidateIf((_object, value) => value !== null)
  @IsUUID()
  courseId!: string | null;
}

export class UploadDocumentDto {
  /** Optional: material that belongs to no subject is still worth keeping. */
  @IsOptional()
  @IsUUID()
  courseId?: string;
}

export class DownloadDocumentQueryDto {
  /**
   * Only "inline" is accepted: a preview asks for it, and leaving it out keeps
   * the ordinary download. Any other value, repeated values included, is a
   * 400 rather than being quietly read as a download.
   */
  @IsOptional()
  @IsIn(["inline"])
  disposition?: "inline";
}
