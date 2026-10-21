import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { BadRequestException } from "@nestjs/common";

export class StudyQuizGenerateDto {
  @IsUUID()
  documentId!: string;

  @IsIn(["vi", "en"])
  language!: "vi" | "en";

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(3)
  @Max(10)
  questionCount?: number;
}

export class StudyQuizConfirmDto {
  @IsString()
  draftToken!: string;
}

export class StudyQuizAttemptAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsInt()
  @Min(0)
  @Max(3)
  selectedIndex!: number;
}

export class StudyQuizAttemptDto {
  @IsUUID()
  attemptKey!: string;

  @ValidateNested({ each: true })
  @Type(() => StudyQuizAttemptAnswerDto)
  @ArrayMinSize(3)
  @ArrayMaxSize(10)
  answers!: StudyQuizAttemptAnswerDto[];
}

export interface StudyQuizPage {
  page: number;
  pageSize: number;
}

export function parseStudyQuizPage(raw: unknown): StudyQuizPage {
  if (raw === undefined) return { page: 1, pageSize: 20 };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    throw invalidQuery();
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["page", "pageSize"].includes(key)))
    throw invalidQuery();
  const parse = (key: "page" | "pageSize", fallback: number, max: number) => {
    const value = record[key];
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value))
      throw invalidQuery();
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > max) throw invalidQuery();
    return number;
  };
  return {
    page: parse("page", 1, 10_000),
    pageSize: parse("pageSize", 20, 50),
  };
}

export function assertStudyQuizToken(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw invalidQuery();
  return value;
}

function invalidQuery() {
  return new BadRequestException({
    code: "STUDY_QUIZ_REQUEST_INVALID",
    message: "Yêu cầu Study Coach không hợp lệ.",
  });
}
