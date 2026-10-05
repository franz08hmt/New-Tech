import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsObject,
  ValidateIf,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from "class-validator";
import type {
  AssistantFeedbackSnapshot,
  AssistantFeedbackRating,
  AssistantFeedbackReason,
  CreateAssistantFeedbackRequest,
} from "@examate/contracts";
import { feedbackReasons, validSnapshot } from "./feedback-validation.js";

@ValidatorConstraint({ name: "feedbackSnapshot", async: false })
class SnapshotConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return validSnapshot(value);
  }
  defaultMessage() {
    return "Snapshot không hợp lệ hoặc vượt giới hạn; không cắt nội dung để gửi.";
  }
}
@ValidatorConstraint({ name: "feedbackSelection", async: false })
class SelectionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const p = args.object as CreateFeedbackDto;
    return (
      Array.isArray(value) &&
      (p.rating === "helpful"
        ? value.length === 0
        : p.rating === "unhelpful" && value.length > 0) &&
      (!value.includes("other") ||
        (typeof p.comment === "string" && p.comment.trim().length > 0))
    );
  }
  defaultMessage() {
    return "Chưa đúng cần lý do; Khác cần ghi chú. Hữu ích không gửi lý do lỗi.";
  }
}
export class CreateFeedbackDto implements CreateAssistantFeedbackRequest {
  @IsUUID() answerId!: string;
  @IsUUID() submissionId!: string;
  @IsIn(["helpful", "unhelpful"]) rating!: AssistantFeedbackRating;
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(feedbackReasons, { each: true })
  @Validate(SelectionConstraint)
  reasons!: AssistantFeedbackReason[];
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  comment?: string;
  @IsObject()
  @Validate(SnapshotConstraint)
  snapshot!: AssistantFeedbackSnapshot;
}
