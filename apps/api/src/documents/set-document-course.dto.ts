import { IsIn, IsOptional, IsUUID, ValidateIf } from "class-validator";

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
