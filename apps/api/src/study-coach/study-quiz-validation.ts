import type {
  StudyQuizLanguage,
  StudyQuizQuestionPreview,
} from "@examate/contracts";

export const STUDY_QUIZ_SCHEMA_VERSION = "study-quiz-v1" as const;
export const STUDY_QUIZ_MAX_JSON_BYTES = 65_536;

export interface UnidentifiedStudyQuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  sourceIds: string[];
}

export interface UnidentifiedStudyQuiz {
  title: string;
  language: StudyQuizLanguage;
  questions: UnidentifiedStudyQuizQuestion[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function text(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function identityText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function studyQuizResponseSchema(questionCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    propertyOrdering: ["title", "language", "questions"],
    required: ["title", "language", "questions"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      language: { type: "string", enum: ["vi", "en"] },
      questions: {
        type: "array",
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: "object",
          additionalProperties: false,
          propertyOrdering: [
            "question",
            "options",
            "correctIndex",
            "explanation",
            "sourceIds",
          ],
          required: [
            "question",
            "options",
            "correctIndex",
            "explanation",
            "sourceIds",
          ],
          properties: {
            question: { type: "string", minLength: 1, maxLength: 800 },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "string", minLength: 1, maxLength: 300 },
            },
            correctIndex: { type: "integer", minimum: 0, maximum: 3 },
            explanation: { type: "string", minLength: 1, maxLength: 1200 },
            sourceIds: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: { type: "string", minLength: 1, maxLength: 12 },
            },
          },
        },
      },
    },
  } as const;
}

/** Re-validates provider output; JSON mode/schema enforcement is not trusted. */
export function parseStudyQuizOutput(
  output: string,
  questionCount: number,
  language: StudyQuizLanguage,
  allowedSourceIds: ReadonlySet<string>,
): UnidentifiedStudyQuiz | undefined {
  if (
    typeof output !== "string" ||
    Buffer.byteLength(output, "utf8") > STUDY_QUIZ_MAX_JSON_BYTES
  )
    return undefined;

  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (
    !record(value) ||
    !exactKeys(value, ["title", "language", "questions"]) ||
    !text(value.title, 120) ||
    value.language !== language ||
    !Array.isArray(value.questions) ||
    value.questions.length !== questionCount
  )
    return undefined;

  const questions: UnidentifiedStudyQuizQuestion[] = [];
  const questionKeys = [
    "question",
    "options",
    "correctIndex",
    "explanation",
    "sourceIds",
  ] as const;
  const uniqueQuestions = new Set<string>();
  for (const item of value.questions) {
    if (
      !record(item) ||
      !exactKeys(item, questionKeys) ||
      !text(item.question, 800) ||
      !text(item.explanation, 1200) ||
      !Number.isInteger(item.correctIndex) ||
      (item.correctIndex as number) < 0 ||
      (item.correctIndex as number) > 3 ||
      !Array.isArray(item.options) ||
      item.options.length !== 4 ||
      !item.options.every((option) => text(option, 300)) ||
      !Array.isArray(item.sourceIds) ||
      item.sourceIds.length < 1 ||
      item.sourceIds.length > 5 ||
      !item.sourceIds.every(
        (sourceId) =>
          typeof sourceId === "string" &&
          /^[A-Z][A-Z0-9]{0,11}$/.test(sourceId) &&
          allowedSourceIds.has(sourceId),
      ) ||
      new Set(item.sourceIds).size !== item.sourceIds.length
    )
      return undefined;

    const normalizedQuestion = identityText(item.question);
    if (uniqueQuestions.has(normalizedQuestion)) return undefined;
    uniqueQuestions.add(normalizedQuestion);
    const options = item.options.map((option) => option.trim()) as [
      string,
      string,
      string,
      string,
    ];
    if (new Set(options.map(identityText)).size !== 4) return undefined;
    questions.push({
      question: item.question.trim(),
      options,
      correctIndex: item.correctIndex as number,
      explanation: item.explanation.trim(),
      sourceIds: [...item.sourceIds] as string[],
    });
  }
  return {
    title: value.title.trim(),
    language,
    questions,
  };
}

export type IdentifiedStudyQuizQuestion = StudyQuizQuestionPreview;
