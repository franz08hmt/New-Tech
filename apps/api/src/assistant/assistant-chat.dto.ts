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
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from "class-validator";
import type {
  AssistantChatRequest,
  AssistantMode,
  AssistantOperation,
  AssistantPageContext,
  AssistantHistoryTurn,
} from "@examate/contracts";
import { validHistory } from "./history-validation.js";

@ValidatorConstraint({ name: "assistantHistory", async: false })
class HistoryConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    return validHistory(value, args.object as AssistantChatRequest);
  }
  defaultMessage() {
    return "Chưa xác minh được ngữ cảnh. Bạn mở cuộc hội thoại mới rồi thử lại nhé.";
  }
}

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
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Validate(HistoryConstraint)
  history?: AssistantHistoryTurn[];

  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsIn(["general", "documents", "workspace"] satisfies AssistantMode[])
  mode?: AssistantMode;

  @IsOptional()
  @IsIn(["question", "summarize", "course_info"] satisfies AssistantOperation[])
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
