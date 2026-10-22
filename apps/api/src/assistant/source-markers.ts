// The single definition of an inline source marker. The assistant service and
// the evaluation tooling both read it, so grounded answers, refusals and the
// evaluator cannot quietly disagree about what a marker is.
const SOURCE_LIKE_MARKER = /\[S[^\]]*\]/g;
const SOURCE_MARKER = /^\[(S[1-9][0-9]*)\]$/;
const SOURCE_ID = /^S[1-9][0-9]*$/;

export interface SourceMarkerScan {
  /** Every [S...] text in the answer, well formed or not. */
  readonly sourceLike: readonly string[];
  /** IDs of the well-formed [S<n>] markers, in order, repeats kept. */
  readonly ids: readonly string[];
  /** Some source-like text is not exactly [S<n>], e.g. [S1, S2] or [S[S1]. */
  readonly malformed: boolean;
}

export function isSourceId(value: unknown): value is string {
  return typeof value === "string" && SOURCE_ID.test(value);
}

/**
 * Judges each source-like text as a whole. Counting source-like and valid
 * matches separately would accept a valid-looking marker nested inside broken
 * syntax such as "[S[S1]".
 */
export function scanSourceMarkers(text: string): SourceMarkerScan {
  const sourceLike = [...text.matchAll(SOURCE_LIKE_MARKER)].map(
    (match) => match[0],
  );
  const ids: string[] = [];
  let malformed = false;
  for (const marker of sourceLike) {
    const valid = SOURCE_MARKER.exec(marker);
    if (valid) ids.push(valid[1]);
    else malformed = true;
  }
  return { sourceLike, ids, malformed };
}

/** Exact set equality; repeating one source in an answer is fine. */
export function sameSourceIdSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = new Set(left);
  const b = new Set(right);
  return a.size === b.size && [...a].every((id) => b.has(id));
}
