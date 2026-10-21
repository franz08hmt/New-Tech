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

export class StudyFlashcardsGenerateDto {
  @IsUUID()
  documentId!: string;

  @IsIn(["vi", "en"])
  language!: "vi" | "en";

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(3)
  @Max(10)
  cardCount?: number;
}

export class StudyFlashcardsConfirmDto {
  @IsString()
  draftToken!: string;
}

export class StudyFlashcardRatingDto {
  @IsUUID()
  cardId!: string;

  @IsIn(["remembered", "needs_review"])
  rating!: "remembered" | "needs_review";
}

export class StudyFlashcardsReviewDto {
  @IsUUID()
  reviewKey!: string;

  @ValidateNested({ each: true })
  @Type(() => StudyFlashcardRatingDto)
  @ArrayMinSize(3)
  @ArrayMaxSize(10)
  ratings!: StudyFlashcardRatingDto[];
}

export interface StudyFlashcardsPage {
  page: number;
  pageSize: number;
}

export function parseStudyFlashcardsPage(raw: unknown): StudyFlashcardsPage {
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

export function assertStudyFlashcardToken(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw invalidQuery();
  return value;
}

function invalidQuery() {
  return new BadRequestException({
    code: "STUDY_FLASHCARDS_REQUEST_INVALID",
    message: "Yêu cầu flashcards không hợp lệ.",
  });
}
