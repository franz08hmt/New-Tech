import { Injectable } from "@nestjs/common";

export const MAX_PDF_PAGES = 200;
export const MAX_EXTRACTED_CHARACTERS = 2_000_000;
export const MAX_PDF_INPUT_BYTES = 10 * 1024 * 1024;

export interface ExtractedPdfPage {
  page: number;
  text: string;
  source?: "ocr";
}

export type PdfExtractionFailure =
  | "PDF_INVALID"
  | "PDF_ENCRYPTED"
  | "PDF_SIZE_LIMIT"
  | "PDF_PAGE_LIMIT"
  | "PDF_TEXT_LIMIT";

/** A stable, provider-free error boundary for the later ingestion pipeline. */
export class PdfExtractionError extends Error {
  constructor(readonly code: PdfExtractionFailure) {
    super("PDF text extraction failed.");
  }
}

function normalizePageText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

@Injectable()
export class PdfTextExtractorService {
  async extract(buffer: Buffer): Promise<ExtractedPdfPage[]> {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0)
      throw new PdfExtractionError("PDF_INVALID");
    if (buffer.length > MAX_PDF_INPUT_BYTES)
      throw new PdfExtractionError("PDF_SIZE_LIMIT");

    // Dynamic ESM import keeps application startup independent of PDF.js and
    // avoids loading its sizeable parser until ingestion actually needs it.
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
    });

    try {
      const document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES)
        throw new PdfExtractionError("PDF_PAGE_LIMIT");

      const pages: ExtractedPdfPage[] = [];
      let totalCharacters = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        const page = await document.getPage(pageNumber);
        try {
          const content = await page.getTextContent({
            includeMarkedContent: false,
            disableNormalization: false,
          });
          let raw = "";
          for (const item of content.items) {
            if (!("str" in item)) continue;
            raw += item.str;
            raw += item.hasEOL ? "\n" : " ";
          }
          const text = normalizePageText(raw);
          totalCharacters += text.length;
          if (totalCharacters > MAX_EXTRACTED_CHARACTERS)
            throw new PdfExtractionError("PDF_TEXT_LIMIT");
          pages.push({ page: pageNumber, text });
        } finally {
          page.cleanup();
        }
      }

      return pages;
    } catch (error: unknown) {
      if (error instanceof PdfExtractionError) throw error;
      if (
        error &&
        typeof error === "object" &&
        (error as { name?: string }).name === "PasswordException"
      )
        throw new PdfExtractionError("PDF_ENCRYPTED");
      // Parser messages can contain document details and never cross this
      // boundary or enter logs.
      throw new PdfExtractionError("PDF_INVALID");
    } finally {
      await loadingTask.destroy();
    }
  }
}
