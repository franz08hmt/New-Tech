import { Transform, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import type {
  AssistantChatRequest,
  AssistantMode,
  AssistantOperation,
  AssistantPageContext,
} from "@examate/contracts";

export class AssistantPageContextDto implements AssistantPageContext {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  pageId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  pageName!: string;
}

export class AssistantChatDto implements AssistantChatRequest {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsIn(["general", "documents"] satisfies AssistantMode[])
  mode?: AssistantMode;

  @IsOptional()
  @IsIn(["question", "summarize"] satisfies AssistantOperation[])
  operation?: AssistantOperation;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AssistantPageContextDto)
  pageContext?: AssistantPageContextDto | null;

  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsUUID()
  documentId?: string | null;
}
