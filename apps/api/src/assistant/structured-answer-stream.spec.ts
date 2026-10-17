import { describe, expect, it } from "vitest";
import {
  CitationMarkerStreamFilter,
  StructuredAnswerStream,
} from "./structured-answer-stream.js";

describe("structured answer streaming", () => {
  it("decodes JSON string escapes across arbitrary provider chunks", () => {
    const parser = new StructuredAnswerStream();
    const chunks = [
      '{"answerable":true,',
      '"answer":"Xin chào ',
      "[S",
      '1]. Nói \\"hello\\" và cười \\uD83D',
      '\\uDE00","citationIds":["S1"]}',
    ];
    const result = chunks.map((chunk) => parser.push(chunk)).join("");

    expect(result).toBe('Xin chào [S1]. Nói "hello" và cười 😀');
    expect(JSON.parse(parser.completeRaw)).toMatchObject({ answerable: true });
  });

  it("does not expose an answer until answerable is true", () => {
    const parser = new StructuredAnswerStream();
    expect(parser.push('{"answerable":false,')).toBe("");
    expect(parser.push('"answer":"No evidence",')).toBe("");
    expect(parser.isAnswerable).toBe(false);
  });

  it("withholds both complete and chunk-split source markers", () => {
    const filter = new CitationMarkerStreamFilter();
    expect(filter.push("Claim [S")).toBe("Claim ");
    expect(filter.push("1] supported and [S2].")).toBe(" supported and .");
  });
});
