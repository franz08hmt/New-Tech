import { describe, expect, it } from "vitest";
import {
  parseStudyQuizOutput,
  studyQuizResponseSchema,
} from "./study-quiz-validation.js";

const ids = new Set(["S1", "S2"]);
const question = (text: string, sourceIds = ["S1"]) => ({
  question: text,
  options: ["A", "B", "C", "D"],
  correctIndex: 1,
  explanation: "The evidence explains this answer.",
  sourceIds,
});
const quiz = (
  questions: unknown[] = [
    question("Supported question one?"),
    question("Supported question two?"),
    question("Supported question three?"),
  ],
) => ({
  title: "Evidence quiz",
  language: "vi",
  questions,
});

describe("Study Quiz structured output boundary", () => {
  it("accepts only the requested count, language and evidence source IDs", () => {
    expect(studyQuizResponseSchema(3).properties.questions).toMatchObject({
      minItems: 3,
      maxItems: 3,
    });
    const parsed = parseStudyQuizOutput(
      JSON.stringify(
        quiz([question("Q1?"), question("Q2?", ["S2"]), question("Q3?")]),
      ),
      3,
      "vi",
      ids,
    );
    expect(parsed?.language).toBe("vi");
    expect(parsed?.questions.map((item) => item.sourceIds)).toEqual([
      ["S1"],
      ["S2"],
      ["S1"],
    ]);
  });

  it.each([
    ["truncated JSON", '{"title":'],
    ["wrong count", JSON.stringify(quiz([question("Only one?")]))],
    [
      "unknown top-level field",
      JSON.stringify({ ...quiz(), ownerId: "foreign" }),
    ],
    [
      "unknown question field",
      JSON.stringify(
        quiz([
          { ...question("Q?"), documentUrl: "https://invalid.test" },
          question("Q2?"),
          question("Q3?"),
        ]),
      ),
    ],
    [
      "forged source",
      JSON.stringify(
        quiz([question("Q?", ["S99"]), question("Q2?"), question("Q3?")]),
      ),
    ],
    [
      "duplicate choices",
      JSON.stringify(
        quiz([
          { ...question("Q?"), options: ["A", "A", "C", "D"] },
          question("Q2?"),
          question("Q3?"),
        ]),
      ),
    ],
    ["wrong language", JSON.stringify({ ...quiz(), language: "en" })],
  ])("rejects %s", (_label, output) => {
    expect(parseStudyQuizOutput(output, 3, "vi", ids)).toBeUndefined();
  });

  it("rejects repeated question text and oversized output", () => {
    expect(
      parseStudyQuizOutput(
        JSON.stringify(
          quiz([
            question("Same?"),
            question(" same? "),
            question("A different third question?"),
          ]),
        ),
        3,
        "vi",
        ids,
      ),
    ).toBeUndefined();
    expect(
      parseStudyQuizOutput(" ".repeat(65_537), 1, "vi", ids),
    ).toBeUndefined();
  });
});
