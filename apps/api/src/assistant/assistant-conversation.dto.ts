import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type {
  AssistantConversationCreateRequest,
  AssistantMode,
  AssistantConversationSaveRetryRequest,
} from "@examate/contracts";

const pageNumber = ({ value }: { value: unknown }) =>
  typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : value;

export class AssistantConversationPageQuery {
  @IsOptional()
  @Transform(pageNumber)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;

  @IsOptional()
  @Transform(pageNumber)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class AssistantConversationCreateDto implements AssistantConversationCreateRequest {
  @IsUUID()
  createKey!: string;

  @IsIn(["general", "documents", "workspace"] satisfies AssistantMode[])
  mode!: AssistantMode;

  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsUUID()
  documentId?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  firstQuestion!: string;
}

export class AssistantConversationSaveRetryDto implements AssistantConversationSaveRetryRequest {
  @IsUUID()
  receiptId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  expectedVersion!: number;

  @IsObject()
  snapshot!: AssistantConversationSaveRetryRequest["snapshot"];
}
