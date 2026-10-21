export type StudyFlashcardLanguage = "vi" | "en";
export interface UnidentifiedStudyFlashcard {
  front: string;
  back: string;
  sourceIds: string[];
}
export interface UnidentifiedStudyFlashcards {
  title: string;
  language: StudyFlashcardLanguage;
  cards: UnidentifiedStudyFlashcard[];
}

export const STUDY_FLASHCARDS_SCHEMA_VERSION = "study-flashcards-v1" as const;
export const STUDY_FLASHCARDS_MAX_JSON_BYTES = 65_536;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= max
  );
}

function normalizeFront(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function studyFlashcardsResponseSchema(cardCount: number) {
  return {
    type: "object",
    additionalProperties: false,
    propertyOrdering: ["title", "language", "cards"],
    required: ["title", "language", "cards"],
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120 },
      language: { type: "string", enum: ["vi", "en"] },
      cards: {
        type: "array",
        minItems: cardCount,
        maxItems: cardCount,
        items: {
          type: "object",
          additionalProperties: false,
          propertyOrdering: ["front", "back", "sourceIds"],
          required: ["front", "back", "sourceIds"],
          properties: {
            front: { type: "string", minLength: 1, maxLength: 800 },
            back: { type: "string", minLength: 1, maxLength: 1200 },
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

export function parseStudyFlashcardsOutput(
  output: string,
  cardCount: number,
  language: StudyFlashcardLanguage,
  allowedSourceIds: ReadonlySet<string>,
): UnidentifiedStudyFlashcards | undefined {
  if (
    typeof output !== "string" ||
    Buffer.byteLength(output, "utf8") > STUDY_FLASHCARDS_MAX_JSON_BYTES ||
    !Number.isInteger(cardCount) ||
    cardCount < 3 ||
    cardCount > 10 ||
    (language !== "vi" && language !== "en") ||
    allowedSourceIds.size === 0
  )
    return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["title", "language", "cards"]) ||
    !validText(parsed.title, 120) ||
    parsed.language !== language ||
    !Array.isArray(parsed.cards) ||
    parsed.cards.length !== cardCount
  )
    return undefined;

  const fronts = new Set<string>();
  const cards: UnidentifiedStudyFlashcard[] = [];
  for (const raw of parsed.cards) {
    if (
      !isRecord(raw) ||
      !hasExactKeys(raw, ["front", "back", "sourceIds"]) ||
      !validText(raw.front, 800) ||
      !validText(raw.back, 1_200) ||
      !Array.isArray(raw.sourceIds) ||
      raw.sourceIds.length < 1 ||
      raw.sourceIds.length > 5 ||
      !raw.sourceIds.every(
        (sourceId) =>
          typeof sourceId === "string" &&
          /^[A-Z][A-Z0-9]{0,11}$/.test(sourceId) &&
          allowedSourceIds.has(sourceId),
      ) ||
      new Set(raw.sourceIds).size !== raw.sourceIds.length
    )
      return undefined;
    const identity = normalizeFront(raw.front);
    if (!identity || fronts.has(identity)) return undefined;
    fronts.add(identity);
    cards.push({
      front: raw.front.trim(),
      back: raw.back.trim(),
      sourceIds: [...raw.sourceIds] as string[],
    });
  }
  return { title: parsed.title.trim(), language, cards };
}
