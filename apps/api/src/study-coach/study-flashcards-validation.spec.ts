import { describe, expect, it } from "vitest";
import {
  parseStudyFlashcardsOutput,
  studyFlashcardsResponseSchema,
} from "./study-flashcards-validation.js";

const sources = new Set(["S1", "S2"]);
const card = (front: string, sourceIds = ["S1"]) => ({
  front,
  back: `Evidence-backed answer for ${front}`,
  sourceIds,
});
const deck = (
  cards: unknown[] = [
    card("First supported concept"),
    card("Second supported concept"),
    card("Third supported concept"),
  ],
) => ({ title: "Evidence cards", language: "vi", cards });

describe("Study Flashcards strict structured output boundary", () => {
  it("accepts only the requested language/count and server-issued evidence references", () => {
    expect(studyFlashcardsResponseSchema(3).properties.cards).toMatchObject({
      minItems: 3,
      maxItems: 3,
    });
    const parsed = parseStudyFlashcardsOutput(
      JSON.stringify(
        deck([
          card("Concept one", ["S1"]),
          card("Concept two", ["S2"]),
          card("Concept three"),
        ]),
      ),
      3,
      "vi",
      sources,
    );
    expect(parsed).toEqual({
      title: "Evidence cards",
      language: "vi",
      cards: [
        card("Concept one", ["S1"]),
        card("Concept two", ["S2"]),
        card("Concept three"),
      ],
    });
  });

  it.each([
    ["malformed JSON", '{"title":'],
    [
      "unknown top-level fields",
      JSON.stringify({ ...deck(), ownerId: "foreign" }),
    ],
    [
      "unknown card fields",
      JSON.stringify(
        deck([
          card("A"),
          { ...card("B"), url: "https://invalid.test" },
          card("C"),
        ]),
      ),
    ],
    ["wrong card count", JSON.stringify(deck([card("Only one")]))],
    ["wrong language", JSON.stringify({ ...deck(), language: "fr" })],
    [
      "forged source",
      JSON.stringify(deck([card("A", ["S99"]), card("B"), card("C")])),
    ],
    [
      "empty content",
      JSON.stringify(deck([card("   "), card("B"), card("C")])),
    ],
    [
      "duplicate normalized fronts",
      JSON.stringify(deck([card("Café"), card(" Cafe\u0301 "), card("Other")])),
    ],
  ])("rejects %s", (_label, output) => {
    expect(
      parseStudyFlashcardsOutput(output, 3, "vi", sources),
    ).toBeUndefined();
  });

  it("rejects front/back text beyond limits and output beyond 64 KiB", () => {
    expect(
      parseStudyFlashcardsOutput(
        JSON.stringify(deck([card("x".repeat(801)), card("B"), card("C")])),
        3,
        "vi",
        sources,
      ),
    ).toBeUndefined();
    expect(
      parseStudyFlashcardsOutput(
        JSON.stringify(
          deck([
            card("A"),
            { front: "B", back: "y".repeat(1201), sourceIds: ["S1"] },
            card("C"),
          ]),
        ),
        3,
        "vi",
        sources,
      ),
    ).toBeUndefined();
    expect(
      parseStudyFlashcardsOutput(" ".repeat(65_537), 3, "vi", sources),
    ).toBeUndefined();
  });

  it("rejects an unsupported empty-evidence selection without accepting guessed sources", () => {
    expect(
      parseStudyFlashcardsOutput(JSON.stringify(deck()), 3, "en", new Set()),
    ).toBeUndefined();
  });
});
