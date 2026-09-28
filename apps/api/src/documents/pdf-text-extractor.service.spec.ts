import { describe, expect, it } from "vitest";
import {
  MAX_PDF_INPUT_BYTES,
  MAX_PDF_PAGES,
  PdfTextExtractorService,
} from "./pdf-text-extractor.service.js";

function pdfString(value: string) {
  return value.replace(/([\\()])/g, "\\$1");
}

/** Creates a small, synthetic PDF fixture without user documents or secrets. */
function makePdf(pageTexts: string[]) {
  const objects: string[] = [];
  const pageObjectIds = pageTexts.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (const [index, value] of pageTexts.entries()) {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const command = value
      ? `BT /F1 12 Tf 72 720 Td (${pdfString(value)}) Tj ET`
      : "BT ET";
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(command)} >>\nstream\n${command}\nendstream`;
  }

  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n`;
  output += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id++)
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

describe("PDF text extraction", () => {
  const extractor = new PdfTextExtractorService();

  it("extracts text page by page and preserves one-based page numbers", async () => {
    await expect(
      extractor.extract(makePdf(["First page source", "Second page evidence"])),
    ).resolves.toEqual([
      { page: 1, text: "First page source" },
      { page: 2, text: "Second page evidence" },
    ]);
  });

  it("keeps empty pages when another page contains searchable text", async () => {
    await expect(
      extractor.extract(makePdf(["", "Usable source"])),
    ).resolves.toEqual([
      { page: 1, text: "" },
      { page: 2, text: "Usable source" },
    ]);
  });

  it("keeps empty pages so the OCR stage can recover image-only documents", async () => {
    await expect(extractor.extract(makePdf(["", ""]))).resolves.toEqual([
      { page: 1, text: "" },
      { page: 2, text: "" },
    ]);
  });

  it("sanitizes corrupt input and does not expose parser details", async () => {
    await expect(
      extractor.extract(Buffer.from("%PDF-not-a-valid-document")),
    ).rejects.toMatchObject({
      code: "PDF_INVALID",
      message: "PDF text extraction failed.",
    });
  });

  it("rejects oversized input before loading the parser", async () => {
    await expect(
      extractor.extract(Buffer.alloc(MAX_PDF_INPUT_BYTES + 1)),
    ).rejects.toMatchObject({ code: "PDF_SIZE_LIMIT" });
  });

  it("rejects documents over the configured page limit before reading pages", async () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 1 }, () => "x");
    await expect(extractor.extract(makePdf(pages))).rejects.toMatchObject({
      code: "PDF_PAGE_LIMIT",
    });
  });
});
