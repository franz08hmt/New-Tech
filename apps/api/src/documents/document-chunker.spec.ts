import { describe, expect, it } from "vitest";
import {
  CHUNK_OVERLAP_CHARACTERS,
  MAX_CHUNK_CHARACTERS,
  MIN_CHUNK_CHARACTERS,
  chunkDocumentPages,
  normalizeDocumentText,
  prepareDocumentPages,
} from "./document-chunker.js";

describe("document chunking", () => {
  it("normalizes Vietnamese Unicode and whitespace without losing accents", () => {
    expect(
      normalizeDocumentText(
        "  Quản\t lý   dự án\r\n\r\n\r\nDành cho sinh viên 👩‍🎓  ",
      ),
    ).toBe("Quản lý dự án\n\nDành cho sinh viên 👩‍🎓");
  });

  it("keeps pages separate and assigns stable document-wide indexes", () => {
    const chunks = chunkDocumentPages([
      { page: 1, text: "Nội dung trang một." },
      { page: 2, text: "Nội dung trang hai." },
    ]);
    expect(chunks).toEqual([
      { chunkIndex: 0, sourcePage: 1, content: "Nội dung trang một." },
      { chunkIndex: 1, sourcePage: 2, content: "Nội dung trang hai." },
    ]);
  });

  it("chunks a long paragraph within the maximum and carries overlap", () => {
    const words = Array.from({ length: 900 }, (_, index) => `word${index}`);
    const chunks = chunkDocumentPages([{ page: 1, text: words.join(" ") }]);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(MAX_CHUNK_CHARACTERS);
      expect(chunk.content.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARACTERS);
      expect(chunk.sourcePage).toBe(1);
    }
    const firstWords = new Set(chunks[0].content.split(" "));
    expect(
      chunks[1].content.split(" ").some((word) => firstWords.has(word)),
    ).toBe(true);
    expect(CHUNK_OVERLAP_CHARACTERS).toBe(200);
  });

  it("never splits a surrogate pair even when one word exceeds the limit", () => {
    const chunks = chunkDocumentPages([
      { page: 1, text: `${"a".repeat(1799)}👩${"b".repeat(1900)}` },
    ]);
    expect(chunks.join("")).not.toContain("�");
    expect(chunks.some(({ content }) => content.includes("👩"))).toBe(true);
  });

  it("ignores empty pages but keeps a short page when it is the whole page", () => {
    expect(
      chunkDocumentPages([
        { page: 1, text: " \n\t " },
        { page: 2, text: "Mục tiêu ngắn." },
      ]),
    ).toEqual([{ chunkIndex: 0, sourcePage: 2, content: "Mục tiêu ngắn." }]);
  });

  it("rejects page markers and isolated headings but keeps short facts", () => {
    const prepared = prepareDocumentPages([
      { page: 1, text: "1" },
      { page: 2, text: "Top Sites\n3" },
      { page: 3, text: "P2P\n4" },
      { page: 4, text: "Growth of the Internet\n5" },
      { page: 5, text: "Web browsers\n6\n(source: StatCounter)" },
      { page: 6, text: "Hạn nộp: thứ Sáu." },
      { page: 7, text: "Use TLS." },
    ]);

    expect(
      prepared.chunks.map(({ sourcePage, content }) => ({
        sourcePage,
        content,
      })),
    ).toEqual([
      { sourcePage: 6, content: "Hạn nộp: thứ Sáu." },
      { sourcePage: 7, content: "Use TLS." },
    ]);
    expect(prepared.quality).toEqual({
      totalPageCount: 7,
      usefulTextPageCount: 2,
      lowTextPageCount: 5,
      skippedPageNumbers: [1, 2, 3, 4, 5],
      needsOcr: true,
      ocrPageNumbers: [],
    });
  });

  it("keeps meaningful numbers inside informative content", () => {
    expect(
      chunkDocumentPages([
        { page: 7, text: "Điểm tối thiểu: 8.5 và hạn nộp ngày 15/10." },
      ])[0].content,
    ).toContain("8.5");
  });

  it("is deterministic and rejects a non-increasing page sequence", () => {
    const pages = [
      { page: 1, text: `${"Đoạn thứ nhất. ".repeat(120)}\n\nĐoạn cuối.` },
    ];
    expect(chunkDocumentPages(pages)).toEqual(chunkDocumentPages(pages));
    expect(() =>
      chunkDocumentPages([
        { page: 2, text: "a" },
        { page: 2, text: "b" },
      ]),
    ).toThrowError(expect.objectContaining({ code: "INVALID_PAGE_SEQUENCE" }));
  });
});
