import type { ExtractedPdfPage } from "./pdf-text-extractor.service.js";
import {
  assessDocumentText,
  normalizeDocumentText,
} from "./document-text-quality.js";

export { normalizeDocumentText } from "./document-text-quality.js";

export const TARGET_CHUNK_CHARACTERS = 1_200;
export const MAX_CHUNK_CHARACTERS = 1_800;
export const CHUNK_OVERLAP_CHARACTERS = 200;
export const MIN_CHUNK_CHARACTERS = 80;
export const MAX_DOCUMENT_CHUNKS = 2_000;

export interface DocumentChunk {
  chunkIndex: number;
  sourcePage: number;
  content: string;
}

export type DocumentChunkingFailure =
  "INVALID_PAGE_SEQUENCE" | "CHUNK_LIMIT" | "NO_USEFUL_TEXT";

export class DocumentChunkingError extends Error {
  constructor(readonly code: DocumentChunkingFailure) {
    super("Document chunking failed.");
  }
}

function nearestBoundary(
  text: string,
  start: number,
  idealEnd: number,
  maxEnd: number,
) {
  const minEnd = Math.min(
    maxEnd,
    start + Math.floor(TARGET_CHUNK_CHARACTERS * 0.65),
  );
  const region = text.slice(minEnd, maxEnd);
  const patterns = [/\n{2,}/g, /[.!?…]["”’')\]]*\s+/gu, /\n+/g, /\s+/gu];

  for (const pattern of patterns) {
    let selected: number | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const match of region.matchAll(pattern)) {
      const candidate = minEnd + match.index + match[0].length;
      const candidateDistance = Math.abs(candidate - idealEnd);
      if (candidateDistance < distance) {
        selected = candidate;
        distance = candidateDistance;
      }
    }
    if (selected !== undefined) return selected;
  }
  return maxEnd;
}

function preserveSurrogatePair(text: string, position: number) {
  if (
    position > 0 &&
    position < text.length &&
    /[\uD800-\uDBFF]/.test(text[position - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[position])
  )
    return position - 1;
  return position;
}

function overlapStart(text: string, pageStart: number, end: number) {
  const desired = Math.max(pageStart + 1, end - CHUNK_OVERLAP_CHARACTERS);
  for (let offset = 0; offset <= 48; offset++) {
    const backward = desired - offset;
    if (backward > pageStart && /\s/u.test(text[backward - 1])) return backward;
    const forward = desired + offset;
    if (forward < end && /\s/u.test(text[forward - 1])) return forward;
  }
  return preserveSurrogatePair(text, desired);
}

function chunkPage(text: string) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const remaining = text.length - start;
    let end: number;
    if (remaining <= MAX_CHUNK_CHARACTERS) {
      end = text.length;
    } else {
      const idealEnd = Math.min(text.length, start + TARGET_CHUNK_CHARACTERS);
      const maxEnd = Math.min(text.length, start + MAX_CHUNK_CHARACTERS);
      end = nearestBoundary(text, start, idealEnd, maxEnd);
    }
    end = preserveSurrogatePair(text, end);
    if (end <= start) end = Math.min(text.length, start + MAX_CHUNK_CHARACTERS);

    const content = text.slice(start, end).trim();
    if (content) chunks.push(content);
    if (end >= text.length) break;
    const next = overlapStart(text, start, end);
    start = next > start && next < end ? next : end;
  }

  if (chunks.length > 1 && chunks.at(-1)!.length < MIN_CHUNK_CHARACTERS) {
    const tail = chunks.pop()!;
    const previous = chunks.pop()!;
    const combined = `${previous} ${tail}`;
    // This path is rare because every non-initial chunk normally contains the
    // configured overlap. Never discard the tail: if one merged chunk would
    // exceed the limit, borrow a suffix from the previous chunk so the final
    // one is useful while retaining every character.
    if (combined.length <= MAX_CHUNK_CHARACTERS) chunks.push(combined);
    else {
      chunks.push(previous);
      chunks.push(`${previous.slice(-MIN_CHUNK_CHARACTERS)} ${tail}`.trim());
    }
  }
  return chunks;
}

export interface DocumentIndexQuality {
  totalPageCount: number;
  usefulTextPageCount: number;
  lowTextPageCount: number;
  skippedPageNumbers: number[];
  needsOcr: boolean;
  ocrPageNumbers: number[];
}

export interface PreparedDocument {
  chunks: DocumentChunk[];
  quality: DocumentIndexQuality;
}

/** Evaluates and chunks pages independently so every citation stays exact. */
export function prepareDocumentPages(
  pages: ExtractedPdfPage[],
): PreparedDocument {
  const result: DocumentChunk[] = [];
  const skippedPageNumbers: number[] = [];
  let previousPage = 0;
  for (const page of pages) {
    if (!Number.isInteger(page.page) || page.page <= previousPage)
      throw new DocumentChunkingError("INVALID_PAGE_SEQUENCE");
    previousPage = page.page;
    const quality = assessDocumentText(page.text, page.page);
    if (!quality.useful) {
      skippedPageNumbers.push(page.page);
      continue;
    }
    for (const content of chunkPage(quality.text)) {
      if (result.length >= MAX_DOCUMENT_CHUNKS)
        throw new DocumentChunkingError("CHUNK_LIMIT");
      result.push({
        chunkIndex: result.length,
        sourcePage: page.page,
        content,
      });
    }
  }
  return {
    chunks: result,
    quality: {
      totalPageCount: pages.length,
      usefulTextPageCount: pages.length - skippedPageNumbers.length,
      lowTextPageCount: skippedPageNumbers.length,
      skippedPageNumbers,
      needsOcr: skippedPageNumbers.length > 0,
      ocrPageNumbers: pages
        .filter((page) => page.source === "ocr")
        .map((page) => page.page),
    },
  };
}

/** Compatibility helper for callers that only need the chunks. */
export function chunkDocumentPages(pages: ExtractedPdfPage[]): DocumentChunk[] {
  return prepareDocumentPages(pages).chunks;
}
