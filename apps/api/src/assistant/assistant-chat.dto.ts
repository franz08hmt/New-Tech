import { Transform, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import type {
  AssistantChatRequest,
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
  @IsObject()
  @ValidateNested()
  @Type(() => AssistantPageContextDto)
  pageContext?: AssistantPageContextDto | null;
}
