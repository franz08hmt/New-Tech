export type DocumentTextQualityReason =
  "empty" | "page_marker_only" | "low_information" | "useful";

export interface DocumentTextQuality {
  text: string;
  useful: boolean;
  reason: DocumentTextQualityReason;
  tokenCount: number;
}

export function normalizeDocumentText(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withoutLikelyPageMarker(text: string, sourcePage?: number) {
  if (!sourcePage) return text;
  const lines = text.split("\n");
  const isMarker = (line: string) => {
    const match = line.trim().match(/^(?:page|p\.?|trang)?\s*(\d{1,4})$/iu);
    if (!match) return false;
    const value = Number(match[1]);
    return value === sourcePage || value === sourcePage + 1;
  };
  if (lines.length && isMarker(lines[0])) lines.shift();
  if (lines.length && isMarker(lines.at(-1)!)) lines.pop();
  return lines.join("\n").trim();
}

/**
 * Rejects navigation residue and isolated headings without treating every
 * short passage as bad. A compact factual sentence such as "Hạn nộp: thứ Sáu."
 * is useful; "61" or "Top Sites\n55" is not.
 */
export function assessDocumentText(
  value: string,
  sourcePage?: number,
): DocumentTextQuality {
  const normalized = normalizeDocumentText(value);
  if (!normalized)
    return { text: normalized, useful: false, reason: "empty", tokenCount: 0 };

  const text = withoutLikelyPageMarker(normalized, sourcePage);
  const assessmentText = withoutLikelyPageMarker(
    normalized.replace(/\(?\bsource\s*:[^)\n]+\)?/giu, ""),
    sourcePage,
  );
  if (!assessmentText || !/[\p{L}\p{N}]/u.test(assessmentText))
    return {
      text,
      useful: false,
      reason: "page_marker_only",
      tokenCount: 0,
    };

  const tokens =
    assessmentText.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
  const hasSentenceSignal = /[.!?;:]/u.test(assessmentText);
  const hasListSignal =
    /[•▪◦]/u.test(assessmentText) ||
    /(?:^|\n)\s*(?:[-–—]|\d+[.)])\s*\S/u.test(assessmentText);
  const headingConnectors = new Set([
    "a",
    "an",
    "and",
    "for",
    "in",
    "of",
    "on",
    "the",
    "to",
    "vs",
  ]);
  const looksLikeHeading =
    !hasSentenceSignal &&
    !hasListSignal &&
    assessmentText.split("\n").length <= 4 &&
    tokens.length > 0 &&
    tokens.every((token) => {
      const letters = token.replace(/[^\p{L}]/gu, "");
      if (!letters) return true;
      if (headingConnectors.has(letters.toLocaleLowerCase("en"))) return true;
      return (
        letters === letters.toLocaleUpperCase("en") || /^\p{Lu}/u.test(letters)
      );
    });
  const useful =
    !looksLikeHeading &&
    (tokens.length >= 5 ||
      (tokens.length >= 2 && (hasSentenceSignal || hasListSignal)) ||
      (tokens.length >= 3 && assessmentText.length >= 40) ||
      (tokens.length >= 1 && assessmentText.length >= 80));

  return {
    text,
    useful,
    reason: useful ? "useful" : "low_information",
    tokenCount: tokens.length,
  };
}

export function isUsefulDocumentText(value: string, sourcePage?: number) {
  return assessDocumentText(value, sourcePage).useful;
}
